import { describe, expect, it } from 'vitest'
import {
  deleteCannotBeUndoneSubtitle,
  deleteFoodEntryTitle,
  deleteNamedEntityTitle,
  deleteWorkoutSetTitle,
} from '~/lib/delete-confirmation'

describe('delete confirmation copy (issue #25)', () => {
  it('uses the exact dialog titles from PRD 05 section 2', () => {
    expect(deleteFoodEntryTitle()).toBe('Delete this entry?')
    expect(deleteWorkoutSetTitle()).toBe('Delete this set?')
    expect(deleteNamedEntityTitle('Push Day')).toBe("Delete 'Push Day'?")
    expect(deleteCannotBeUndoneSubtitle()).toBe('This cannot be undone.')
  })
})
