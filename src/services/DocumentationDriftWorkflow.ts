import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CodeAnalysis, CodeAnalyzer } from '../analyzers/CodeAnalyzer';
import {
	DocumentationDocument,
	DocumentationIndex,
	DocumentationIndexData,
} from '../scanners/DocumentationIndex';
import {
	DocumentationDriftDetector,
	DocumentationDriftFinding,
	DocumentationDriftReport,
} from './DocumentationDriftDetector';
import { GitService } from './GitService';

export interface DocumentationDriftWorkflowOptions {
	documentationScanPaths: string[];
}

export interface WorkflowGitService {
	isRepository(): Promise<boolean>;
	getChangedFiles(): Promise<string[]>;
	getDiff(filePath?: string): Promise<string>;
}

export interface WorkflowLogger {
	debug(message: string, value?: unknown): void;
}

export interface WorkflowDependencies {
	gitService?: WorkflowGitService;
	codeAnalyzer?: CodeAnalyzer;
	documentationIndex?: DocumentationIndex;
	driftDetector?: DocumentationDriftDetector;
	logger?: WorkflowLogger;
	readFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
}

export interface DocumentationDriftWorkflowResult {
	workspacePath: string;
	isGitRepository: boolean;
	gitStatus: string;
	diff: string;
	changedFiles: string[];
	documentationIndex: DocumentationIndexData;
	codeAnalysis: CodeAnalysis;
	driftReport: DocumentationDriftReport;
	outputReport: string;
}

export class DocumentationDriftWorkflow {
	private readonly gitService: WorkflowGitService;
	private readonly codeAnalyzer: CodeAnalyzer;
	private readonly documentationIndex: DocumentationIndex;
	private readonly driftDetector: DocumentationDriftDetector;
	private readonly logger: WorkflowLogger;
	private readonly readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;

	constructor(
		private readonly workspacePath: string,
		options: DocumentationDriftWorkflowOptions,
		dependencies: WorkflowDependencies = {},
	) {
		this.gitService = dependencies.gitService ?? new GitService(workspacePath);
		this.codeAnalyzer = dependencies.codeAnalyzer ?? new CodeAnalyzer();
		this.documentationIndex = dependencies.documentationIndex ??
			new DocumentationIndex(workspacePath, undefined, {
				scanPaths: options.documentationScanPaths,
			});
		this.driftDetector = dependencies.driftDetector ??
			new DocumentationDriftDetector();
		this.logger = dependencies.logger ?? console;
		this.readFile = dependencies.readFile ?? fs.readFile;
	}

	async run(): Promise<DocumentationDriftWorkflowResult> {
		this.logger.debug('[Command] Started');
		const gitState = await this.readGitState();
		const codeAnalysis = await this.analyzeChangedFiles(gitState.changedFiles);
		const documentationIndex = await this.documentationIndex.build();
		const driftReport = this.driftDetector.detect(
			codeAnalysis,
			documentationIndex,
		);

		this.logDocumentationStage(documentationIndex.documents);
		this.logDriftStage(driftReport.findings);

		const result = this.createResult(gitState, codeAnalysis, documentationIndex, driftReport);
		this.logger.debug('[OutputChannel] Report generated');
		return result;
	}

	private async readGitState(): Promise<{
		isGitRepository: boolean;
		gitStatus: string;
		diff: string;
		changedFiles: string[];
	}> {
		const isGitRepository = await this.gitService.isRepository();
		if (!isGitRepository) {
			this.logger.debug('[GitService] Repository detected: false');
			return {
				isGitRepository,
				gitStatus: 'Not a Git repository',
				diff: '',
				changedFiles: [],
			};
		}

		const changedFiles = await this.gitService.getChangedFiles();
		const diff = await this.gitService.getDiff();
		this.logger.debug('[GitService] Changed files:', changedFiles.length);
		return {
			isGitRepository,
			gitStatus: 'Git repository detected',
			diff,
			changedFiles,
		};
	}

	private async analyzeChangedFiles(changedFiles: string[]): Promise<CodeAnalysis> {
		const analyses = await Promise.all(
			changedFiles
				.filter(isTypeScriptSourceFile)
				.map((filePath) => this.analyzeFile(filePath)),
		);
		const codeAnalysis = mergeCodeAnalysis(analyses);
		this.logger.debug('[CodeAnalyzer] Exported APIs:', countApis(codeAnalysis));
		return codeAnalysis;
	}

	private async analyzeFile(filePath: string): Promise<CodeAnalysis> {
		try {
			const sourceText = await this.readFile(
				path.join(this.workspacePath, filePath),
				'utf8',
			);
			return this.codeAnalyzer.analyze(sourceText, filePath);
		} catch (error) {
			this.logger.debug('[CodeAnalyzer] Skipped changed TypeScript file:', {
				filePath,
				error: getErrorMessage(error),
			});
			return { functions: [], classes: [] };
		}
	}

	private logDocumentationStage(documents: DocumentationDocument[]): void {
		this.logger.debug('[DocumentationScanner] Documentation files:', documents.length);
		this.logger.debug(
			'[Documentation Drift] Documentation files scanned:',
			documents.map((document) => document.path),
		);
	}

	private logDriftStage(findings: DocumentationDriftFinding[]): void {
		this.logger.debug('[DriftDetector] Findings:', findings.length);
		this.logger.debug(
			'[Documentation Drift] Drift findings detected:',
			findings.map((finding) => finding.message),
		);
	}

	private createResult(
		gitState: {
			isGitRepository: boolean;
			gitStatus: string;
			diff: string;
			changedFiles: string[];
		},
		codeAnalysis: CodeAnalysis,
		documentationIndex: DocumentationIndexData,
		driftReport: DocumentationDriftReport,
	): DocumentationDriftWorkflowResult {
		return {
			workspacePath: this.workspacePath,
			...gitState,
			documentationIndex,
			codeAnalysis,
			driftReport,
			outputReport: createOutputReport(
				this.workspacePath,
				gitState,
				codeAnalysis,
				documentationIndex,
				driftReport,
			),
		};
	}
}

export function createPopupSummary(result: DocumentationDriftWorkflowResult): string {
	if (!result.isGitRepository) {
		return 'Documentation Drift: workspace is not a Git repository.';
	}

	const count = result.driftReport.findings.length;
	if (count === 0) {
		return 'Documentation Drift: no drift findings detected.';
	}

	return `Documentation Drift: ${count} drift finding(s) detected.`;
}

function createOutputReport(
	workspacePath: string,
	gitState: {
		isGitRepository: boolean;
		gitStatus: string;
		diff: string;
		changedFiles: string[];
	},
	codeAnalysis: CodeAnalysis,
	documentationIndex: DocumentationIndexData,
	driftReport: DocumentationDriftReport,
): string {
	return [
		'# Documentation Drift Report',
		'',
		'## Workspace',
		workspacePath,
		'',
		'## Git status',
		gitState.gitStatus,
		`Diff bytes: ${gitState.diff.length}`,
		'',
		'## Changed files',
		formatList(gitState.changedFiles),
		'',
		'## Documentation files scanned',
		formatList(documentationIndex.documents.map((document) => document.path)),
		'',
		'## Exported APIs found',
		formatApis(codeAnalysis),
		'',
		'## Drift findings',
		formatFindings(driftReport.findings),
	].join('\n');
}

function mergeCodeAnalysis(analyses: CodeAnalysis[]): CodeAnalysis {
	return {
		functions: analyses.flatMap((analysis) => analysis.functions),
		classes: analyses.flatMap((analysis) => analysis.classes),
	};
}

function countApis(codeAnalysis: CodeAnalysis): number {
	return codeAnalysis.functions.length + codeAnalysis.classes.length;
}

function formatApis(codeAnalysis: CodeAnalysis): string {
	return formatList([
		...codeAnalysis.functions.map((api) => `function ${api.signature}`),
		...codeAnalysis.classes.map((api) => `class ${api.name}`),
	]);
}

function formatFindings(findings: DocumentationDriftFinding[]): string {
	if (findings.length === 0) {
		return '- None';
	}

	return findings.map(formatFinding).join('\n');
}

function formatFinding(finding: DocumentationDriftFinding): string {
	if (!finding.issue || !finding.example) {
		return `- ${finding.message}`;
	}

	return [
		`- ${finding.matches[0]?.documentPath ?? 'Documentation'}`,
		`  Function: ${finding.apiName}`,
		`  Signature: ${finding.signature ?? 'unknown'}`,
		`  Issue: ${finding.issue}`,
		`  Example: ${finding.example}`,
	].join('\n');
}

function formatList(values: string[]): string {
	if (values.length === 0) {
		return '- None';
	}

	return values.map((value) => `- ${value}`).join('\n');
}

function isTypeScriptSourceFile(filePath: string): boolean {
	return (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) &&
		!filePath.endsWith('.d.ts');
}

// New file support routing - for JavaScript
// excludes .d.ts
// needs to be connected once the JS analzyer is complete
function isJavaScriptSourceFile(filePath: string): boolean {
	return (filePath.endsWith('.js') || filePath.endsWith('.jsx'))
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
