export interface AIConfiguration {
	enabled: boolean;
	openAIApiKey?: string;
	openAIModel: string;
}

export interface AIConfigurationState {
	enabled: boolean;
	message?: string;
}
