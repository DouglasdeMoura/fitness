import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  TOKEN_RULES,
  type TokenRule,
  type TokenScanResult,
  scanTokenViolations,
} from './token-scan'

type Baseline = TokenScanResult

function loadBaseline(): Baseline {
  const path = join(import.meta.dirname, 'token-baseline.json')
  return JSON.parse(readFileSync(path, 'utf8')) as Baseline
}

function formatIncreaseMessage(
  file: string,
  rule: TokenRule,
  expected: number,
  actual: number,
): string {
  return [
    `Token violation count increased for ${file} [${rule}].`,
    `Expected at most ${expected}, found ${actual}.`,
    'Remove the new inline style, className, layout <div>, or raw hex colour.',
  ].join(' ')
}

function formatUnexpectedFileMessage(
  file: string,
  rule: TokenRule,
  actual: number,
): string {
  return [
    `Unexpected token violation in ${file} [${rule}].`,
    `Expected 0, found ${actual}.`,
    'This file is not in token-baseline.json — new route/component code must be token-compliant.',
  ].join(' ')
}

function formatDecreaseMessage(
  file: string,
  rule: TokenRule,
  expected: number,
  actual: number,
): string {
  return [
    `Token violation count decreased for ${file} [${rule}].`,
    `Baseline still records ${expected}, found ${actual}.`,
    'Lower the count in tests/unit/token-baseline.json (or remove the file entry when all rules reach 0).',
  ].join(' ')
}

describe('token compliance ratchet (issue #50)', () => {
  const actual = scanTokenViolations()
  const baseline = loadBaseline()

  it('matches the committed per-file per-rule baseline (ratchet)', () => {
    const failures: string[] = []

    for (const file of Object.keys(baseline)) {
      const baselineCounts = baseline[file] ?? {}
      const actualCounts = actual[file] ?? {}

      for (const rule of TOKEN_RULES) {
        const expected = baselineCounts[rule] ?? 0
        const found = actualCounts[rule] ?? 0

        if (found > expected) {
          failures.push(formatIncreaseMessage(file, rule, expected, found))
        } else if (found < expected) {
          failures.push(formatDecreaseMessage(file, rule, expected, found))
        }
      }
    }

    for (const file of Object.keys(actual)) {
      if (baseline[file]) {
        continue
      }
      for (const rule of TOKEN_RULES) {
        const found = actual[file]?.[rule] ?? 0
        if (found > 0) {
          failures.push(formatUnexpectedFileMessage(file, rule, found))
        }
      }
    }

    expect(failures, failures.join('\n\n')).toEqual([])
  })

  it('does not flag allowlisted theme-color hex in __root.tsx', () => {
    const rootCounts = actual['src/routes/__root.tsx']
    expect(rootCounts?.rawHex ?? 0).toBe(0)
  })
})
