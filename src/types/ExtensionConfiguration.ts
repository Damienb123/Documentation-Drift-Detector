import { AIConfiguration } from './AIConfiguration';

export interface ExtensionConfiguration {
	ai: AIConfiguration;
	documentationScanPaths: string[];
}
