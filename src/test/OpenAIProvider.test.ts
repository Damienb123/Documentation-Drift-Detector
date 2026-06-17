import * as assert from 'node:assert';
import { DocumentationUpdateRequest } from '../providers/AIProvider';
import { OpenAIProvider } from '../providers/OpenAIProvider';

suite('OpenAIProvider', () => {
	test('generates documentation updates from a successful response', async () => {
		let capturedBody = '';
		const provider = new OpenAIProvider({
			apiKey: 'sk-user-provided',
			model: 'gpt-4.1-mini',
			endpoint: 'https://example.test/responses',
			fetchClient: async (_url, init) => {
				capturedBody = init.body;
				return response(true, 200, 'OK', {
					output_text: 'Updated README content',
				});
			},
		});

		const update = await provider.generateDocumentationUpdate(request());

		assert.deepStrictEqual(update, {
			documentPath: 'README.md',
			content: 'Updated README content',
			summary: 'Generated documentation update for greet.',
		});
		assert.strictEqual(JSON.parse(capturedBody).model, 'gpt-4.1-mini');
	});

	test('extracts generated text from nested response output', async () => {
		const provider = new OpenAIProvider({
			apiKey: 'sk-user-provided',
			model: 'gpt-4.1-mini',
			fetchClient: async () => response(true, 200, 'OK', {
				output: [{
					content: [{
						type: 'output_text',
						text: 'Nested generated content',
					}],
				}],
			}),
		});

		const update = await provider.generateDocumentationUpdate(request());

		assert.strictEqual(update.content, 'Nested generated content');
	});

	test('throws when the API request fails', async () => {
		const provider = new OpenAIProvider({
			apiKey: 'sk-user-provided',
			model: 'gpt-4.1-mini',
			fetchClient: async () => response(false, 500, 'Server Error', {}),
		});

		await assert.rejects(
			provider.generateDocumentationUpdate(request()),
			/OpenAI request failed: 500 Server Error/,
		);
	});

	test('throws when a successful response does not include text', async () => {
		const provider = new OpenAIProvider({
			apiKey: 'sk-user-provided',
			model: 'gpt-4.1-mini',
			fetchClient: async () => response(true, 200, 'OK', { output: [] }),
		});

		await assert.rejects(
			provider.generateDocumentationUpdate(request()),
			/OpenAI response did not include generated text/,
		);
	});

	function response(
		ok: boolean,
		status: number,
		statusText: string,
		body: unknown,
	) {
		return {
			ok,
			status,
			statusText,
			async json(): Promise<unknown> {
				return body;
			},
		};
	}

	function request(): DocumentationUpdateRequest {
		return {
			documentPath: 'README.md',
			currentContent: '# API',
			finding: {
				severity: 'warning',
				reason: 'missing-documentation-reference',
				apiKind: 'function',
				apiName: 'greet',
				signature: 'greet(name: string): string',
				message: 'Exported function "greet" is not referenced in documentation.',
				matches: [],
			},
		};
	}
});
