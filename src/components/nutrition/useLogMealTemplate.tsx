import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@astryxdesign/core/Toast'
import { ToastUndoButton } from '~/components/ToastUndoButton'
import { deleteFoodLogEntries, logMealTemplate } from '~/lib/api'
import type { MealType } from '~/lib/nutrition'
import { runOrQueue } from '~/lib/offline'
import {
  mutationFailedBody,
  templateLoggedBody,
  TOAST_DURATION_MS,
} from '~/lib/toasts'

type LogMealTemplateArgs = {
  templateId: number
  mealType: MealType
  expectedKcal: number
}

/**
 * Logs a saved meal template with toast + undo (issue #56).
 * @example const logTemplate = useLogMealTemplate('2020-01-01')
 */
export function useLogMealTemplate(selectedDate: string) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const invalidateFoodLog = async () => {
    await queryClient.invalidateQueries({ queryKey: ['food-log', selectedDate] })
  }

  return async ({ templateId, mealType, expectedKcal }: LogMealTemplateArgs) => {
    const payload = { templateId, date: selectedDate, mealType }
    try {
      const outcome = await runOrQueue('logMealTemplate', payload, () =>
        logMealTemplate({ data: payload }),
      )
      if (!outcome.queued) {
        await invalidateFoodLog()
        const entryIds = outcome.result.entries.map((entry) => entry.id)
        const kcal = outcome.result.total_calories
        let dismiss = () => {}
        dismiss = toast({
          body: templateLoggedBody(kcal),
          autoHideDuration: TOAST_DURATION_MS.undo,
          endContent: (
            <ToastUndoButton
              onUndo={async () => {
                dismiss()
                try {
                  await runOrQueue('deleteFoodLogEntries', { ids: entryIds }, () =>
                    deleteFoodLogEntries({ data: { ids: entryIds } }),
                  )
                  await invalidateFoodLog()
                } catch {
                  toast({ body: mutationFailedBody('Undo log'), type: 'error' })
                }
              }}
            />
          ),
        })
        return
      }
      toast({ body: templateLoggedBody(expectedKcal) })
    } catch {
      toast({ body: mutationFailedBody('Log meal'), type: 'error' })
    }
  }
}
