import * as ts from 'typescript';

export interface FunctionParameter {
	name: string;
	type: string;
	optional: boolean;
	rest: boolean;
}

export interface ExportedFunction {
	name: string;
	parameters: FunctionParameter[];
	returnType: string;
	signature: string;
}

export interface ExportedClass {
	name: string;
}

export interface CodeAnalysis {
	functions: ExportedFunction[];
	classes: ExportedClass[];
}

/**
 * Extracts a small, deterministic API model from one TypeScript source file.
 * This analyzer intentionally uses syntax only, so it stays independent from
 * project configuration, the VS Code runtime, and TypeScript type checking.
 */
export class CodeAnalyzer {
	analyze(sourceText: string, fileName = 'source.ts'): CodeAnalysis {
		// createSourceFile also produces a recoverable AST for partially edited code.
		const sourceFile = ts.createSourceFile(
			fileName,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			this.getScriptKind(fileName),
		);

		return {
			functions: this.extractFunctions(sourceFile),
			classes: this.extractClasses(sourceFile),
		};
	}

	private extractFunctions(sourceFile: ts.SourceFile): ExportedFunction[] {
		return sourceFile.statements
			.filter(ts.isFunctionDeclaration)
			.filter((declaration) => this.isExported(declaration))
			.filter((declaration) => this.hasApiName(declaration))
			.map((declaration) => this.createFunction(declaration, sourceFile));
	}

	private createFunction(
		declaration: ts.FunctionDeclaration,
		sourceFile: ts.SourceFile,
	): ExportedFunction {
		const name = declaration.name?.text ?? 'default';
		const parameters = declaration.parameters.map((parameter) =>
			this.createParameter(parameter, sourceFile),
		);
		// Inferred types require a Program and TypeChecker; the MVP records only
		// explicit source types and uses a stable sentinel when none is present.
		const returnType = declaration.type?.getText(sourceFile) ?? 'unknown';

		return {
			name,
			parameters,
			returnType,
			signature: this.createSignature(name, parameters, returnType),
		};
	}

	private createParameter(
		parameter: ts.ParameterDeclaration,
		sourceFile: ts.SourceFile,
	): FunctionParameter {
		return {
			name: parameter.name.getText(sourceFile),
			type: parameter.type?.getText(sourceFile) ?? 'unknown',
			// A default value makes a parameter optional to callers even without ?.
			optional: Boolean(parameter.questionToken || parameter.initializer),
			rest: Boolean(parameter.dotDotDotToken),
		};
	}

	private createSignature(
		name: string,
		parameters: FunctionParameter[],
		returnType: string,
	): string {
		const parameterList = parameters
			.map((parameter) => this.formatParameter(parameter))
			.join(', ');

		// A normalized signature gives later drift detection a comparable value.
		return `${name}(${parameterList}): ${returnType}`;
	}

	private formatParameter(parameter: FunctionParameter): string {
		const rest = parameter.rest ? '...' : '';
		const optional = parameter.optional ? '?' : '';
		return `${rest}${parameter.name}${optional}: ${parameter.type}`;
	}

	private extractClasses(sourceFile: ts.SourceFile): ExportedClass[] {
		return sourceFile.statements
			.filter(ts.isClassDeclaration)
			.filter((declaration) => this.isExported(declaration))
			.filter((declaration) => this.hasApiName(declaration))
			.map((declaration) => ({
				name: declaration.name?.text ?? 'default',
			}));
	}

	private hasApiName(node: ts.ClassDeclaration | ts.FunctionDeclaration): boolean {
		// Parser recovery can create exported declarations with an empty name.
		// Anonymous declarations are valid APIs only when they are default exports.
		return Boolean(node.name?.text) || this.hasModifier(
			node,
			ts.SyntaxKind.DefaultKeyword,
		);
	}

	private isExported(node: ts.Node): boolean {
		return this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
	}

	private hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
		return ts.canHaveModifiers(node) &&
			Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));
	}

	private getScriptKind(fileName: string): ts.ScriptKind {
		return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
	}
}
