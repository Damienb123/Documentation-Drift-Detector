import {
	AIProvider,
	DocumentationUpdateRequest,
	GeneratedDocumentationUpdate,
} from '../providers/AIProvider';
import { AIConfiguration } from '../types/AIConfiguration';
import { AIConfigurationService } from './AIConfigurationService';

export type DocumentationUpdatePreviewStatus = 'disabled' | 'generated';

export interface DocumentationUpdatePreview {
	status: DocumentationUpdatePreviewStatus;
	message?: string;
	update?: GeneratedDocumentationUpdate;
}

export class DocumentationUpdateService {
	constructor(
		private readonly configurationService: AIConfigurationService,
		private readonly providerFactory: (configuration: AIConfiguration) => AIProvider,
	) {}

	async generatePreview(
		configuration: AIConfiguration,
		request: DocumentationUpdateRequest,
	): Promise<DocumentationUpdatePreview> {
		const state = this.configurationService.getState(configuration);
		if (!state.enabled) {
			return {
				status: 'disabled',
				message: state.message,
			};
		}

		const provider = this.providerFactory(configuration);
		return {
			status: 'generated',
			update: await provider.generateDocumentationUpdate(request),
		};
	}
}
