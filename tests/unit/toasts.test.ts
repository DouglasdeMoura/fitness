import { describe, expect, it } from 'vitest'
import {
  dataExportedBody,
  entryDeletedBody,
  foodLoggedBody,
  mutationFailedBody,
  profileSavedBody,
  setDeletedBody,
  setSavedBody,
  TOAST_DURATION_MS,
  weightLoggedBody,
} from '~/lib/toasts'

describe('toast copy (issue #24)', () => {
  it('uses the exact confirmation bodies from the design sweep', () => {
    expect(profileSavedBody()).toBe('Profile saved')
    expect(foodLoggedBody()).toBe('Food logged')
    expect(entryDeletedBody()).toBe('Entry deleted')
    expect(setSavedBody()).toBe('Set saved')
    expect(setDeletedBody()).toBe('Set deleted')
    expect(dataExportedBody()).toBe('Data exported')
  })

  it('includes the logged weight in kilograms', () => {
    expect(weightLoggedBody(75.5)).toBe('Weight logged — 75.5kg')
    expect(weightLoggedBody(80)).toBe('Weight logged — 80kg')
  })

  it('builds persistent error bodies as "{action} failed"', () => {
    expect(mutationFailedBody('Save profile')).toBe('Save profile failed')
    expect(mutationFailedBody('Log food')).toBe('Log food failed')
    expect(mutationFailedBody('Export data')).toBe('Export data failed')
  })

  it('keeps undo deletes visible for 8s and set saves for 3s', () => {
    expect(TOAST_DURATION_MS.undo).toBe(8000)
    expect(TOAST_DURATION_MS.setSaved).toBe(3000)
    expect(TOAST_DURATION_MS.info).toBe(5000)
  })
})
