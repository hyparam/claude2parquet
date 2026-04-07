# claude2parquet

[![npm](https://img.shields.io/npm/v/claude2parquet)](https://www.npmjs.com/package/claude2parquet)
[![mit license](https://img.shields.io/badge/License-MIT-orange.svg)](https://opensource.org/licenses/MIT)
[![dependencies](https://img.shields.io/badge/Dependencies-1-blueviolet)](https://www.npmjs.com/package/claude2parquet?activeTab=dependencies)

A command-line tool to convert Claude Code session logs to Parquet format for data analysis and AI applications.

## Installation

```bash
npm install -g claude2parquet
```

## Usage

### Command Line

```bash
# Export Claude Code logs to claude_logs.parquet
claude2parquet

# Export to custom filename
claude2parquet --output logs.parquet

# Export logs for the current project directory only
claude2parquet --project .
```

## Output Schema

The generated Parquet file contains the following columns:

- `project` (STRING): Project name derived from the session directory
- `session_id` (STRING): Unique session identifier
- `uuid` (STRING): Unique message identifier
- `timestamp` (STRING): Message timestamp in ISO format
- `type` (STRING): Message type (user or assistant)
- `role` (STRING): Message role
- `model` (STRING): Model used for assistant messages
- `content` (STRING): Flattened message content
- `version` (STRING): Claude Code version
- `cwd` (STRING): Working directory at time of message
- `git_branch` (STRING): Active git branch at time of message

## Requirements

- Node.js
- Claude Code must be installed with session logs in `~/.claude/projects/`

## Options

- `--output <file>`, `-o <file>`: Output parquet filename (default: `claude_logs.parquet`)
- `--project <path>`: Filter logs to a specific project directory
- `--help`, `-h`: Show help message

## Use Cases

- Analyzing Claude Code usage patterns across projects
- Training ML models on human-AI coding interactions
- Creating datasets for software engineering research
- Building usage dashboards and productivity metrics

## Hyperparam

[Hyperparam](https://hyperparam.app) is a tool for exploring and curating AI datasets, such as those produced by claude2parquet.
