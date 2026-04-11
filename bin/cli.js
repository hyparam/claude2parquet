#!/usr/bin/env node

import { writeClaudeLogsParquet } from '../src/index.js'

/**
 * Parse command line arguments
 */
function parseCliArgs() {
  const args = process.argv.slice(2)
  const options = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--help' || arg === '-h') {
      console.log(`claude2parquet

Usage: claude2parquet [options]

Options:
  --output <file>      Output parquet filename (default: claude_logs.parquet)
  --project <path>     Filter logs to a specific project directory
  -h, --help           Show this help message

Examples:
  claude2parquet                           # Export to claude_logs.parquet
  claude2parquet --output logs.parquet     # Export to logs.parquet
  claude2parquet --project .               # Export logs for current directory`)
      process.exit(0)
    }

    if (arg === '--output' || arg === '-o') {
      if (i + 1 >= args.length) {
        console.error('Error: --output requires a filename argument')
        process.exit(1)
      }
      options.filename = args[++i]
      continue
    }

    if (arg === '--project') {
      if (i + 1 >= args.length) {
        console.error('Error: --project requires a path argument')
        process.exit(1)
      }
      options.project = args[++i]
      continue
    }

    console.error(`Error: Unknown option '${arg}'`)
    console.error('Use --help for usage information')
    process.exit(1)
  }

  return options
}

// CLI entry point
const options = parseCliArgs()

writeClaudeLogsParquet(options).then(result => {
  const cwd = process.cwd()
  const localPath = result.filename.startsWith(cwd)
    ? result.filename.slice(cwd.length + 1)
    : result.filename
  const filename = result.filename.split('/').pop()

  console.log(`\u2713 Exported ${result.messageCount} messages from ${result.sessionCount} sessions to ${filename}`)

  const line1 = 'Analyze logs with Hyperparam:'
  const line2 = `npx hyperparam scope ${localPath}`
  const width = Math.max(line1.length, line2.length) + 2
  const top = '\u256D' + '\u2500'.repeat(width) + '\u256E'
  const bottom = '\u2570' + '\u2500'.repeat(width) + '\u256F'
  const pad1 = ' '.repeat(width - 1 - line1.length)
  const pad2 = ' '.repeat(width - 1 - line2.length)
  console.log(`\n${top}`)
  console.log(`\u2502 ${line1}${pad1}\u2502`)
  console.log(`\u2502 \x1b[36m${line2}\x1b[0m${pad2}\u2502`)
  console.log(`${bottom}\n`)
}).catch(err => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
