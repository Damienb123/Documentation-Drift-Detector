# Documentation-Drift-Detector

A VS Code extension that detects when code changes but related documentation has not been updated.

## Why?

Developers often update code but forget to update documentation.

### Common examples:

- Function signatures change
- README examples become outdated
- API documentation no longer matches implementation
- Example projects stop working

This extension helps identify potential documentation drift before code is committed or merged.

## Tech Stack
### Core
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![VS Code Extension API](https://img.shields.io/badge/VS%20Code%20Extension%20API-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)
![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white)
![TypeScript Compiler API](https://img.shields.io/badge/TypeScript%20Compiler%20API-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

### AI
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge&logo=ollama&logoColor=white)

### Testing
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)

## Features
### MVP
- Analyze TypeScript projects
- Detect exported function changes
- Detect exported class changes
- Scan README.md
- Scan example files
- Warn when documentation may be outdated
### Planned Features
- AI-generated documentation updates
- GitHub Pull Request integration
- Documentation diagnostics in the Problems panel
- Quick Fix actions
- Multi-language support

## Development
### Install
``` npm install ```
### Build
``` npm run compile ```
### Run

Press:

F5

This launches the Extension Development Host.

Use the Command Palette:

Documentation Drift: Check Workspace

## Current Status

Early Development

The project is currently focused on building the core detection engine.
