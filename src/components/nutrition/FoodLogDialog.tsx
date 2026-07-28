import { Dialog, DialogHeader } from "@astryxdesign/core";

import { AddFoodCard } from "~/components/nutrition/AddFoodCard";

/**
 * Wraps the full food-search + entry flow in a Dialog so search results
 * overlay instead of pushing page content down (PRD 06 Batch 2).
 *
 * @example
 * <FoodLogDialog isOpen={showDialog} onOpenChange={setShowDialog} selectedDate="2026-07-25" />
 */
export function FoodLogDialog({
  isOpen,
  onOpenChange,
  selectedDate,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={480}
    >
      <DialogHeader
        onOpenChange={onOpenChange}
        subtitle="Search the catalog or quick-add by calories."
        title="Log food"
      />
      <AddFoodCard selectedDate={selectedDate} />
    </Dialog>
  );
}
