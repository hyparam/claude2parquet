#!/usr/bin/env node

import { writeClaudeLogsParquet } from '../src/index.js'
import { execSync } from 'node:child_process'

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

Usage: claude2parquet [filename] [options]

Arguments:
  filename              Output parquet filename (default: claude_logs.parquet)

Options:
  -h, --help           Show this help message
      --open           Open the parquet file with hyperparam after export

Examples:
  claude2parquet                           # Export to claude_logs.parquet
  claude2parquet logs.parquet              # Export to logs.parquet
  claude2parquet --open                    # Export and open with hyperparam
  claude2parquet logs.parquet --open       # Export to logs.parquet and open`)
      process.exit(0)
    }

    if (arg === '--open') {
      options.open = true
      continue
    }

    if (arg.startsWith('-')) {
      console.error(`Error: Unknown option '${arg}'`)
      console.error('Use --help for usage information')
      process.exit(1)
    }

    if (options.filename) {
      console.error('Error: Multiple filenames provided')
      console.error('Use --help for usage information')
      process.exit(1)
    }

    options.filename = arg
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

  if (options.open) {
    console.log(`\u2713 Exported ${result.messageCount} messages from ${result.sessionCount} sessions to ${filename}.`)
    console.log(`Opening ${filename} with hyperparam...`)
    try {
      execSync(`npx hyperparam ${localPath}`, { stdio: 'inherit' })
    } catch (error) {
      console.error(`Failed to open with hyperparam: ${error.message}`)
      console.log(`View it manually with:\n\n  npx hyperparam ${localPath}\n`)
    }
  } else {
    console.log(`\u2713 Exported ${result.messageCount} messages from ${result.sessionCount} sessions to ${filename}. View it with:\n\n  npx hyperparam ${localPath}\n`)
  }
}).catch(err => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
