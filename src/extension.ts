/// <reference lib="dom" />
import * as vscode from 'vscode';
import { registerCheckWorkspaceCommand } from './commands/CheckWorkspaceCommand';
import { registerGenerateDocumentationUpdateCommand } from './commands/GenerateDocumentationUpdateCommand';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		registerCheckWorkspaceCommand(),
		registerGenerateDocumentationUpdateCommand(context),
	);
}

export function deactivate() {}
