/// <reference lib="dom" />
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('docDrift.checkWorkspace', () => {
		vscode.window.showInformationMessage('Documentation Drift Detector Ready');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
