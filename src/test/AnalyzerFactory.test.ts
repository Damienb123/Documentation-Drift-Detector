import * as assert from 'node:assert';
import {
	AnalyzerFactory,
	JavaScriptSourceAnalyzer,
	SourceAnalyzer,
} from '../analyzers/AnalyzerFactory';
import { CodeAnalysis } from '../analyzers/CodeAnalyzer';

class StubAnalyzer implements SourceAnalyzer {
	analyze(): CodeAnalysis {
		return { functions: [], classes: [] };
	}
}

class StubJsAnalyzer extends StubAnalyzer implements JavaScriptSourceAnalyzer {
	readonly supportRequests: string[] = [];

	supports(filePath: string): boolean {
		this.supportRequests.push(filePath);
		return ['.js', '.mjs', '.cjs'].some((extension) =>
			filePath.toLowerCase().endsWith(extension),
		);
	}
}

suite('AnalyzerFactory', () => {
	const typeScriptAnalyzer = new StubAnalyzer();
	const javaScriptAnalyzer = new StubJsAnalyzer();
	const factory = new AnalyzerFactory(typeScriptAnalyzer, javaScriptAnalyzer);

	for (const extension of ['.js', '.mjs', '.cjs']) {
		test(`routes ${extension} files to JsAnalyzer`, () => {
			assert.strictEqual(
				factory.getAnalyzer(`src/users${extension}`),
				javaScriptAnalyzer,
			);
			assert.strictEqual(
				factory.select(`src/users${extension}`)?.name,
				'JsAnalyzer',
			);
		});
	}

	for (const extension of ['.ts', '.tsx']) {
		test(`routes ${extension} files to the TypeScript analyzer`, () => {
			assert.strictEqual(
				factory.getAnalyzer(`src/users${extension}`),
				typeScriptAnalyzer,
			);
			assert.strictEqual(
				factory.select(`src/users${extension}`)?.name,
				'TypeScriptAnalyzer',
			);
		});
	}

	test('ignores declarations and unsupported files', () => {
		assert.strictEqual(factory.getAnalyzer('src/users.d.ts'), undefined);
		assert.strictEqual(factory.getAnalyzer('README.md'), undefined);
	});

	test('uses the JavaScript analyzer support contract for source classification', () => {
		factory.getAnalyzer('src/users.js');

		assert.ok(javaScriptAnalyzer.supportRequests.includes('src/users.js'));
	});
});
