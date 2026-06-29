// JavaScript language support for plugin

// reusable imports using Code Analyzers function scanning and API exporting
import * as ts from 'typescript';
import {
	CodeAnalysis,
	ExportedClass,
	ExportedFunction,
	FunctionParameter,
} from './CodeAnalyzer';

// JsAnalyzer supports a few file extensions when scanning for changes and code issues
export class JsAnalyzer {
	supports(fileName: string): boolean {
		const lowerName = fileName.toLowerCase();
		return ['.js', '.mjs', '.cjs'].some((extension) =>
			lowerName.endsWith(extension),
		);
	}

	analyze(sourceText: string, filename = 'source.js'): CodeAnalysis {
		// parse JS/JSX and return { functions, classes } - support focused on ES models
		const sourceFile = ts.createSourceFile(
			filename,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			this.getScriptKind(filename),
		);
		
		return {
			functions: this.extractFunctions(sourceFile),
			classes: this.extractClasses(sourceFile),
		};
	}

	// JS ES model support - takes some qualities of the main CodeAnalyzer but is reused to support JS syntax
	private extractFunctions(sourceFile: ts.SourceFile): ExportedFunction[] {
		// rewritten to return function declaration
			return [
				...this.extractFunctionDeclarations(sourceFile),
				...this.extractVariableFunctions(sourceFile),
			];
				
		}
		// Push extractFunctionDeclaration and extractVariableFunction functions to repo
		private extractFunctionDeclarations(sourceFile: ts.SourceFile): ExportedFunction[] {
			return sourceFile.statements
				.filter((ts.isFunctionDeclaration))
				.filter((declaration) => this.hasFunctionApiName(declaration))
				.flatMap((declaration) => {
					const localName = declaration.name?.text ?? 'default';
					return this.getExportedNames(
						sourceFile,
						localName,
						this.isExported(declaration),
					).map((name) => this.createFunction(
						name,
						declaration.parameters,
						sourceFile,
					));
				});
		}
		// Variable extraction within functions in a source file of JS
		// filters valid function variables and valid variable params when a function is created
		private extractVariableFunctions(sourceFile: ts.SourceFile): ExportedFunction[]{
			return sourceFile.statements
				.filter((ts.isVariableStatement))
				.flatMap((statement) => 
				statement.declarationList.declarations
					.filter((declaration) => this.isFunctionVariable(declaration))
					.flatMap((declaration) => {
						const localName = declaration.name.getText(sourceFile);
						return this.getExportedNames(
							sourceFile,
							localName,
							this.isExported(statement),
						).map((name) => this.createFunction(
						name,
						this.getFunctionVariableParameters(declaration),
						sourceFile,
					));
					}),
			);
		}
		// Detects proper function variable declaration adhereing ES Model 
		private isFunctionVariable(
			declaration: ts.VariableDeclaration,
		): boolean {
			return Boolean(
				declaration.initializer && 
				(ts.isArrowFunction(declaration.initializer) ||
			ts.isFunctionExpression(declaration.initializer)),
			);
		}
		

		private getFunctionVariableParameters(
			declaration: ts.VariableDeclaration,
		): ts.NodeArray<ts.ParameterDeclaration> {
			const initializer = declaration.initializer;

				if (
					initializer && 
					(ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
				){
					return initializer.parameters;
				}
				return ts.factory.createNodeArray();
			}

			
		private createFunction(
				name: string,
				parameters: ts.NodeArray<ts.ParameterDeclaration>,
				sourceFile: ts.SourceFile,
			): ExportedFunction {
				const functionParameters = parameters.map((parameter) =>
				this.createParameter(parameter, sourceFile),
			);
			const returnType = 'unknown';

			return {
				name,
				parameters: functionParameters,
				returnType,
				signature: this.createSignature(name, functionParameters, returnType),
				requiredParameterCount: this.countRequiredParameters(functionParameters),
				maximumParameterCount: this.countMaximumParameters(functionParameters),
				hasRestParameter: functionParameters.some((parameter) => parameter.rest),
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
		
			private countRequiredParameters(parameters: FunctionParameter[]): number {
				return parameters.filter((parameter) => !parameter.optional && !parameter.rest)
					.length;
			}
		
			private countMaximumParameters(parameters: FunctionParameter[]): number {
				return parameters.filter((parameter) => !parameter.rest).length;
			}

		private extractClasses(sourceFile: ts.SourceFile): ExportedClass[] {
				return sourceFile.statements
					.filter(ts.isClassDeclaration)
					.filter((declaration) => this.hasClassApiName(declaration))
					.flatMap((declaration) => this.getExportedNames(
						sourceFile,
						declaration.name?.text ?? 'default',
						this.isExported(declaration),
					).map((name) => ({ name })));
			}

		private getExportedNames(
			sourceFile: ts.SourceFile,
			localName: string,
			directlyExported: boolean,
		): string[] {
			const names = directlyExported ? [localName] : [];
			for (const statement of sourceFile.statements) {
				if (
					ts.isExportDeclaration(statement) &&
					!statement.moduleSpecifier &&
					statement.exportClause &&
					ts.isNamedExports(statement.exportClause)
				) {
					for (const element of statement.exportClause.elements) {
						if ((element.propertyName?.text ?? element.name.text) === localName) {
							names.push(element.name.text);
						}
					}
				}
			}
			return [...new Set(names)];
		}

		private hasFunctionApiName(declaration: ts.FunctionDeclaration): boolean {
			return Boolean(declaration.name?.text) ||
			this.hasModifier(declaration, ts.SyntaxKind.DefaultKeyword);
		}
		private hasClassApiName(declaration: ts.ClassDeclaration): boolean {
			return Boolean(declaration.name?.text) ||
			this.hasModifier(declaration, ts.SyntaxKind.DefaultKeyword);
		}
		
			private isExported(node: ts.Node): boolean {
				return this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
			}
		
			private hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
				return ts.canHaveModifiers(node) &&
					Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));
			}
		
	private getScriptKind(filename: string): ts.ScriptKind {
		return filename.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
	}
}
