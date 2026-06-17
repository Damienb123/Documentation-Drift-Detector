import { AIConfiguration, AIConfigurationState } from '../types/AIConfiguration';

export class AIConfigurationService {
	getState(configuration: AIConfiguration): AIConfigurationState {
		if (!configuration.enabled) {
			return {
				enabled: false,
				message: 'AI assistance is disabled.',
			};
		}

		if (!this.hasApiKey(configuration)) {
			return {
				enabled: false,
				message: 'AI is not configured.',
			};
		}

		return { enabled: true };
	}

	hasApiKey(configuration: AIConfiguration): boolean {
		return Boolean(configuration.openAIApiKey?.trim());
	}
}
