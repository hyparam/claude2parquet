import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { parquetWriteFile } from 'hyparquet-writer'

const defaultFilename = 'claude_code.parquet'

/**
 * Recursively find all .jsonl files under a directory, excluding subagents.
 * @param {string} dir
 * @returns {string[]}
 */
function findJsonlFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'subagents') continue
      files.push(...findJsonlFiles(full))
    } else if (entry.name.endsWith('.jsonl')) {
      files.push(full)
    }
  }
  return files
}

/**
 * Extract project name from project directory name.
 * e.g. "-Users-kenny-code-libs-hyparquet" -> "hyparquet"
 * @param {string} dirName
 * @returns {string}
 */
function projectName(dirName) {
  const parts = dirName.replace(/^-/, '').split('-')
  return parts[parts.length - 1] || dirName
}

/**
 * Flatten message content to a string.
 * @param {any} content
 * @returns {string}
 */
function flattenContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return JSON.stringify(content)
  return content.map(block => {
    if (block.type === 'text') return block.text
    if (block.type === 'thinking') return ''
    if (block.type === 'tool_use') return `[tool: ${block.name}]`
    if (block.type === 'tool_result') {
      if (typeof block.content === 'string') return block.content
      if (Array.isArray(block.content)) {
        // eslint-disable-next-line jsdoc/require-returns
        return block.content.map(/** @param {any} c */ c => c.type === 'text' ? c.text : `[${c.type}]`).join('')
      }
      return ''
    }
    return ''
  }).filter(Boolean).join('\n')
}

/**
 * Convert an absolute path to the claude projects directory name format.
 * e.g. "/Users/kenny/code/libs/hyparquet" -> "-Users-kenny-code-libs-hyparquet"
 * @param {string} absolutePath
 * @returns {string}
 */
function toProjectDirName(absolutePath) {
  return absolutePath.replace(/[/.]/g, '-')
}

/**
 * Parse a --since value to a lower-bound ISO timestamp string.
 * @param {string} value
 * @returns {string}
 */
function parseSince(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid --since date: ${value}`)
  return d.toISOString()
}

/**
 * Parse a --until value to an upper-bound ISO timestamp string. Bare YYYY-MM-DD
 * values are treated as end-of-day so the range is inclusive of that day.
 * @param {string} value
 * @returns {string}
 */
function parseUntil(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid --until date: ${value}`)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(d.getTime() + 86400000 - 1).toISOString()
  }
  return d.toISOString()
}

/**
 * Read and parse all session logs into flat rows.
 * @param {{project?: string, since?: string, until?: string}} [opts]
 * @returns {Record<string, string>[]}
 */
function readLogs(opts = {}) {
  const claudeDir = join(homedir(), '.claude')
  const projectsDir = join(claudeDir, 'projects')
  const rows = []
  const since = opts.since ? parseSince(opts.since) : ''
  const until = opts.until ? parseUntil(opts.until) : ''
  let projectDirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())

  if (opts.project) {
    const resolvedPath = resolve(opts.project)
    const targetDirName = toProjectDirName(resolvedPath)
    projectDirs = projectDirs.filter(d => d.name === targetDirName)
  }

  for (const projDir of projectDirs) {
    const project = projectName(projDir.name)
    const projPath = join(projectsDir, projDir.name)
    const jsonlFiles = findJsonlFiles(projPath)

    for (const file of jsonlFiles) {
      const raw = readFileSync(file, 'utf8').trim()
      if (!raw) continue

      for (const line of raw.split('\n')) {
        let obj
        try {
          obj = JSON.parse(line)
        } catch {
          continue
        }

        // Only keep user and assistant messages
        if (obj.type !== 'user' && obj.type !== 'assistant') continue

        const msg = obj.message
        if (!msg) continue

        const timestamp = obj.timestamp || ''
        if (since || until) {
          if (!timestamp) continue
          if (since && timestamp < since) continue
          if (until && timestamp > until) continue
        }

        rows.push({
          project,
          session_id: obj.sessionId || '',
          uuid: obj.uuid || '',
          timestamp,
          type: obj.type,
          role: msg.role || '',
          model: msg.model || '',
          content: flattenContent(msg.content),
          version: obj.version || '',
          cwd: obj.cwd || '',
          git_branch: obj.gitBranch || '',
        })
      }
    }
  }

  // Sort by timestamp
  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return rows
}

/**
 * Convert rows into column-oriented data for hyparquet-writer.
 * @param {Record<string, string>[]} rows
 * @returns {{name: string, data: string[]}[]}
 */
function toColumnData(rows) {
  return [
    { name: 'project', data: rows.map(r => r.project) },
    { name: 'session_id', data: rows.map(r => r.session_id) },
    { name: 'uuid', data: rows.map(r => r.uuid) },
    { name: 'timestamp', data: rows.map(r => r.timestamp) },
    { name: 'type', data: rows.map(r => r.type) },
    { name: 'role', data: rows.map(r => r.role) },
    { name: 'model', data: rows.map(r => r.model) },
    { name: 'content', data: rows.map(r => r.content) },
    { name: 'version', data: rows.map(r => r.version) },
    { name: 'cwd', data: rows.map(r => r.cwd) },
    { name: 'git_branch', data: rows.map(r => r.git_branch) },
  ]
}

/**
 * Write Claude Code session logs to a Parquet file.
 * @param {{filename?:string, project?:string, since?:string, until?:string}} [opts]
 * @returns {Promise<{messageCount:number, sessionCount:number, filename:string}>}
 */
export async function writeClaudeLogsParquet(opts = {}) {
  if (opts && typeof opts !== 'object') {
    throw new Error('Options must be an object')
  }

  if (opts.filename && typeof opts.filename !== 'string') {
    throw new Error('Filename must be a string')
  }

  const rows = readLogs({ project: opts.project, since: opts.since, until: opts.until })
  if (!rows.length) {
    if (opts.project) {
      const resolvedPath = resolve(opts.project)
      throw new Error(
        `No Claude Code logs found for project: ${resolvedPath}\n` +
        'Run from a directory where Claude Code has been used, or specify:\n' +
        '  --project ~/path/to/project\n' +
        '  --all                        (for all Claude Code logs)'
      )
    }
    throw new Error('No Claude Code logs found in ~/.claude/projects/')
  }

  let defaultName = defaultFilename
  if (!opts.filename && opts.project) {
    const projName = resolve(opts.project).split('/').pop()
    if (projName) defaultName = `claude_code_${projName}.parquet`
  }
  const filename = resolve(opts.filename ?? defaultName)

  try {
    await parquetWriteFile({
      filename,
      columnData: toColumnData(rows),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to write parquet file: ${message}`)
  }

  const sessionCount = new Set(rows.map(r => r.session_id)).size
  return { messageCount: rows.length, sessionCount, filename }
}
