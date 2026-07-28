import {
  Button,
  Dialog,
  DialogHeader,
  HStack,
  VStack,
} from "@astryxdesign/core";

export interface DeleteConfirmationDialogProps {
  isConfirming?: boolean;
  isOpen: boolean;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  subtitle?: string;
  title: string;
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
        onOpenChange={onOpenChange}
        subtitle={subtitle}
        title={title}
      />
      <VStack gap={3}>
        <HStack gap={2} hAlign="end" wrap="wrap">
          <Button
            clickAction={() => onOpenChange(false)}
            label="Cancel delete"
            size="lg"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            clickAction={() => {
              onConfirm();
            }}
            isDisabled={isConfirming}
            label="Confirm delete"
            size="lg"
            variant="destructive"
          >
            Delete
          </Button>
        </HStack>
      </VStack>
    </Dialog>
  );
}
