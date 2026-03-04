import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { parquetWriteFile } from 'hyparquet-writer'

const claudeDir = join(homedir(), '.claude')
const projectsDir = join(claudeDir, 'projects')

/**
 * Recursively find all .jsonl files under a directory, excluding subagents.
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
 */
function projectName(dirName) {
  const parts = dirName.replace(/^-/, '').split('-')
  return parts[parts.length - 1] || dirName
}

/**
 * Flatten message content to a string.
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
        return block.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join('')
      }
      return ''
    }
    return ''
  }).filter(Boolean).join('\n')
}

/**
 * Read and parse all session logs into flat rows.
 */
function readLogs() {
  const rows = []
  const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())

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

        rows.push({
          project,
          session_id: obj.sessionId || '',
          uuid: obj.uuid || '',
          timestamp: obj.timestamp || '',
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

const rows = readLogs()
console.log(`Read ${rows.length} messages from ${new Set(rows.map(r => r.session_id)).size} sessions`)

const columnData = [
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

const outPath = resolve('claude_logs.parquet')
parquetWriteFile({ filename: outPath, columnData })
console.log(`Wrote ${outPath}`)
