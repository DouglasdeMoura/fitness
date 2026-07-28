import {
  Button,
  Dialog,
  DialogHeader,
  HStack,
  VStack,
} from "@astryxdesign/core";

export interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  onConfirm: () => void | Promise<void>;
  isConfirming?: boolean;
}

/**
 * Astryx confirmation for irreversible deletes (issue #25 / PRD 05 Batch 2).
 * @example
 * <DeleteConfirmationDialog
 *   isOpen={pending != null}
 *   onOpenChange={(open) => !open && setPending(null)}
 *   title="Delete this entry?"
 *   onConfirm={() => void confirmDelete()}
 * />
 */
export function DeleteConfirmationDialog({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  onConfirm,
  isConfirming,
}: DeleteConfirmationDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={360}
    >
      <DialogHeader
        title={title}
        subtitle={subtitle}
        onOpenChange={onOpenChange}
      />
      <VStack gap={3}>
        <HStack gap={2} hAlign="end" wrap="wrap">
          <Button
            label="Cancel delete"
            variant="secondary"
            size="lg"
            clickAction={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            label="Confirm delete"
            variant="destructive"
            size="lg"
            clickAction={() => void onConfirm()}
            isDisabled={isConfirming}
          >
            Delete
          </Button>
        </HStack>
      </VStack>
    </Dialog>
  );
}
