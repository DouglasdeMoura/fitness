"use client";

import {
  Button,
  Dialog,
  DialogHeader,
  FormLayout,
  HStack,
  Text,
  TextInput,
  VStack,
} from "@astryxdesign/core";
import { useToast } from "@astryxdesign/core/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  addFoodLogEntry,
  getFoodByBarcode,
  getLoggedFoodStats,
} from "~/lib/api";
import {
  barcodeLookupVariants,
  isBarcodeDetectorSupported,
  normalizeBarcode,
} from "~/lib/barcode";
import type { Food } from "~/lib/db";
import { buildFoodLogDraft, mealTypeForHour } from '~/lib/nutrition';
import type { MealType } from '~/lib/nutrition';
import { getCachedFoodByBarcode, runOrQueue } from "~/lib/offline";
import { foodLoggedBody, mutationFailedBody } from "~/lib/toasts";

interface BarcodeScannerProps {
  selectedDate: string;
  onSelectFood: (food: Food) => void;
  onCreateFood: (barcode: string) => void;
}

type LookupState =
  | { status: "idle" }
  | { status: "looking" }
  | { status: "found"; food: Food; mealType: MealType; servings: number }
  | { status: "missing"; barcode: string }
  | { status: "invalid" }
  | { status: "error"; message: string };

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
}

async function resolveFoodByBarcode(raw: string): Promise<Food | null> {
  try {
    return await getFoodByBarcode({ data: { barcode: raw } });
  } catch {
    return getCachedFoodByBarcode(raw);
  }
}

async function defaultLogContext(
  foodId: number
): Promise<{ mealType: MealType; servings: number }> {
  try {
    const stats = await getLoggedFoodStats();
    const match = stats.find((row) => row.food_id === foodId);
    if (match) {
      return { mealType: match.last_meal_type, servings: match.last_servings };
    }
  } catch {
    // Offline or transient failure — fall back to sensible defaults.
  }
  return { mealType: mealTypeForHour(new Date().getHours()), servings: 1 };
}

/**
 * Scan or type a packaged-food GTIN, match against remembered foods, and log or create.
 * Camera starts only after the user taps Scan (issue #58).
 * @example <BarcodeScanner selectedDate="2026-07-25" onSelectFood={select} onCreateFood={prefill} />
 */
export function BarcodeScanner({
  selectedDate,
  onSelectFood,
  onCreateFood,
}: BarcodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const scanningRef = useRef(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [detectorSupported, setDetectorSupported] = useState(false);

  useEffect(() => {
    setDetectorSupported(isBarcodeDetectorSupported());
  }, []);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetDialog = useCallback(() => {
    stopCamera();
    setManualBarcode("");
    setLookup({ status: "idle" });
    setCameraError(null);
  }, [stopCamera]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {resetDialog();}
    },
    [resetDialog]
  );

  const logFood = useCallback(
    async (food: Food, servings: number, mealType: MealType) => {
      const entry = buildFoodLogDraft(food, servings, selectedDate, mealType);
      try {
        const outcome = await runOrQueue("addFoodLogEntry", entry, () =>
          addFoodLogEntry({ data: entry })
        );
        toast({ body: foodLoggedBody() });
        if (!outcome.queued) {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ["food-log", selectedDate],
            }),
            queryClient.invalidateQueries({ queryKey: ["recent-foods"] }),
            queryClient.invalidateQueries({ queryKey: ["logged-food-stats"] }),
          ]);
        }
        handleOpenChange(false);
      } catch {
        toast({ body: mutationFailedBody("Log food"), type: "error" });
      }
    },
    [handleOpenChange, queryClient, selectedDate, toast]
  );

  const runLookup = useCallback(async (raw: string) => {
    const normalized = normalizeBarcode(raw);
    if (!normalized) {
      setLookup({ status: "invalid" });
      return;
    }
    setLookup({ status: "looking" });
    const food = await resolveFoodByBarcode(raw);
    if (!food) {
      setLookup({ barcode: normalized, status: "missing" });
      return;
    }
    const context = await defaultLogContext(food.id);
    setLookup({ food, status: "found", ...context });
  }, []);

  const startCamera = useCallback(async () => {
    if (!detectorSupported || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {return;}
      video.srcObject = stream;
      await video.play();
      const Detector = (
        globalThis as {
          BarcodeDetector?: new (opts: {
            formats: string[];
          }) => BarcodeDetectorLike;
        }
      ).BarcodeDetector;
      if (!Detector) {return;}
      detectorRef.current = new Detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });
      scanningRef.current = true;
      const tick = async () => {
        if (!scanningRef.current || !detectorRef.current || !videoRef.current)
          {return;}
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          const hit = codes.find((code) => normalizeBarcode(code.rawValue));
          if (hit) {
            stopCamera();
            await runLookup(hit.rawValue);
            return;
          }
        } catch {
          // Detection can fail on a single frame; keep scanning.
        }
        if (scanningRef.current) {
          requestAnimationFrame(() => {
            void tick();
          });
        }
      };
      void tick();
    } catch {
      setCameraError(
        "Camera access was denied or is unavailable. Enter the barcode manually."
      );
    }
  }, [detectorSupported, runLookup, stopCamera]);

  const openScanner = useCallback(() => {
    resetDialog();
    setIsOpen(true);
    if (detectorSupported) {
      void startCamera();
    }
  }, [detectorSupported, resetDialog, startCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <>
      <Button
        label="Scan barcode"
        variant="secondary"
        clickAction={openScanner}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        purpose="form"
        width={360}
      >
        <DialogHeader
          title="Scan barcode"
          subtitle={
            detectorSupported
              ? "Point your camera at the barcode. HTTPS is required except on localhost."
              : "Enter the barcode from the package (manual entry — camera scanning is not supported in this browser)."
          }
          onOpenChange={handleOpenChange}
        />
        <VStack gap={3}>
          {detectorSupported ? (
            <VStack gap={2}>
              <video
                ref={videoRef}
                playsInline
                muted
                aria-label="Barcode camera preview"
              />
              {cameraError ? (
                <Text type="supporting">{cameraError}</Text>
              ) : null}
            </VStack>
          ) : null}
          <FormLayout>
            <TextInput
              label="Barcode"
              value={manualBarcode}
              onChange={setManualBarcode}
              placeholder="e.g. 012345678905"
            />
          </FormLayout>
          <HStack gap={2} wrap="wrap">
            <Button
              label="Look up barcode"
              variant="primary"
              clickAction={() => void runLookup(manualBarcode)}
              isDisabled={lookup.status === "looking"}
            />
            <Button
              label="Cancel barcode scan"
              clickAction={() => handleOpenChange(false)}
            />
          </HStack>
          {lookup.status === "looking" ? (
            <Text type="supporting">Looking up barcode…</Text>
          ) : null}
          {lookup.status === "invalid" ? (
            <Text type="supporting">
              Enter a valid GTIN (8, 12, 13, or 14 digits).
            </Text>
          ) : null}
          {lookup.status === "error" ? (
            <Text type="supporting">{lookup.message}</Text>
          ) : null}
          {lookup.status === "found" ? (
            <VStack gap={2}>
              <Text type="label">{lookup.food.name}</Text>
              <Text type="supporting">
                {lookup.food.calories_per_serving} kcal per{" "}
                {lookup.food.serving_size}
                {lookup.food.serving_unit}
              </Text>
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Log food"
                  variant="primary"
                  clickAction={() =>
                    void logFood(lookup.food, lookup.servings, lookup.mealType)
                  }
                />
                <Button
                  label="Adjust servings"
                  clickAction={() => {
                    onSelectFood(lookup.food);
                    handleOpenChange(false);
                  }}
                />
              </HStack>
            </VStack>
          ) : null}
          {lookup.status === "missing" ? (
            <VStack gap={2}>
              <Text type="supporting">
                No food saved for barcode {lookup.barcode}. Add it once and
                future scans will match.
              </Text>
              <Button
                label="Add this food"
                variant="primary"
                clickAction={() => {
                  onCreateFood(lookup.barcode);
                  handleOpenChange(false);
                }}
              />
            </VStack>
          ) : null}
        </VStack>
      </Dialog>
    </>
  );
}

/** Exported for unit tests — offline bundle lookup by GTIN variants. */
export function matchCachedFoodBarcode(
  foods: readonly Food[],
  raw: string
): Food | null {
  const normalized = normalizeBarcode(raw);
  if (!normalized) {return null;}
  const variants = new Set(barcodeLookupVariants(normalized));
  return (
    foods.find((food) => food.barcode != null && variants.has(food.barcode)) ??
    null
  );
}
