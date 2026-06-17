import * as assert from 'node:assert';
import { AIConfigurationService } from '../services/AIConfigurationService';

suite('AIConfigurationService', () => {
	const service = new AIConfigurationService();

	test('reports AI disabled when no API key is configured', () => {
		const state = service.getState({
			enabled: true,
			openAIApiKey: '',
			openAIModel: 'gpt-4.1-mini',
		});

		assert.deepStrictEqual(state, {
			enabled: false,
			message: 'AI is not configured.',
		});
	});

	test('treats whitespace API keys as missing', () => {
		assert.strictEqual(service.hasApiKey({
			enabled: true,
			openAIApiKey: '   ',
			openAIModel: 'gpt-4.1-mini',
		}), false);
	});

	test('reports AI disabled when optional assistance is turned off', () => {
		const state = service.getState({
			enabled: false,
			openAIApiKey: 'sk-user-provided',
			openAIModel: 'gpt-4.1-mini',
		});

		assert.deepStrictEqual(state, {
			enabled: false,
			message: 'AI assistance is disabled.',
		});
	});

	test('reports AI enabled when a user API key exists', () => {
		const state = service.getState({
			enabled: true,
			openAIApiKey: 'sk-user-provided',
			openAIModel: 'gpt-4.1-mini',
		});

		assert.deepStrictEqual(state, { enabled: true });
	});
});
