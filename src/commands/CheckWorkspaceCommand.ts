import * as vscode from 'vscode';
import { ExtensionConfigurationService } from '../services/ExtensionConfigurationService';
import {
	createPopupSummary,
	DocumentationDriftWorkflow,
	DocumentationDriftWorkflowResult,
} from '../services/DocumentationDriftWorkflow';

export function registerCheckWorkspaceCommand(): vscode.Disposable {
	const outputChannel = vscode.window.createOutputChannel('Documentation Drift');

	const command = vscode.commands.registerCommand('docDrift.checkWorkspace', async () => {
		const workspacePath = getWorkspacePath();
		if (!workspacePath) {
			vscode.window.showWarningMessage(
				'Open a workspace folder to check documentation drift.',
			);
			return;
		}

		await checkWorkspace(workspacePath, outputChannel);
	});

	return vscode.Disposable.from(outputChannel, command);
}

async function checkWorkspace(
	workspacePath: string,
	outputChannel: vscode.OutputChannel,
): Promise<void> {
	try {
		const result = await runWorkflow(workspacePath);
		writeOutputReport(outputChannel, result);
		await showPopupSummary(result);
	} catch (error) {
		vscode.window.showErrorMessage(getErrorMessage(error));
	}
}

async function runWorkflow(
	workspacePath: string,
): Promise<DocumentationDriftWorkflowResult> {
	const configuration = new ExtensionConfigurationService(
		vscode.workspace.getConfiguration('docDrift'),
	).load();

	return new DocumentationDriftWorkflow(workspacePath, {
		documentationScanPaths: configuration.documentationScanPaths,
	}).run();
}

function writeOutputReport(
	outputChannel: vscode.OutputChannel,
	result: DocumentationDriftWorkflowResult,
): void {
	outputChannel.clear();
	outputChannel.appendLine(result.outputReport);
	outputChannel.show(true);
	console.debug('[OutputChannel] Report generated');
}

async function showPopupSummary(
	result: DocumentationDriftWorkflowResult,
): Promise<void> {
	const summary = createPopupSummary(result);
	if (!result.isGitRepository || result.driftReport.findings.length > 0) {
		await vscode.window.showWarningMessage(summary);
	} else {
		await vscode.window.showInformationMessage(summary);
	}
	console.debug('[Popup] Displayed summary');
}

function getWorkspacePath(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return `Documentation Drift check failed: ${error.message}`;
	}

	return 'Documentation Drift check failed.';
}
