import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	createPopupSummary,
	DocumentationDriftWorkflow,
	WorkflowGitService,
	WorkflowLogger,
} from '../services/DocumentationDriftWorkflow';

class StubGitService implements WorkflowGitService {
	readonly diffRequests: Array<string | undefined> = [];

	constructor(
		private readonly repository: boolean,
		private readonly files: string[] = [],
		private readonly diff = '',
	) {}

	async isRepository(): Promise<boolean> {
		return this.repository;
	}

	async getChangedFiles(): Promise<string[]> {
		return this.files;
	}

	async getDiff(filePath?: string): Promise<string> {
		this.diffRequests.push(filePath);
		return this.diff;
	}
}

class CapturingLogger implements WorkflowLogger {
	readonly entries: Array<{ message: string; value?: unknown }> = [];

	debug(message: string, value?: unknown): void {
		this.entries.push({ message, value });
	}
}

suite('DocumentationDriftWorkflow', () => {
	let workspacePath: string;

	setup(async () => {
		workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-workflow-'));
	});

	teardown(async () => {
		await fs.rm(workspacePath, { recursive: true, force: true });
	});

	test('handles non-Git workspaces gracefully', async () => {
		const logger = new CapturingLogger();
		const workflow = createWorkflow(new StubGitService(false), logger);

		const result = await workflow.run();

		assert.strictEqual(result.isGitRepository, false);
		assert.deepStrictEqual(result.changedFiles, []);
		assert.strictEqual(result.driftReport.findings.length, 0);
		assert.match(result.outputReport, /## Git status\nNot a Git repository/);
		assert.strictEqual(
			createPopupSummary(result),
			'Documentation Drift: workspace is not a Git repository.',
		);
		assertLog(logger, '[GitService] Repository detected: false');
	});

	test('handles an empty Git workspace with no findings', async () => {
		const logger = new CapturingLogger();
		const workflow = createWorkflow(new StubGitService(true), logger);

		const result = await workflow.run();

		assert.strictEqual(result.isGitRepository, true);
		assert.deepStrictEqual(result.documentationIndex.documents, []);
		assert.deepStrictEqual(result.codeAnalysis, { functions: [], classes: [] });
		assert.strictEqual(result.driftReport.findings.length, 0);
		assert.match(result.outputReport, /## Documentation files scanned\n- None/);
		assert.strictEqual(
			createPopupSummary(result),
			'Documentation Drift: no drift findings detected.',
		);
	});

	test('executes the successful workflow and returns no findings', async () => {
		await writeFile('src/api.ts', 'export function greet(name: string): string { return name; }');
		await writeFile('README.md', 'Use `greet` to format a message.');
		const gitService = new StubGitService(true, ['src/api.ts'], 'diff --git');
		const logger = new CapturingLogger();

		const result = await createWorkflow(gitService, logger).run();

		assert.deepStrictEqual(result.changedFiles, ['src/api.ts']);
		assert.strictEqual(result.diff, 'diff --git');
		assert.strictEqual(gitService.diffRequests.length, 1);
		assert.deepStrictEqual(
			result.codeAnalysis.functions.map((api) => api.signature),
			['greet(name: string): string'],
		);
		assert.deepStrictEqual(
			result.documentationIndex.documents.map((document) => document.path),
			['README.md'],
		);
		assert.strictEqual(result.driftReport.findings.length, 0);
		assertLog(logger, '[Command] Started');
		assertLog(logger, '[CodeAnalyzer] Exported APIs:', 1);
		assertLog(logger, '[DocumentationScanner] Documentation files:', 1);
		assertLog(logger, '[DriftDetector] Findings:', 0);
	});

	test('generates findings when exported APIs are missing from docs', async () => {
		await writeFile('src/api.ts', 'export function calculate(): number { return 1; }');
		await writeFile('docs/guide.md', 'Use the public API from this package.');

		const result = await createWorkflow(
			new StubGitService(true, ['src/api.ts']),
			new CapturingLogger(),
		).run();

		assert.deepStrictEqual(
			result.driftReport.findings.map((finding) => finding.apiName),
			['calculate'],
		);
		assert.strictEqual(
			createPopupSummary(result),
			'Documentation Drift: 1 drift finding(s) detected.',
		);
		assert.match(result.outputReport, /Exported function "calculate"/);
	});

	test('creates an OutputChannel-ready report with required sections', async () => {
		await writeFile('src/api.ts', 'export class CheckoutClient {}');
		await writeFile('examples/basic.ts', 'const client = new CheckoutClient();');

		const result = await createWorkflow(
			new StubGitService(true, ['src/api.ts'], 'example diff'),
			new CapturingLogger(),
		).run();

		for (const section of [
			'## Workspace',
			'## Git status',
			'## Changed files',
			'## Documentation files scanned',
			'## Exported APIs found',
			'## Drift findings',
		]) {
			assert.match(result.outputReport, new RegExp(section));
		}
		assert.match(result.outputReport, /class CheckoutClient/);
	});

	function createWorkflow(
		gitService: WorkflowGitService,
		logger: WorkflowLogger,
	): DocumentationDriftWorkflow {
		return new DocumentationDriftWorkflow(
			workspacePath,
			{ documentationScanPaths: ['README.md', 'docs', 'examples'] },
			{ gitService, logger },
		);
	}

	async function writeFile(relativePath: string, content: string): Promise<void> {
		const filePath = path.join(workspacePath, relativePath);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, content);
	}

	function assertLog(
		logger: CapturingLogger,
		message: string,
		value?: unknown,
	): void {
		const entry = logger.entries.find((item) => item.message === message);
		assert.ok(entry, `Missing log entry: ${message}`);
		if (value !== undefined) {
			assert.deepStrictEqual(entry.value, value);
		}
	}
});
