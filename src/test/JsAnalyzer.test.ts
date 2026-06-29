import * as assert from 'node:assert';
import { JsAnalyzer } from '../analyzers/JsAnalyzer';

suite('JsAnalyzer', () => {
	const analyzer = new JsAnalyzer();

	test('extracts every API from the users.js fixture', () => {
		const result = analyzer.analyze(`
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
		`, 'src/users.js');

		assert.deepStrictEqual(
			result.functions.map((api) => api.signature),
			[
				'createUser(name: unknown, email: unknown, password: unknown): unknown',
				'loginUser(username: unknown, password: unknown): unknown',
				'deleteUser(id: unknown): unknown',
			],
		);
		assert.deepStrictEqual(result.classes, [{ name: 'UserService' }]);
	});

	for (const extension of ['js', 'mjs', 'cjs']) {
		test(`supports .${extension} files`, () => {
			assert.strictEqual(analyzer.supports(`src/users.${extension}`), true);
		});
	}

	test('does not claim TypeScript or unrelated files', () => {
		assert.strictEqual(analyzer.supports('src/users.ts'), false);
		assert.strictEqual(analyzer.supports('README.md'), false);
	});

	test('extracts named function and class exports', () => {
		const result = analyzer.analyze(`
			export function createUser(name) { return { name }; }
			export class UserService {}
		`);

		assert.deepStrictEqual(result.functions.map((item) => item.name), ['createUser']);
		assert.deepStrictEqual(result.classes, [{ name: 'UserService' }]);
	});

	test('extracts named export lists and aliases', () => {
		const result = analyzer.analyze(`
			function build(value) { return value; }
			class InternalService {}
			export { build as create, InternalService as PublicService };
		`);

		assert.deepStrictEqual(result.functions.map((item) => item.name), ['create']);
		assert.deepStrictEqual(result.classes, [{ name: 'PublicService' }]);
	});

	test('extracts named and anonymous default exports', () => {
		const named = analyzer.analyze('export default function build(value) {}');
		const anonymous = analyzer.analyze('export default function () {}');
		const classResult = analyzer.analyze('export default class {}');

		assert.strictEqual(named.functions[0].name, 'build');
		assert.strictEqual(anonymous.functions[0].name, 'default');
		assert.deepStrictEqual(classResult.classes, [{ name: 'default' }]);
	});

	test('extracts arrow, function expression, and async exports', () => {
		const result = analyzer.analyze(`
			export const arrow = (value) => value;
			export const expression = function (value) { return value; };
			export async function load(id) { return id; }
		`);

		assert.deepStrictEqual(
			result.functions.map((item) => item.name),
			['load', 'arrow', 'expression'],
		);
	});

	test('extracts required, default, and rest parameter metadata', () => {
		const result = analyzer.analyze(
			'export function format(value, prefix = ">", ...parts) {}',
		);

		assert.deepStrictEqual(result.functions[0], {
			name: 'format',
			parameters: [
				{ name: 'value', type: 'unknown', optional: false, rest: false },
				{ name: 'prefix', type: 'unknown', optional: true, rest: false },
				{ name: 'parts', type: 'unknown', optional: false, rest: true },
			],
			returnType: 'unknown',
			signature: 'format(value: unknown, prefix?: unknown, ...parts: unknown): unknown',
			requiredParameterCount: 1,
			maximumParameterCount: 2,
			hasRestParameter: true,
		});
	});

	test('ignores non-exported, nested, and callback functions', () => {
		const result = analyzer.analyze(`
			function helper() {
				function nested() {}
				[1].map(function callback(value) { return value; });
			}
			class LocalClass {}
			const localArrow = () => {};
		`);

		assert.deepStrictEqual(result, { functions: [], classes: [] });
	});

	for (const extension of ['js', 'mjs', 'cjs']) {
		test(`analyzes .${extension} source files`, () => {
			const result = analyzer.analyze(
				'export function supported(value) {}',
				`source.${extension}`,
			);

			assert.strictEqual(result.functions[0].name, 'supported');
		});
	}

	test('returns empty data for empty, malformed, and unsupported source', () => {
		assert.deepStrictEqual(analyzer.analyze(''), { functions: [], classes: [] });
		assert.deepStrictEqual(analyzer.analyze('export function'), {
			functions: [],
			classes: [],
		});
		assert.deepStrictEqual(
			analyzer.analyze('module.exports = () => {}; export const value = 1;'),
			{ functions: [], classes: [] },
		);
	});

	test('does not duplicate an API exported more than once', () => {
		const result = analyzer.analyze(`
			export function shared() {}
			export { shared };
			export { shared };
		`);

		assert.deepStrictEqual(result.functions.map((item) => item.name), ['shared']);
	});
});
