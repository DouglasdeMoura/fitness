import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCAN_ROOTS = ['src', 'public', 'tests', 'scripts'] as const
const IGNORED = new Set(['node_modules', '.output', 'dist', 'data'])

const VAPID_LITERAL =
  /VAPID_(?:PUBLIC|PRIVATE)_KEY\s*=\s*['"]?[A-Za-z0-9_-]{20,}['"]?/

function listTrackedFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED.has(entry)) continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      listTrackedFiles(fullPath, files)
      continue
    }
    if (/\.(ts|tsx|js|mjs|md|json)$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

describe('VAPID keys are not committed (issue #65)', () => {
  it('has no VAPID key literals in tracked source files', () => {
    const projectRoot = join(import.meta.dirname, '../..')
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      const absoluteRoot = join(projectRoot, root)
      for (const file of listTrackedFiles(absoluteRoot)) {
        const relativePath = relative(projectRoot, file).replaceAll('\\', '/')
        if (relativePath === '.env' || relativePath.endsWith('.env.example')) {
          continue
        }
        const content = readFileSync(file, 'utf8')
        if (VAPID_LITERAL.test(content)) {
          offenders.push(relativePath)
        }
      }
    }

    expect(offenders, offenders.join(', ')).toEqual([])
  })
})
