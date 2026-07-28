/**
 * Global keyboard shortcuts for power users (issue #35 — Batch 6).
 *
 * Registered shortcuts:
 *   /   — Focus the first visible search input
 *   n   — Open a new food-log entry dialog (nutrition page)
 *   ?   — Toggle the shortcuts help dialog
 *
 * The hook is a singleton listener on `document` that runs after the
 * component tree is mounted. Individual shortcuts can be disabled by
 * route or gated behind conditions (e.g. "n" only fires on /nutrition).
 */

import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  /** Focus the first search/auto-complete input on the page. */
  onFocusSearch: () => void;
  /** Open the new-entry flow (e.g. food-log dialog on /nutrition). */
  onNewEntry: () => void;
  /** Toggle the shortcuts help dialog. */
  onToggleHelp: () => void;
}

/**
 * Registers global keyboard shortcuts.
 *
 * Ignores events when the user is typing in an input, textarea, or
 * contenteditable element. Only fires for bare keypresses with no
 * modifier keys held.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  // Store callbacks in a ref so the effect closure always sees the latest.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      // Don't hijack when the user is typing in a field.
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Only bare keys — no Ctrl / Alt / Meta.
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const h = handlersRef.current;
      switch (event.key) {
        case "/": {
          event.preventDefault();
          h.onFocusSearch();
          break;
        }
        case "n": {
          event.preventDefault();
          h.onNewEntry();
          break;
        }
        case "?": {
          event.preventDefault();
          h.onToggleHelp();
          break;
        }
        default: {
          break;
        }
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, []);
}
