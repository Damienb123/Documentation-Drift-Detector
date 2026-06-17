/// <reference lib="dom" />
import * as vscode from 'vscode';
import { DocumentationUpdateRequest } from '../providers/AIProvider';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { AIConfigurationService } from '../services/AIConfigurationService';
import { DocumentationUpdateService } from '../services/DocumentationUpdateService';
import { ExtensionConfigurationService } from '../services/ExtensionConfigurationService';
import { AIConfiguration } from '../types/AIConfiguration';

export function registerGenerateDocumentationUpdateCommand(
	_context: vscode.ExtensionContext,
): vscode.Disposable {
	return vscode.commands.registerCommand(
		'docDrift.generateDocumentationUpdate',
		async (request?: DocumentationUpdateRequest) => {
			if (!request) {
				vscode.window.showInformationMessage(
					'No documentation drift finding selected.',
				);
				return;
			}

			await generateDocumentationUpdate(request);
		},
	);
}

async function generateDocumentationUpdate(
	request: DocumentationUpdateRequest,
): Promise<void> {
	const service = createService();
	const configuration = readConfiguration();

	try {
		const preview = await service.generatePreview(configuration, request);
		if (preview.status === 'disabled') {
			vscode.window.showInformationMessage(preview.message ?? 'AI is not configured.');
			return;
		}

		if (preview.update) {
			await showPreview(preview.update.content);
		}
	} catch (error) {
		vscode.window.showErrorMessage(getErrorMessage(error));
	}
}

function createService(): DocumentationUpdateService {
	return new DocumentationUpdateService(
		new AIConfigurationService(),
		(configuration) => new OpenAIProvider({
			apiKey: configuration.openAIApiKey ?? '',
			model: configuration.openAIModel,
		}),
	);
}

function readConfiguration(): AIConfiguration {
	return new ExtensionConfigurationService(
		vscode.workspace.getConfiguration('docDrift'),
	).load().ai;
}

async function showPreview(
	content: string,
): Promise<void> {
	const document = await vscode.workspace.openTextDocument({
		content,
		language: 'markdown',
	});

	await vscode.window.showTextDocument(document, {
		preview: true,
		viewColumn: vscode.ViewColumn.Beside,
	});
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return `Documentation update generation failed: ${error.message}`;
	}

	return 'Documentation update generation failed.';
}
