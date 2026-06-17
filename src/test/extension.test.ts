import * as assert from 'node:assert';
import {
	ConfigurationReader,
	ExtensionConfigurationService,
} from '../services/ExtensionConfigurationService';

class StubConfigurationReader implements ConfigurationReader {
	constructor(private readonly values: Map<string, unknown>) {}

	get<T>(section: string): T | undefined {
		return this.values.get(section) as T | undefined;
	}
}

suite('ExtensionConfigurationService', () => {
	test('loads release defaults', () => {
		const configuration = new ExtensionConfigurationService(reader()).load();

		assert.deepStrictEqual(configuration, {
			ai: {
				enabled: false,
				openAIApiKey: undefined,
				openAIModel: 'gpt-4.1-mini',
			},
			documentationScanPaths: ['README.md', 'docs', 'examples'],
		});
	});

	test('loads AI settings and documentation scan paths', () => {
		const configuration = new ExtensionConfigurationService(reader([
			['ai.enabled', true],
			['ai.openAIApiKey', 'sk-user-provided'],
			['ai.openAIModel', 'gpt-4.1-mini'],
			['documentation.scanPaths', ['README.md', 'guides', 'samples']],
		])).load();

		assert.deepStrictEqual(configuration, {
			ai: {
				enabled: true,
				openAIApiKey: 'sk-user-provided',
				openAIModel: 'gpt-4.1-mini',
			},
			documentationScanPaths: ['README.md', 'guides', 'samples'],
		});
	});

	test('falls back to default scan paths when configured paths are empty', () => {
		const configuration = new ExtensionConfigurationService(reader([
			['documentation.scanPaths', [' ', '']],
		])).load();

		assert.deepStrictEqual(
			configuration.documentationScanPaths,
			['README.md', 'docs', 'examples'],
		);
	});

	function reader(entries: Array<[string, unknown]> = []): ConfigurationReader {
		return new StubConfigurationReader(new Map(entries));
	}
});
