import { CodeAnalysis, CodeAnalyzer } from './CodeAnalyzer';
import { JsAnalyzer } from './JsAnalyzer';

export interface SourceAnalyzer {
	analyze(sourceText: string, fileName: string): CodeAnalysis;
}

export interface JavaScriptSourceAnalyzer extends SourceAnalyzer {
	supports(filePath: string): boolean;
}

export interface AnalyzerSelection {
	name: 'TypeScriptAnalyzer' | 'JsAnalyzer';
	analyzer: SourceAnalyzer;
}

export class AnalyzerFactory {
	constructor(
		private readonly typeScriptAnalyzer: SourceAnalyzer = new CodeAnalyzer(),
		private readonly javaScriptAnalyzer: JavaScriptSourceAnalyzer = new JsAnalyzer(),
	) {}

	getAnalyzer(filePath: string): SourceAnalyzer | undefined {
		return this.select(filePath)?.analyzer;
	}

	select(filePath: string): AnalyzerSelection | undefined {
		const extension = this.getExtension(filePath);
		if (extension === '.ts' || extension === '.tsx') {
			return filePath.toLowerCase().endsWith('.d.ts')
				? undefined
				: {
					name: 'TypeScriptAnalyzer',
					analyzer: this.typeScriptAnalyzer,
				};
		}
		if (this.javaScriptAnalyzer.supports(filePath)) {
			return {
				name: 'JsAnalyzer',
				analyzer: this.javaScriptAnalyzer,
			};
		}
		return undefined;
	}

	supports(filePath: string): boolean {
		return this.getAnalyzer(filePath) !== undefined;
	}

	private getExtension(filePath: string): string {
		const match = /\.[^.\\/]+$/.exec(filePath.toLowerCase());
		return match?.[0] ?? '';
	}
}
