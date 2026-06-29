import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodeAnalysis } from '../analyzers/CodeAnalyzer';
import { JsAnalyzer } from '../analyzers/JsAnalyzer';
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

class TrackingJsAnalyzer extends JsAnalyzer {
	calls = 0;

	override analyze(sourceText: string, fileName = 'source.js'): CodeAnalysis {
		this.calls += 1;
		return super.analyze(sourceText, fileName);
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
		assertLog(logger, '[AnalyzerFactory] Merged exported APIs:', 1);
		assertLog(logger, '[DocumentationScanner] Documentation files:', 1);
		assertLog(logger, '[DriftDetector] Findings:', 0);
	});

	test('routes JavaScript and TypeScript files through the shared workflow', async () => {
		await writeFile('src/typescript.ts', 'export function typed(value: string): string {}');
		await writeFile('src/component.tsx', 'export function component(): void {}');
		await writeFile('src/javascript.js', 'export const javascript = (value) => value;');
		await writeFile('src/module.mjs', 'export function moduleApi() {}');
		await writeFile('src/common.cjs', 'export class CommonApi {}');
		await writeFile('README.md', 'typed component javascript moduleApi CommonApi');
		const files = [
			'src/typescript.ts',
			'src/component.tsx',
			'src/javascript.js',
			'src/module.mjs',
			'src/common.cjs',
		];

		const result = await createWorkflow(
			new StubGitService(true, files),
			new CapturingLogger(),
		).run();

		assert.deepStrictEqual(
			result.codeAnalysis.functions.map((api) => api.name),
			['typed', 'component', 'javascript', 'moduleApi'],
		);
		assert.deepStrictEqual(result.codeAnalysis.classes, [{ name: 'CommonApi' }]);
		assert.strictEqual(
			result.codeAnalysis.functions.find((api) => api.name === 'typed')?.returnType,
			'string',
		);
		assert.strictEqual(
			result.codeAnalysis.functions.find((api) => api.name === 'javascript')?.returnType,
			'unknown',
		);
		assert.match(
			result.outputReport,
			/function typed\(value: string\): string/,
		);
		assert.match(
			result.outputReport,
			/function javascript\(value: unknown\): unknown/,
		);
		assert.match(result.outputReport, /function moduleApi\(\): unknown/);
		assert.match(result.outputReport, /class CommonApi/);
	});

	test('merges users.ts and users.js APIs into the OutputChannel report', async () => {
		await writeFile(
			'src/users.ts',
			'export function createUser(name: string, email: string, password: string) {}',
		);
		await writeFile('src/users.js', `
			export function createUser(name, email, password) {}
			export class UserService {}
			export const deleteUser = (id) => {};
			export function loginUser(username, password) {}
		`);
		await writeFile(
			'README.md',
			'createUser UserService deleteUser loginUser',
		);
		const logger = new CapturingLogger();

		const result = await createWorkflow(
			new StubGitService(true, ['src/users.ts', 'src/users.js']),
			logger,
		).run();

		assert.deepStrictEqual(
			result.codeAnalysis.functions.map((api) => api.name),
			['createUser', 'createUser', 'loginUser', 'deleteUser'],
		);
		assert.deepStrictEqual(result.codeAnalysis.classes, [{ name: 'UserService' }]);
		assert.match(
			result.outputReport,
			/function createUser\(name: string, email: string, password: string\): unknown/,
		);
		assert.match(
			result.outputReport,
			/function createUser\(name: unknown, email: unknown, password: unknown\): unknown/,
		);
		assert.match(result.outputReport, /function deleteUser\(id: unknown\): unknown/);
		assert.match(
			result.outputReport,
			/function loginUser\(username: unknown, password: unknown\): unknown/,
		);
		assert.match(result.outputReport, /class UserService/);
		const javaScriptLog = logger.entries.find((entry) =>
			entry.message === '[AnalyzerFactory] Analyzed source file:' &&
			isFileAnalysisLog(entry.value, 'src/users.js'),
		);
		assert.deepStrictEqual(javaScriptLog?.value, {
			filePath: 'src/users.js',
			analyzer: 'JsAnalyzer',
			exportedApis: 4,
		});
	});

	test('reports all exported APIs when only users.js changed', async () => {
		await writeFile('src/users.js', `
			export function createUser(name, email, password) {
				return { name, email, password };
			}
			export class UserService {
				createUser(name, email, password) {
					return createUser(name, email, password);
				}
			}
			export const deleteUser = async (id) => {
				return { deleted: true, id };
			};
			export default function loginUser(username, password) {
				return { username, authenticated: true };
			}
		`);
		await writeFile(
			'README.md',
			'createUser UserService deleteUser loginUser',
		);
		const logger = new CapturingLogger();

		const result = await createWorkflow(
			new StubGitService(true, ['src/users.js']),
			logger,
		).run();

		assert.deepStrictEqual(
			result.codeAnalysis.functions.map((api) => api.name),
			['createUser', 'loginUser', 'deleteUser'],
		);
		assert.deepStrictEqual(result.codeAnalysis.classes, [{ name: 'UserService' }]);
		for (const api of ['createUser', 'deleteUser', 'loginUser', 'UserService']) {
			assert.match(result.outputReport, new RegExp(api));
		}
		const analysisLog = logger.entries.find((entry) =>
			entry.message === '[AnalyzerFactory] Analyzed source file:' &&
			isFileAnalysisLog(entry.value, 'src/users.js'),
		);
		assert.deepStrictEqual(analysisLog?.value, {
			filePath: 'src/users.js',
			analyzer: 'JsAnalyzer',
			exportedApis: 4,
		});
		assertLog(logger, '[AnalyzerFactory] Source files selected:', [
			'src/users.js',
		]);
		assertLog(logger, '[AnalyzerFactory] Changed files received:', [
			'src/users.js',
		]);
		assertLog(logger, '[AnalyzerFactory] Skipped unsupported changed files:', []);
		assertLog(logger, '[AnalyzerFactory] Merged exported APIs:', 4);
	});

	test('skips a missing changed JavaScript file before analysis', async () => {
		const analyzer = new TrackingJsAnalyzer();
		const missingFileError = Object.assign(new Error('File not found'), {
			code: 'ENOENT',
		});
		const logger = new CapturingLogger();
		const workflow = new DocumentationDriftWorkflow(
			workspacePath,
			{ documentationScanPaths: ['README.md'] },
			{
				gitService: new StubGitService(true, ['src/users.js']),
				jsAnalyzer: analyzer,
				logger,
				readFile: async () => {
					throw missingFileError;
				},
			},
		);

		const result = await workflow.run();

		assert.strictEqual(analyzer.calls, 0);
		assert.deepStrictEqual(result.codeAnalysis, { functions: [], classes: [] });
		assertLog(logger, '[AnalyzerFactory] Skipped missing changed source file:', {
			filePath: 'src/users.js',
			error: 'File not found',
		});
	});

	test('skips unreadable source files and completes the workflow', async () => {
		const logger = new CapturingLogger();
		const workflow = new DocumentationDriftWorkflow(
			workspacePath,
			{ documentationScanPaths: ['README.md'] },
			{
				gitService: new StubGitService(true, ['src/unreadable.js']),
				logger,
				readFile: async () => {
					throw new Error('Access denied');
				},
			},
		);

		const result = await workflow.run();

		assert.deepStrictEqual(result.codeAnalysis, { functions: [], classes: [] });
		assert.strictEqual(result.driftReport.findings.length, 0);
		assertLog(logger, '[AnalyzerFactory] Skipped unreadable changed source file:');
		assertLog(logger, '[DocumentationScanner] Documentation files:', 0);
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

function isFileAnalysisLog(value: unknown, filePath: string): boolean {
	return typeof value === 'object' &&
		value !== null &&
		'filePath' in value &&
		value.filePath === filePath;
}
