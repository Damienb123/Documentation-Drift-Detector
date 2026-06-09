import * as assert from 'node:assert';
import { CodeAnalyzer } from '../analyzers/CodeAnalyzer';

suite('CodeAnalyzer', () => {
	const analyzer = new CodeAnalyzer();

	test('extracts exported function signatures as structured data', () => {
		const result = analyzer.analyze(`
			export function greet(name: string, count = 1): Promise<string> {
				return Promise.resolve(name.repeat(count));
			}
		`);

		assert.deepStrictEqual(result.functions, [{
			name: 'greet',
			parameters: [
				{ name: 'name', type: 'string', optional: false, rest: false },
				{ name: 'count', type: 'unknown', optional: true, rest: false },
			],
			returnType: 'Promise<string>',
			signature: 'greet(name: string, count?: unknown): Promise<string>',
		}]);
	});

	test('extracts rest and optional parameters', () => {
		const result = analyzer.analyze(
			'export function log(prefix?: string, ...values: number[]): void {}',
		);

		assert.deepStrictEqual(result.functions[0].parameters, [
			{ name: 'prefix', type: 'string', optional: true, rest: false },
			{ name: 'values', type: 'number[]', optional: false, rest: true },
		]);
		assert.strictEqual(
			result.functions[0].signature,
			'log(prefix?: string, ...values: number[]): void',
		);
	});

	test('extracts named and anonymous default exports', () => {
		const named = analyzer.analyze(
			'export default function build(value: number): number { return value; }',
		);
		const anonymous = analyzer.analyze(
			'export default function (): void {}',
		);

		assert.strictEqual(named.functions[0].name, 'build');
		assert.strictEqual(anonymous.functions[0].name, 'default');
	});

	test('extracts exported class names without analyzing class members', () => {
		const result = analyzer.analyze(`
			export class PublicService {
				run(): void {}
			}
			export default class {}
		`);

		assert.deepStrictEqual(result.classes, [
			{ name: 'PublicService' },
			{ name: 'default' },
		]);
	});

	test('ignores non-exported and unsupported declarations', () => {
		const result = analyzer.analyze(`
			function internal(): void {}
			class InternalClass {}
			export interface PublicShape {}
			export type PublicName = string;
			export const arrow = (): void => {};
		`);

		assert.deepStrictEqual(result, {
			functions: [],
			classes: [],
		});
	});

	test('ignores generic type parameters while preserving API detection', () => {
		const result = analyzer.analyze(
			'export function identity<T>(value: T): T { return value; }',
		);

		assert.strictEqual(result.functions[0].name, 'identity');
		assert.strictEqual(result.functions[0].signature, 'identity(value: T): T');
	});

	test('returns empty structured data for empty or invalid source', () => {
		assert.deepStrictEqual(analyzer.analyze(''), {
			functions: [],
			classes: [],
		});
		assert.deepStrictEqual(analyzer.analyze('export function'), {
			functions: [],
			classes: [],
		});
	});
});
