import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitCommandRunner {
	run(args: readonly string[], cwd: string): Promise<string>;
}

/**
 * Runs Git without a command shell. Passing arguments separately preserves
 * spaces in paths and prevents file names from being interpreted as commands.
 */
class ProcessGitCommandRunner implements GitCommandRunner {
	async run(args: readonly string[], cwd: string): Promise<string> {
		const { stdout } = await execFileAsync('git', [...args], {
			cwd,
			encoding: 'utf8',
			maxBuffer: 10 * 1024 * 1024,
		});

		return stdout;
	}
}

/**
 * Provides repository data as plain strings and paths, keeping Git behavior
 * reusable by the extension, a future CLI, or another presentation layer.
 */
export class GitService {
	constructor(
		private readonly workspacePath: string,
		private readonly runner: GitCommandRunner = new ProcessGitCommandRunner(),
	) {}

	async getChangedFiles(): Promise<string[]> {
		// NUL delimiters preserve unusual file names without quote parsing.
		const output = await this.runner.run(
			['status', '--porcelain=v1', '-z', '--untracked-files=all'],
			this.workspacePath,
		);

		return this.parseChangedFiles(output);
	}

	async getDiff(filePath?: string): Promise<string> {
		// Comparing with HEAD includes staged and unstaged tracked changes.
		const args = ['diff', '--no-ext-diff', '--binary', 'HEAD'];

		if (filePath) {
			// The separator prevents a path from being interpreted as a revision.
			args.push('--', filePath);
		}

		return this.runner.run(args, this.workspacePath);
	}

	private parseChangedFiles(output: string): string[] {
		// Porcelain v1 records begin with two status columns and one space.
		const records = output.split('\0');
		const changedFiles = new Set<string>();

		for (let index = 0; index < records.length; index += 1) {
			const record = records[index];
			if (record.length < 4 || record.startsWith('!! ')) {
				continue;
			}

			changedFiles.add(record.slice(3));
			if (this.isRenameOrCopy(record.slice(0, 2))) {
				// With -z, rename/copy source paths are stored in the next record.
				index += 1;
			}
		}

		return [...changedFiles];
	}

	private isRenameOrCopy(status: string): boolean {
		return status.includes('R') || status.includes('C');
	}
}
