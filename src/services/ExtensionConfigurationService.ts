import { ExtensionConfiguration } from '../types/ExtensionConfiguration';

export interface ConfigurationReader {
	get<T>(section: string): T | undefined;
}

const defaultModel = 'gpt-4.1-mini';
const defaultScanPaths = ['README.md', 'docs', 'examples'];

export class ExtensionConfigurationService {
	constructor(private readonly reader: ConfigurationReader) {}

	load(): ExtensionConfiguration {
		return {
			ai: {
				enabled: this.reader.get<boolean>('ai.enabled') ?? false,
				openAIApiKey: this.reader.get<string>('ai.openAIApiKey'),
				openAIModel: this.reader.get<string>('ai.openAIModel') ?? defaultModel,
			},
			documentationScanPaths: this.getScanPaths(),
		};
	}

	private getScanPaths(): string[] {
		const configuredPaths = this.reader.get<string[]>('documentation.scanPaths');
		if (!configuredPaths) {
			return defaultScanPaths;
		}

		const scanPaths = configuredPaths
			.map((scanPath) => scanPath.trim())
			.filter((scanPath) => scanPath.length > 0);

		return scanPaths.length > 0 ? scanPaths : defaultScanPaths;
	}
}
