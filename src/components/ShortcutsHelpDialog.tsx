import {
  Dialog,
  DialogHeader,
  HStack,
  Kbd,
  Text,
  VStack,
} from "@astryxdesign/core";

interface ShortcutsHelpDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  { description: "Focus search input", key: "/" },
  { description: "New entry (food log on Nutrition page)", key: "n" },
  { description: "Show this shortcuts help", key: "?" },
] as const;

export function ShortcutsHelpDialog({
  isOpen,
  onOpenChange,
}: ShortcutsHelpDialogProps) {
  return (
    <Dialog
      aria-label="Keyboard shortcuts"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <DialogHeader
        onOpenChange={() => onOpenChange(false)}
        title="Keyboard Shortcuts"
      />
      <VStack gap={4}>
        <Text type="body">
          Press these keys anywhere (except inside text fields) to navigate
          faster.
        </Text>
        <VStack gap={2}>
          {SHORTCUTS.map((shortcut) => (
            <HStack gap={3} key={shortcut.key} vAlign="center">
              <Kbd keys={shortcut.key} />
              <Text type="body">{shortcut.description}</Text>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </Dialog>
  );
}
