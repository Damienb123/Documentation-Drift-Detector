import { DocumentationDriftFinding } from '../services/DocumentationDriftDetector';

export interface DocumentationUpdateRequest {
	documentPath: string;
	currentContent: string;
	finding: DocumentationDriftFinding;
}

export interface GeneratedDocumentationUpdate {
	documentPath: string;
	content: string;
	summary: string;
}

export interface AIProvider {
	generateDocumentationUpdate(
		request: DocumentationUpdateRequest,
	): Promise<GeneratedDocumentationUpdate>;
}
