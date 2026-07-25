import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getStoredTheme, isNavSelected } from '~/lib/app-chrome'

describe('isNavSelected', () => {
  it('selects Dashboard only on the exact home path', () => {
    expect(isNavSelected('/', '/', true)).toBe(true)
    expect(isNavSelected('/nutrition', '/', true)).toBe(false)
    expect(isNavSelected('/workout/programs', '/', true)).toBe(false)
  })

  it('selects section routes including nested paths', () => {
    expect(isNavSelected('/nutrition', '/nutrition')).toBe(true)
    expect(isNavSelected('/nutrition/templates', '/nutrition')).toBe(true)
    expect(isNavSelected('/nutrition/planning', '/nutrition')).toBe(true)
    expect(isNavSelected('/workout', '/nutrition')).toBe(false)
  })

  it('does not treat sibling prefixes as selected', () => {
    expect(isNavSelected('/workout-extra', '/workout')).toBe(false)
    expect(isNavSelected('/progress', '/workout')).toBe(false)
  })
})

describe('getStoredTheme', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to light when nothing is stored', () => {
    expect(getStoredTheme()).toBe('light')
  })

  it('returns dark when fittrack-theme is dark', () => {
    localStorage.setItem('fittrack-theme', 'dark')
    expect(getStoredTheme()).toBe('dark')
  })

  it('treats unknown values as light', () => {
    localStorage.setItem('fittrack-theme', 'sepia')
    expect(getStoredTheme()).toBe('light')
  })
})
