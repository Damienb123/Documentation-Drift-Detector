import { CodeAnalysis, ExportedClass, ExportedFunction } from '../analyzers/CodeAnalyzer';
import {
	DocumentationDocument,
	DocumentationIndexData,
	DocumentationReference,
} from '../scanners/DocumentationIndex';
import {
	DocumentationFunctionCall,
	DocumentationUsageParser,
} from '../scanners/DocumentationUsageParser';

export type DocumentationDriftSeverity = 'warning';
export type DocumentationDriftReason =
	'missing-documentation-reference' |
	'function-argument-count-mismatch';
export type DocumentationDriftApiKind = 'function' | 'class';

export interface DocumentationMatch {
	documentPath: string;
	line: number;
}

export interface DocumentationDriftFinding {
	severity: DocumentationDriftSeverity;
	reason: DocumentationDriftReason;
	apiKind: DocumentationDriftApiKind;
	apiName: string;
	signature?: string;
	issue?: string;
	example?: string;
	message: string;
	matches: DocumentationMatch[];
}

export interface DocumentationDriftReport {
	findings: DocumentationDriftFinding[];
}

/**
 * Compares exported APIs with documentation references and returns structured
 * potential drift findings without deciding how those findings are displayed.
 */
export class DocumentationDriftDetector {
	constructor(
		private readonly usageParser: DocumentationUsageParser =
			new DocumentationUsageParser(),
	) {}

	detect(
		codeAnalysis: CodeAnalysis,
		documentationIndex: DocumentationIndexData,
	): DocumentationDriftReport {
		return {
			findings: [
				...codeAnalysis.functions.flatMap((api) =>
					this.detectFunction(api, documentationIndex),
				),
				...codeAnalysis.classes.flatMap((api) =>
					this.detectClass(api, documentationIndex),
				),
			],
		};
	}

	private detectFunction(
		api: ExportedFunction,
		documentationIndex: DocumentationIndexData,
	): DocumentationDriftFinding[] {
		const matches = this.findMatches(api.name, documentationIndex.documents);
		if (matches.length === 0) {
			return [this.createMissingFinding(
				'function',
				api.name,
				matches,
				api.signature,
			)];
		}

		return this.detectArgumentMismatches(api, documentationIndex.documents);
	}

	private detectClass(
		api: ExportedClass,
		documentationIndex: DocumentationIndexData,
	): DocumentationDriftFinding[] {
		const matches = this.findMatches(api.name, documentationIndex.documents);
		if (matches.length > 0) {
			return [];
		}

		return [this.createMissingFinding('class', api.name, matches)];
	}

	private detectArgumentMismatches(
		api: ExportedFunction,
		documents: DocumentationDocument[],
	): DocumentationDriftFinding[] {
		return documents.flatMap((document) =>
			this.usageParser.parseFunctionCalls(document.content, api.name)
				.filter((call) => this.hasArgumentMismatch(api, call.argumentCount))
				.map((call) => this.createArgumentMismatchFinding(api, document, call)),
		);
	}

	private hasArgumentMismatch(
		api: ExportedFunction,
		argumentCount: number,
	): boolean {
		if (argumentCount < api.requiredParameterCount) {
			return true;
		}

		return !api.hasRestParameter && argumentCount > api.maximumParameterCount;
	}

	private createMissingFinding(
		apiKind: DocumentationDriftApiKind,
		apiName: string,
		matches: DocumentationMatch[],
		signature?: string,
	): DocumentationDriftFinding {
		const finding: DocumentationDriftFinding = {
			severity: 'warning',
			reason: 'missing-documentation-reference',
			apiKind,
			apiName,
			message: `Exported ${apiKind} "${apiName}" is not referenced in documentation.`,
			matches,
		};

		if (signature) {
			finding.signature = signature;
		}

		return finding;
	}

	private createArgumentMismatchFinding(
		api: ExportedFunction,
		document: DocumentationDocument,
		call: DocumentationFunctionCall,
	): DocumentationDriftFinding {
		const issue = `${this.describeExpectedArguments(api)} but found ` +
			`${call.argumentCount}.`;

		return {
			severity: 'warning',
			reason: 'function-argument-count-mismatch',
			apiKind: 'function',
			apiName: api.name,
			signature: api.signature,
			issue,
			example: call.example,
			message: `${document.path}: Function "${api.name}" call has an ` +
				`argument count mismatch. ${issue}`,
			matches: [{
				documentPath: document.path,
				line: call.line,
			}],
		};
	}

	private describeExpectedArguments(api: ExportedFunction): string {
		if (api.hasRestParameter) {
			return `Expected at least ${api.requiredParameterCount} arguments`;
		}

		if (api.requiredParameterCount === api.maximumParameterCount) {
			return `Expected ${api.requiredParameterCount} arguments`;
		}

		return `Expected ${api.requiredParameterCount} to ` +
			`${api.maximumParameterCount} arguments`;
	}

	private findMatches(
		apiName: string,
		documents: DocumentationDocument[],
	): DocumentationMatch[] {
		return documents.flatMap((document) =>
			document.references
				.filter((reference) => this.isApiReference(apiName, reference))
				.map((reference) => ({
					documentPath: document.path,
					line: reference.line,
				})),
		);
	}

	private isApiReference(
		apiName: string,
		reference: DocumentationReference,
	): boolean {
		return reference.value === apiName;
	}
}
