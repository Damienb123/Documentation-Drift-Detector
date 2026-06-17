import * as assert from 'node:assert';
import { CodeAnalysis } from '../analyzers/CodeAnalyzer';
import { DocumentationIndexData } from '../scanners/DocumentationIndex';
import { DocumentationDriftDetector } from '../services/DocumentationDriftDetector';

suite('DocumentationDriftDetector', () => {
	const detector = new DocumentationDriftDetector();

	test('returns no findings when exported APIs are referenced in documentation', () => {
		const report = detector.detect(
			analysis({
				functionName: 'greet',
				className: 'GreetingService',
			}),
			index([
				{
					path: 'README.md',
					references: [
						{ value: 'greet', line: 3 },
						{ value: 'GreetingService', line: 8 },
					],
				},
			]),
		);

		assert.deepStrictEqual(report, { findings: [] });
	});

	test('reports exported functions missing from documentation', () => {
		const report = detector.detect(
			analysis({ functionName: 'calculateTotal' }),
			index([
				{
					path: 'docs/api.md',
					references: [{ value: 'formatTotal', line: 4 }],
				},
			]),
		);

		assert.deepStrictEqual(report.findings, [{
			severity: 'warning',
			reason: 'missing-documentation-reference',
			apiKind: 'function',
			apiName: 'calculateTotal',
			signature: 'calculateTotal(name: string): number',
			message: 'Exported function "calculateTotal" is not referenced in documentation.',
			matches: [],
		}]);
	});

	test('does not report when documented function call has matching argument count', () => {
		const report = detector.detect(
			analysis({ functionName: 'createUser', required: 2, maximum: 2 }),
			index([{
				path: 'README.md',
				content: 'Call createUser("Damien", "damien@example.com").',
				references: [{ value: 'createUser', line: 1 }],
			}]),
		);

		assert.deepStrictEqual(report.findings, []);
	});

	test('reports documented function calls with missing arguments', () => {
		const report = detector.detect(
			analysis({ functionName: 'createUser', required: 2, maximum: 2 }),
			index([{
				path: 'README.md',
				content: 'Call createUser("Damien").',
				references: [{ value: 'createUser', line: 1 }],
			}]),
		);

		assert.deepStrictEqual(report.findings, [{
			severity: 'warning',
			reason: 'function-argument-count-mismatch',
			apiKind: 'function',
			apiName: 'createUser',
			signature: 'createUser(name: string, email: string): number',
			issue: 'Expected 2 arguments but found 1.',
			example: 'createUser("Damien")',
			message: 'README.md: Function "createUser" call has an argument count mismatch. Expected 2 arguments but found 1.',
			matches: [{ documentPath: 'README.md', line: 1 }],
		}]);
	});

	test('reports documented function calls with extra arguments', () => {
		const report = detector.detect(
			analysis({ functionName: 'createUser', required: 2, maximum: 2 }),
			index([{
				path: 'examples/basic.ts',
				content: 'createUser("Damien", "damien@example.com", true);',
				references: [{ value: 'createUser', line: 1 }],
			}]),
		);

		assert.deepStrictEqual(report.findings.map((finding) => finding.issue), [
			'Expected 2 arguments but found 3.',
		]);
	});

	test('accepts calls that omit optional parameters', () => {
		const report = detector.detect(
			analysis({ functionName: 'greet', required: 1, maximum: 2 }),
			index([{
				path: 'README.md',
				content: 'greet("Damien")',
				references: [{ value: 'greet', line: 1 }],
			}]),
		);

		assert.deepStrictEqual(report.findings, []);
	});

	test('accepts calls that omit default parameters', () => {
		const report = detector.detect(
			analysis({ functionName: 'greet', required: 1, maximum: 2 }),
			index([{
				path: 'README.md',
				content: 'greet("Damien")',
				references: [{ value: 'greet', line: 1 }],
			}]),
		);

		assert.deepStrictEqual(report.findings, []);
	});

	test('accepts extra arguments when the function has a rest parameter', () => {
		const report = detector.detect(
			analysis({
				functionName: 'log',
				required: 1,
				maximum: 1,
				hasRestParameter: true,
			}),
			index([{
				path: 'examples/log.ts',
				content: 'log("debug", 1, 2, 3)',
				references: [{ value: 'log', line: 1 }],
			}]),
		);

		assert.deepStrictEqual(report.findings, []);
	});

	test('detects multiline function calls in Markdown', () => {
		const report = detector.detect(
			analysis({ functionName: 'createUser', required: 2, maximum: 2 }),
			index([{
				path: 'README.md',
				content: [
					'Example:',
					'createUser(',
					'  "Damien"',
					')',
				].join('\n'),
				references: [{ value: 'createUser', line: 2 }],
			}]),
		);

		assert.deepStrictEqual(report.findings.map((finding) => finding.example), [
			'createUser( "Damien" )',
		]);
		assert.deepStrictEqual(report.findings[0].matches, [{
			documentPath: 'README.md',
			line: 2,
		}]);
	});

	test('does not report argument mismatch for plain prose mentions', () => {
		const report = detector.detect(
			analysis({ functionName: 'createUser', required: 2, maximum: 2 }),
			index([{
				path: 'README.md',
				content: 'The createUser helper creates users.',
				references: [{ value: 'createUser', line: 1 }],
			}]),
		);

		assert.deepStrictEqual(report.findings, []);
	});

	test('reports exported classes missing from documentation', () => {
		const report = detector.detect(
			analysis({ className: 'CheckoutClient' }),
			index([]),
		);

		assert.deepStrictEqual(report.findings, [{
			severity: 'warning',
			reason: 'missing-documentation-reference',
			apiKind: 'class',
			apiName: 'CheckoutClient',
			message: 'Exported class "CheckoutClient" is not referenced in documentation.',
			matches: [],
		}]);
	});

	test('keeps findings focused on APIs without exact documentation references', () => {
		const report = detector.detect(
			analysis({
				functionName: 'buildConfig',
				className: 'ConfigLoader',
			}),
			index([
				{
					path: 'examples/basic.ts',
					references: [
						{ value: 'buildConfig', line: 2 },
						{ value: 'Config', line: 3 },
					],
				},
			]),
		);

		assert.deepStrictEqual(report.findings.map((finding) => finding.apiName), [
			'ConfigLoader',
		]);
	});

	test('returns an empty report when there are no exported APIs', () => {
		const report = detector.detect(
			{ functions: [], classes: [] },
			index([
				{
					path: 'README.md',
					references: [{ value: 'unused', line: 1 }],
				},
			]),
		);

		assert.deepStrictEqual(report, { findings: [] });
	});

	function analysis(options: {
		functionName?: string;
		className?: string;
		required?: number;
		maximum?: number;
		hasRestParameter?: boolean;
	}): CodeAnalysis {
		const required = options.required ?? 1;
		const maximum = options.maximum ?? 1;

		return {
			functions: options.functionName ? [{
				name: options.functionName,
				parameters: createParameters(required, maximum, options.hasRestParameter),
				returnType: 'number',
				signature: createSignature(options.functionName, required, maximum),
				requiredParameterCount: required,
				maximumParameterCount: maximum,
				hasRestParameter: options.hasRestParameter ?? false,
			}] : [],
			classes: options.className ? [{ name: options.className }] : [],
		};
	}

	function createParameters(
		required: number,
		maximum: number,
		hasRestParameter = false,
	): CodeAnalysis['functions'][number]['parameters'] {
		const names = ['name', 'email', 'role', 'enabled'];
		const parameters = names.slice(0, maximum).map((name, index) => ({
			name,
			type: 'string',
			optional: index >= required,
			rest: false,
		}));

		if (hasRestParameter) {
			parameters.push({
				name: 'values',
				type: 'unknown[]',
				optional: false,
				rest: true,
			});
		}

		return parameters;
	}

	function createSignature(
		functionName: string,
		required: number,
		maximum: number,
	): string {
		const names = ['name', 'email', 'role', 'enabled'];
		const parameters = names.slice(0, maximum)
			.map((name, index) => `${name}${index >= required ? '?' : ''}: string`)
			.join(', ');

		return `${functionName}(${parameters}): number`;
	}

	function index(documents: Array<{
		path: string;
		content?: string;
		references: Array<{ value: string; line: number }>;
	}>): DocumentationIndexData {
		return {
			documents: documents.map((document) => ({
				path: document.path,
				section: 'docs',
				content: document.content ?? '',
				references: document.references,
			})),
			references: documents.flatMap((document) => document.references),
		};
	}
});
