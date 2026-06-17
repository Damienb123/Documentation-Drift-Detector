import type * as fsTypes from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type DocumentationSection = 'readme' | 'docs' | 'examples';

export interface DocumentationReference {
	value: string;
	line: number;
}

export interface DocumentationDocument {
	path: string;
	section: DocumentationSection;
	content: string;
	references: DocumentationReference[];
}

export interface DocumentationIndexData {
	documents: DocumentationDocument[];
	references: DocumentationReference[];
}

export interface DocumentationFileSystem {
	readFile(filePath: string, encoding: BufferEncoding): Promise<string>;
	readdir(
		directoryPath: string,
		options: { withFileTypes: true },
	): Promise<fsTypes.Dirent[]>;
	stat(filePath: string): Promise<fsTypes.Stats>;
}

export interface DocumentationIndexOptions {
	scanPaths?: string[];
}

/**
 * Builds a deterministic index of documentation surfaces. Drift detection can
 * later compare exported API names against these documents and references.
 */
export class DocumentationIndex {
	constructor(
		private readonly workspacePath: string,
		private readonly fileSystem: DocumentationFileSystem = fs,
		private readonly options: DocumentationIndexOptions = {},
	) {}

	async build(): Promise<DocumentationIndexData> {
		const documents = await this.readScanPaths();

		return {
			documents,
			references: documents.flatMap((document) => document.references),
		};
	}

	private async readScanPaths(): Promise<DocumentationDocument[]> {
		const documents: DocumentationDocument[] = [];

		for (const scanPath of this.getScanPaths()) {
			documents.push(...await this.readScanPath(scanPath));
		}

		return documents;
	}

	private async readScanPath(scanPath: string): Promise<DocumentationDocument[]> {
		const absolutePath = path.join(this.workspacePath, scanPath);
		if (!(await this.exists(absolutePath))) {
			return [];
		}

		const stats = await this.fileSystem.stat(absolutePath);
		if (stats.isDirectory()) {
			return this.sortDocuments(await this.readDirectory(absolutePath));
		}

		if (!stats.isFile() || !this.isIndexableFile(absolutePath)) {
			return [];
		}

		return [await this.readDocument(absolutePath, scanPath)];
	}

	private sortDocuments(
		documents: DocumentationDocument[],
	): DocumentationDocument[] {
		return [...documents].sort((left, right) =>
			left.path.localeCompare(right.path),
		);
	}

	private async readDirectory(
		directoryPath: string,
	): Promise<DocumentationDocument[]> {
		const filePaths = await this.listFiles(directoryPath);
		return Promise.all(
			filePaths
				.filter((filePath) => this.isIndexableFile(filePath))
				.map((filePath) => this.readDocument(
					filePath,
					this.toWorkspacePath(filePath),
				)),
		);
	}

	private async listFiles(directoryPath: string): Promise<string[]> {
		const entries = await this.fileSystem.readdir(directoryPath, {
			withFileTypes: true,
		});
		const files: string[] = [];

		for (const entry of entries) {
			const entryPath = path.join(directoryPath, entry.name);
			if (entry.isDirectory()) {
				files.push(...await this.listFiles(entryPath));
			} else if (entry.isFile()) {
				files.push(entryPath);
			}
		}

		return files;
	}

	private async readDocument(
		filePath: string,
		documentPath: string,
	): Promise<DocumentationDocument> {
		const content = await this.fileSystem.readFile(filePath, 'utf8');
		const normalizedPath = this.normalizePath(documentPath);

		return {
			path: normalizedPath,
			section: this.getSection(normalizedPath),
			content,
			references: this.extractReferences(content),
		};
	}

	private extractReferences(content: string): DocumentationReference[] {
		const references = new Map<string, DocumentationReference>();
		const lines = content.split(/\r?\n/);

		for (let index = 0; index < lines.length; index += 1) {
			for (const value of this.extractLineReferences(lines[index])) {
				if (!references.has(value)) {
					references.set(value, {
						value,
						line: index + 1,
					});
				}
			}
		}

		return [...references.values()].sort((left, right) =>
			left.value.localeCompare(right.value),
		);
	}

	private extractLineReferences(line: string): string[] {
		const references = new Set<string>();
		const patterns = [
			/[`#]\s*([A-Za-z_$][\w$]*)/g,
			/\b([A-Za-z_$][\w$]*)\s*\(/g,
		];

		for (const pattern of patterns) {
			for (const match of line.matchAll(pattern)) {
				references.add(match[1]);
			}
		}

		return [...references];
	}

	private async exists(filePath: string): Promise<boolean> {
		try {
			await this.fileSystem.stat(filePath);
			return true;
		} catch (error) {
			if (this.isMissingPathError(error)) {
				return false;
			}

			throw error;
		}
	}

	private isMissingPathError(error: unknown): boolean {
		return error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT';
	}

	private isIndexableFile(filePath: string): boolean {
		return [
			'.js',
			'.jsx',
			'.json',
			'.md',
			'.mdx',
			'.ts',
			'.tsx',
			'.txt',
			'.yaml',
			'.yml',
		].includes(path.extname(filePath).toLowerCase());
	}

	private toWorkspacePath(filePath: string): string {
		return path.relative(this.workspacePath, filePath);
	}

	private normalizePath(filePath: string): string {
		return filePath.split(path.sep).join('/');
	}

	private getScanPaths(): string[] {
		return this.options.scanPaths ?? ['README.md', 'docs', 'examples'];
	}

	private getSection(filePath: string): DocumentationSection {
		if (filePath === 'README.md') {
			return 'readme';
		}

		if (filePath.startsWith('examples/')) {
			return 'examples';
		}

		return 'docs';
	}
}
