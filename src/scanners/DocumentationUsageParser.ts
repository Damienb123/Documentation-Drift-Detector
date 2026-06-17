export interface DocumentationFunctionCall {
	name: string;
	argumentCount: number;
	example: string;
	line: number;
}

interface ParsedCall {
	endIndex: number;
	argumentCount: number;
}

export class DocumentationUsageParser {
	parseFunctionCalls(
		content: string,
		functionName: string,
	): DocumentationFunctionCall[] {
		const calls: DocumentationFunctionCall[] = [];
		let searchIndex = 0;

		while (searchIndex < content.length) {
			const nameIndex = content.indexOf(functionName, searchIndex);
			if (nameIndex === -1) {
				break;
			}

			const call = this.parseCallAt(content, functionName, nameIndex);
			if (call) {
				calls.push({
					name: functionName,
					argumentCount: call.argumentCount,
					example: this.formatExample(content.slice(nameIndex, call.endIndex + 1)),
					line: this.getLine(content, nameIndex),
				});
				searchIndex = call.endIndex + 1;
			} else {
				searchIndex = nameIndex + functionName.length;
			}
		}

		return calls;
	}

	private parseCallAt(
		content: string,
		functionName: string,
		nameIndex: number,
	): ParsedCall | undefined {
		if (!this.hasIdentifierBoundary(content, nameIndex, functionName.length)) {
			return undefined;
		}

		const openIndex = this.findOpenParenthesis(content, nameIndex + functionName.length);
		if (openIndex === undefined) {
			return undefined;
		}

		const closeIndex = this.findCloseParenthesis(content, openIndex);
		if (closeIndex === undefined) {
			return undefined;
		}

		return {
			endIndex: closeIndex,
			argumentCount: this.countArguments(content.slice(openIndex + 1, closeIndex)),
		};
	}

	private findOpenParenthesis(content: string, index: number): number | undefined {
		let current = index;
		while (current < content.length && /\s/.test(content[current])) {
			current += 1;
		}

		return content[current] === '(' ? current : undefined;
	}

	private findCloseParenthesis(content: string, openIndex: number): number | undefined {
		let depth = 0;
		let quote: string | undefined;
		let escaped = false;

		for (let index = openIndex; index < content.length; index += 1) {
			const char = content[index];
			const state = this.updateStringState(char, quote, escaped);
			quote = state.quote;
			escaped = state.escaped;
			if (quote) {
				continue;
			}

			depth += char === '(' ? 1 : 0;
			depth -= char === ')' ? 1 : 0;
			if (depth === 0) {
				return index;
			}
		}

		return undefined;
	}

	private countArguments(argumentText: string): number {
		if (argumentText.trim().length === 0) {
			return 0;
		}

		let count = 1;
		let depth = 0;
		let quote: string | undefined;
		let escaped = false;
		for (const char of argumentText) {
			const state = this.updateStringState(char, quote, escaped);
			quote = state.quote;
			escaped = state.escaped;
			if (!quote) {
				depth += '([{'.includes(char) ? 1 : 0;
				depth -= ')]}'.includes(char) ? 1 : 0;
				count += char === ',' && depth === 0 ? 1 : 0;
			}
		}

		return count;
	}

	private updateStringState(
		char: string,
		quote: string | undefined,
		escaped: boolean,
	): { quote: string | undefined; escaped: boolean } {
		if (!quote && ['"', "'", '`'].includes(char)) {
			return { quote: char, escaped: false };
		}

		if (!quote || escaped) {
			return { quote, escaped: false };
		}

		return {
			quote: char === quote ? undefined : quote,
			escaped: char === '\\',
		};
	}

	private hasIdentifierBoundary(
		content: string,
		nameIndex: number,
		nameLength: number,
	): boolean {
		return !this.isIdentifierPart(content[nameIndex - 1]) &&
			!this.isIdentifierPart(content[nameIndex + nameLength]);
	}

	private isIdentifierPart(char: string | undefined): boolean {
		return Boolean(char && /[A-Za-z0-9_$]/.test(char));
	}

	private getLine(content: string, index: number): number {
		return content.slice(0, index).split(/\r?\n/).length;
	}

	private formatExample(example: string): string {
		return example.replace(/\s+/g, ' ').trim();
	}
}
