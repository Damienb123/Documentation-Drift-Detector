import * as assert from 'node:assert';
import { GitCommandRunner, GitService } from '../services/GitService';

class StubGitCommandRunner implements GitCommandRunner {
	readonly calls: Array<{ args: readonly string[]; cwd: string }> = [];

	constructor(
		private readonly output: string,
		private readonly error?: Error,
	) {}

	async run(args: readonly string[], cwd: string): Promise<string> {
		this.calls.push({ args, cwd });
		if (this.error) {
			throw this.error;
		}

		return this.output;
	}
}

suite('GitService', () => {
	test('returns no files for a clean worktree', async () => {
		const service = new GitService('/workspace', new StubGitCommandRunner(''));

		const changedFiles = await service.getChangedFiles();

		assert.deepStrictEqual(changedFiles, []);
	});

	test('detects modified, untracked, and renamed files', async () => {
		const runner = new StubGitCommandRunner(
			' M src/changed.ts\0?? docs/new.md\0R  src/renamed.ts\0src/old.ts\0',
		);
		const service = new GitService('C:\\workspace', runner);

		const changedFiles = await service.getChangedFiles();

		assert.deepStrictEqual(changedFiles, [
			'src/changed.ts',
			'docs/new.md',
			'src/renamed.ts',
		]);
		assert.deepStrictEqual(runner.calls[0], {
			args: ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
			cwd: 'C:\\workspace',
		});
	});

	test('detects staged, deleted, conflicted, and copied files', async () => {
		const runner = new StubGitCommandRunner(
			'A  src/added.ts\0 D src/deleted.ts\0UU src/conflict.ts\0' +
			'C  src/copied.ts\0src/original.ts\0',
		);
		const service = new GitService('/workspace', runner);

		const changedFiles = await service.getChangedFiles();

		assert.deepStrictEqual(changedFiles, [
			'src/added.ts',
			'src/deleted.ts',
			'src/conflict.ts',
			'src/copied.ts',
		]);
	});

	test('preserves spaces and removes duplicate paths', async () => {
		const runner = new StubGitCommandRunner(
			' M src/file with spaces.ts\0M  src/file with spaces.ts\0',
		);
		const service = new GitService('/workspace', runner);

		const changedFiles = await service.getChangedFiles();

		assert.deepStrictEqual(changedFiles, ['src/file with spaces.ts']);
	});

	test('reads the complete workspace diff', async () => {
		const runner = new StubGitCommandRunner('diff output');
		const service = new GitService('/workspace', runner);

		const diff = await service.getDiff();

		assert.strictEqual(diff, 'diff output');
		assert.deepStrictEqual(runner.calls[0].args, [
			'diff',
			'--no-ext-diff',
			'--binary',
			'HEAD',
		]);
		assert.strictEqual(runner.calls[0].cwd, '/workspace');
	});

	test('reads a diff for one file without invoking a shell', async () => {
		const runner = new StubGitCommandRunner('file diff');
		const service = new GitService('/workspace', runner);

		await service.getDiff('src/file with spaces.ts');

		assert.deepStrictEqual(runner.calls[0].args, [
			'diff',
			'--no-ext-diff',
			'--binary',
			'HEAD',
			'--',
			'src/file with spaces.ts',
		]);
	});

	test('propagates Git command failures', async () => {
		const gitError = new Error('not a git repository');
		const runner = new StubGitCommandRunner('', gitError);
		const service = new GitService('/workspace', runner);

		await assert.rejects(service.getChangedFiles(), gitError);
		await assert.rejects(service.getDiff(), gitError);
	});
});
