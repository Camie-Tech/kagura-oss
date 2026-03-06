# @kagura-run/cli

Command line interface for Kagura AI. Run agentic end-to-end tests from your terminal.

## Installation

Install the CLI globally via npm:

```bash
npm install -g @kagura-run/cli
```

## Setup

The CLI relies on the `@kagura-run/core` engine which requires an Anthropic API key to function. Make sure to export this variable in your shell.

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

You can test any target URL by supplying the URL and a description of the test flow you want the AI to run:

```bash
kagura run --url "https://your-app.com" --desc "Test the signup flow"
```

## License

Apache-2.0
