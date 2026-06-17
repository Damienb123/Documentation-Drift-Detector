# Documentation Drift Detector

Documentation Drift Detector is a VS Code extension that helps TypeScript projects catch documentation drift before code is committed or released.

It scans changed exported APIs and local documentation, then reports cases where documentation may no longer match the source code. Detection works offline and does not require AI.

## Beta Notice

Documentation Drift Detector is currently in beta.

The extension may produce false positives and does not yet support every form of documentation drift. It is intended to surface likely documentation issues early, especially around exported TypeScript APIs and local examples.

## Supported Detection

Current beta detection includes:

- Undocumented exported functions
- Undocumented exported classes
- Function argument/signature mismatches in documented examples
- Documentation reference scanning across:
  - `README.md`
  - `docs/`
  - `examples/`

For example, if code exports:

```ts
export function createUser(name: string, email: string): unknown
```

and documentation shows:

```ts
createUser("Smith")
```

the extension can report a drift finding because the documented example provides one argument while the function requires two.

## Commands

- `Documentation Drift: Check Workspace`
- `Documentation Drift: Generate Documentation Update`

## How Detection Works

`Documentation Drift: Check Workspace` runs the local detection workflow:

```text
Command -> GitService -> CodeAnalyzer -> DocumentationScanner -> DriftDetector -> OutputChannel -> Popup Summary
```

The report includes:

- Workspace
- Git status
- Changed files
- Documentation files scanned
- Exported APIs found
- Drift findings

## Extension Settings

- `docDrift.documentation.scanPaths`: Workspace-relative files or directories to scan. Defaults to `["README.md", "docs", "examples"]`.
- `docDrift.ai.enabled`: Enables optional AI assistance. Defaults to `false`.
- `docDrift.ai.openAIApiKey`: User-provided OpenAI API key for optional documentation generation.
- `docDrift.ai.openAIModel`: OpenAI model used for optional generation. Defaults to `gpt-4.1-mini`.

## AI Behavior

AI is not required for detection. If AI assistance is disabled or no API key is configured, the extension continues to scan documentation and detect possible drift locally.

When AI assistance is enabled, generated documentation is returned as a preview so you can review it before making edits.

## Beta Scope

This beta focuses on the local MVP:

- TypeScript projects
- Exported function and class analysis
- Local documentation scanning
- Function argument-count validation for documented calls
- Optional OpenAI documentation update previews

The beta does not include billing, authentication, backend services, team dashboards, GitHub integration, or cloud infrastructure.
