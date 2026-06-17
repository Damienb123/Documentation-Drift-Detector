import * as assert from 'node:assert';
import {
	AIProvider,
	DocumentationUpdateRequest,
	GeneratedDocumentationUpdate,
} from '../providers/AIProvider';
import { AIConfigurationService } from '../services/AIConfigurationService';
import { DocumentationUpdateService } from '../services/DocumentationUpdateService';
import { AIConfiguration } from '../types/AIConfiguration';

class StubAIProvider implements AIProvider {
	readonly requests: DocumentationUpdateRequest[] = [];

	constructor(private readonly update: GeneratedDocumentationUpdate) {}

	async generateDocumentationUpdate(
		request: DocumentationUpdateRequest,
	): Promise<GeneratedDocumentationUpdate> {
		this.requests.push(request);
		return this.update;
	}
}

suite('DocumentationUpdateService', () => {
	test('does not call an AI provider when AI is disabled', async () => {
		let providerCreated = false;
		const service = new DocumentationUpdateService(
			new AIConfigurationService(),
			() => {
				providerCreated = true;
				return new StubAIProvider(update());
			},
		);

		const preview = await service.generatePreview(disabledConfiguration(), request());

		assert.deepStrictEqual(preview, {
			status: 'disabled',
			message: 'AI assistance is disabled.',
		});
		assert.strictEqual(providerCreated, false);
	});

	test('does not call an AI provider when the API key is missing', async () => {
		let providerCreated = false;
		const service = new DocumentationUpdateService(
			new AIConfigurationService(),
			() => {
				providerCreated = true;
				return new StubAIProvider(update());
			},
		);

		const preview = await service.generatePreview(missingKeyConfiguration(), request());

		assert.deepStrictEqual(preview, {
			status: 'disabled',
			message: 'AI is not configured.',
		});
		assert.strictEqual(providerCreated, false);
	});

	test('uses the AIProvider interface to generate preview data', async () => {
		const provider = new StubAIProvider(update());
		const service = new DocumentationUpdateService(
			new AIConfigurationService(),
			() => provider,
		);

		const preview = await service.generatePreview(enabledConfiguration(), request());

		assert.deepStrictEqual(preview, {
			status: 'generated',
			update: update(),
		});
		assert.strictEqual(provider.requests.length, 1);
	});

	function disabledConfiguration(): AIConfiguration {
		return {
			enabled: false,
			openAIApiKey: '',
			openAIModel: 'gpt-4.1-mini',
		};
	}

	function enabledConfiguration(): AIConfiguration {
		return {
			enabled: true,
			openAIApiKey: 'sk-user-provided',
			openAIModel: 'gpt-4.1-mini',
		};
	}

	function missingKeyConfiguration(): AIConfiguration {
		return {
			enabled: true,
			openAIApiKey: '',
			openAIModel: 'gpt-4.1-mini',
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

	function update(): GeneratedDocumentationUpdate {
		return {
			documentPath: 'README.md',
			content: '# API\n\nUse `greet(name)`.',
			summary: 'Generated documentation update for greet.',
		};
	}
});
