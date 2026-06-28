// JavaScript language support for plugin
import * as ts from 'typescript';
import { CodeAnalysis, ExportedClass, ExportedFunction, FunctionParameter } from './CodeAnalyzer';


export interface ExportedClass {
	name: string;
}

export interface CodeAnalysis {
	functions: ExportedFunction[];
	classes: ExportedClass[];
}

export class JsAnalyzer {
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

	// --------------------------------------------------------------------------------------------------
	// Main area of the development for JS support - In progress

	// JS ES model support - takes some qualities of the main CodeAnalyzer but is reused to support JS syntax
	private extractFunction(sourceFile: ts.SourceFile): ExportedFunction[] {
		// rewritten to return function declaration
			return [
				...this.extractFunctionDeclarations(sourceFile),
				...this.extractVariableFunctions(sourceFile),
			];
				
		}
		// Skeleton of function declaration
		// Push extractFunctionDeclaration and extractVariableFunction functions to repo
		private extractFunctionDeclarations(sourceFile: ts.SourceFile): ExportedFunction[] {
			return sourceFile.statements
				.filter((ts.isFunctionDeclaration))
				.filter((declaration) => this.isExported(declaration))
				.filter((declaration) => this.hasFunctionApiName(declaration))
				.map((declaration) =>
					this.createFunction(
						declaration.name?.text ?? 'default',
						declaration.parameters,
						sourceFile,
					),
				);
		}
		// Variable extraction within functions in a source file of JS
		// filters valid function variables and valid variable params when a function is created
		private extractVariableFunctions(sourceFile: ts.SourceFile): ExportedFunction[]{
			return sourceFile.statements
				.filter((ts.isVariableStatement))
				.filter((statement) => this.isExported(statement))
				.flatMap((statement) => 
				statement.declarationList.declarations
					.filter((declaration) => this.isFunctionVariable(declaration))
					.map((declaration) => 
					this.createFunction(
						declaration.name.getText(sourceFile),
						this.getFunctionVariableParameters(declaration),
						sourceFile,
					),
				),
			);
		}

		private isFunctionVariable(
			declaration: ts.VariableDeclaration,
		): boolean {
			return Boolean(
				declaration.initializer && 
				(ts.isArrowFunction(declaration.initializer) ||
			ts.isFunctionDeclaration(declaration.initializer)),
			);
		}
		
		// TODO: complete the function and refactor the createFunction to work against utilizing ES model for JS
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
					requiredParameterCount: this.countRequiredParameters(parameters),
					maximumParameterCount: this.countMaximumParameters(parameters),
					hasRestParameter: parameters.some((parameter) => parameter.rest),
				};
			}
		
			// -------------------------------------------------------------------------------

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
					.filter((declaration) => this.isExported(declaration))
					.filter((declaration) => this.hasClassApiName(declaration))
					.map((declaration) => ({
						name: declaration.name?.text ?? 'default',
					}));
			}

		private hasFunctionApiName(declaration: ts.FunctionDeclaration): boolean {
			return Boolean(declaration.name?.text) ||
			this.hasModifier(declaration, ts.SyntaxKind.DefaultKeyword)
		}
		private hasClassApiName(declaration: ts.ClassDeclaration): boolean {
			return Boolean(declaration.name?.text) ||
			this.hasModifier(declaration, ts.SyntaxKind.DefaultKeyword)
		}
		
			private isExported(node: ts.Node): boolean {
				return this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
			}
		
			private hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
				return ts.canHaveModifiers(node) &&
					Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));
			}
		
	private getScriptKind(filename: string): ts.ScriptKind {
		return filename.endsWith('jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
	}
}
