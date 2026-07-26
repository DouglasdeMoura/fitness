import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'
import { formatDisplayDecimal, formatDisplayInteger } from '~/lib/format-number'

describe('formatDisplayInteger', () => {
  it('rounds and formats whole numbers with grouping', () => {
    expect(formatDisplayInteger(1980.4)).toBe('1,980')
    expect(formatDisplayInteger(42)).toBe('42')
  })
})

describe('formatDisplayDecimal', () => {
  it('formats fixed-decimal weights and trends', () => {
    expect(formatDisplayDecimal(76.24)).toBe('76.2')
    expect(formatDisplayDecimal(7, 1)).toBe('7.0')
  })
})

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('format-number is the sole display formatter module (issue #50)', () => {
  it('is the only file exporting formatDisplay* helpers', () => {
    const projectRoot = join(import.meta.dirname, '../..')
    const offenders: string[] = []

    for (const file of listSourceFiles(join(projectRoot, 'src'))) {
      const relativePath = relative(projectRoot, file).replaceAll('\\', '/')
      if (relativePath === 'src/lib/format-number.ts') {
        continue
      }
      const content = readFileSync(file, 'utf8')
      if (/export function formatDisplay(?:Integer|Decimal)\b/.test(content)) {
        offenders.push(relativePath)
      }
    }

    expect(offenders, offenders.join(', ')).toEqual([])
  })
})
