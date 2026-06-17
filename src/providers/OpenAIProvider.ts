import {
	AIProvider,
	DocumentationUpdateRequest,
	GeneratedDocumentationUpdate,
} from './AIProvider';

interface OpenAIProviderOptions {
	apiKey: string;
	model: string;
	endpoint?: string;
	fetchClient?: FetchClient;
}

interface FetchClient {
	(url: string, init: FetchRequest): Promise<FetchResponse>;
}

interface FetchRequest {
	method: 'POST';
	headers: Record<string, string>;
	body: string;
}

interface FetchResponse {
	ok: boolean;
	status: number;
	statusText: string;
	json(): Promise<unknown>;
}

interface OpenAITextItem {
	type: string;
	text?: string;
}

/**
 * OpenAI implementation of AIProvider. It is only used after configuration has
 * supplied a user-owned API key, so drift detection never depends on it.
 */
export class OpenAIProvider implements AIProvider {
	private readonly endpoint: string;
	private readonly fetchClient: FetchClient;

	constructor(private readonly options: OpenAIProviderOptions) {
		this.endpoint = options.endpoint ?? 'https://api.openai.com/v1/responses';
		this.fetchClient = options.fetchClient ?? fetch;
	}

	async generateDocumentationUpdate(
		request: DocumentationUpdateRequest,
	): Promise<GeneratedDocumentationUpdate> {
		const response = await this.fetchClient(this.endpoint, {
			method: 'POST',
			headers: this.createHeaders(),
			body: JSON.stringify(this.createBody(request)),
		});

		if (!response.ok) {
			throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
		}

		const body = await response.json();
		return {
			documentPath: request.documentPath,
			content: this.extractText(body),
			summary: `Generated documentation update for ${request.finding.apiName}.`,
		};
	}

	private createHeaders(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.options.apiKey}`,
			'Content-Type': 'application/json',
		};
	}

	private createBody(request: DocumentationUpdateRequest): object {
		return {
			model: this.options.model,
			input: this.createPrompt(request),
		};
	}

	private createPrompt(request: DocumentationUpdateRequest): string {
		return [
			'Generate a concise documentation update for this API drift finding.',
			'Return only the updated documentation text.',
			`Document path: ${request.documentPath}`,
			`Finding: ${request.finding.message}`,
			request.finding.signature ? `Signature: ${request.finding.signature}` : '',
			'Current documentation:',
			request.currentContent,
		].filter((line) => line.length > 0).join('\n\n');
	}

	private extractText(body: unknown): string {
		if (this.hasOutputText(body)) {
			return body.output_text.trim();
		}

		const nestedText = this.extractNestedText(body);
		if (nestedText) {
			return nestedText.trim();
		}

		throw new Error('OpenAI response did not include generated text.');
	}

	private hasOutputText(body: unknown): body is { output_text: string } {
		return typeof body === 'object' &&
			body !== null &&
			'output_text' in body &&
			typeof body.output_text === 'string';
	}

	private extractNestedText(body: unknown): string | undefined {
		if (!this.hasOutput(body)) {
			return undefined;
		}

		for (const item of body.output) {
			const text = this.extractContentText(item);
			if (text) {
				return text;
			}
		}

		return undefined;
	}

	private hasOutput(body: unknown): body is { output: unknown[] } {
		return typeof body === 'object' &&
			body !== null &&
			'output' in body &&
			Array.isArray(body.output);
	}

	private extractContentText(item: unknown): string | undefined {
		if (!this.hasContent(item)) {
			return undefined;
		}

		return item.content
			.map((content) => content.text)
			.find((text): text is string => typeof text === 'string');
	}

	private hasContent(item: unknown): item is { content: OpenAITextItem[] } {
		return typeof item === 'object' &&
			item !== null &&
			'content' in item &&
			Array.isArray(item.content);
	}
}
