import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DocumentationIndex } from '../scanners/DocumentationIndex';

suite('DocumentationIndex', () => {
	let workspacePath: string;

	setup(async () => {
		workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-index-'));
	});

	teardown(async () => {
		await fs.rm(workspacePath, { recursive: true, force: true });
	});

	test('indexes README, docs, and examples documents', async () => {
		await writeFile('README.md', '# greet\nUse `greet` from the package.');
		await writeFile('docs/api.md', '## API\nCall greet(name).');
		await writeFile('examples/basic.ts', 'import { greet } from "../src";\ngreet("Ada");');

		const index = await new DocumentationIndex(workspacePath).build();

		assert.deepStrictEqual(index.documents.map((document) => document.path), [
			'README.md',
			'docs/api.md',
			'examples/basic.ts',
		]);
		assert.deepStrictEqual(index.documents.map((document) => document.section), [
			'readme',
			'docs',
			'examples',
		]);
	});

	test('recursively scans docs and examples with normalized paths', async () => {
		await writeFile('docs/guides/start.md', 'Use buildConfig().');
		await writeFile('examples/nested/demo.tsx', 'export const Demo = () => renderDemo();');

		const index = await new DocumentationIndex(workspacePath).build();

		assert.deepStrictEqual(index.documents.map((document) => document.path), [
			'docs/guides/start.md',
			'examples/nested/demo.tsx',
		]);
	});

	test('extracts unique symbol-like references with line numbers', async () => {
		await writeFile(
			'README.md',
			[
				'# buildConfig',
				'Call buildConfig(options) before `renderPage`.',
				'Call buildConfig(options) again.',
			].join('\n'),
		);

		const index = await new DocumentationIndex(workspacePath).build();

		assert.deepStrictEqual(index.documents[0].references, [
			{ value: 'buildConfig', line: 1 },
			{ value: 'renderPage', line: 2 },
		]);
		assert.deepStrictEqual(index.references, index.documents[0].references);
	});

	test('returns an empty index when documentation surfaces are missing', async () => {
		const index = await new DocumentationIndex(workspacePath).build();

		assert.deepStrictEqual(index, {
			documents: [],
			references: [],
		});
	});

	test('ignores unsupported files inside documentation directories', async () => {
		await writeFile('docs/api.md', 'runTask()');
		await writeFile('docs/image.png', 'not really an image');
		await writeFile('examples/snapshot.bin', 'runTask()');

		const index = await new DocumentationIndex(workspacePath).build();

		assert.deepStrictEqual(index.documents.map((document) => document.path), [
			'docs/api.md',
		]);
	});

	test('supports custom documentation scan paths', async () => {
		await writeFile('guides/api.md', 'Use customGuide().');
		await writeFile('README.md', '# ignored');

		const index = await new DocumentationIndex(
			workspacePath,
			undefined,
			{ scanPaths: ['guides'] },
		).build();

		assert.deepStrictEqual(index.documents.map((document) => document.path), [
			'guides/api.md',
		]);
		assert.deepStrictEqual(index.references, [
			{ value: 'customGuide', line: 1 },
		]);
	});

	async function writeFile(relativePath: string, content: string): Promise<void> {
		const filePath = path.join(workspacePath, relativePath);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, content);
	}
});
