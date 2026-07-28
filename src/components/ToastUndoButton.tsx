import { Button } from "@astryxdesign/core/Button";

/**
 * Trailing Undo control for delete toasts (`endContent`).
 * @example <ToastUndoButton onUndo={() => void restoreEntry()} />
 */
export function ToastUndoButton({
  onUndo,
}: {
  onUndo: () => void | Promise<void>;
}) {
  return (
    <Button
      label="Undo"
      variant="secondary"
      size="sm"
      clickAction={() => {
        void onUndo();
      }}
    />
  );
}
