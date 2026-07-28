import { describe, it, expect } from "vitest";

import { matchCachedFoodBarcode } from "~/components/nutrition/BarcodeScanner";
import {
  barcodeLookupVariants,
  isBarcodeDetectorSupported,
  normalizeBarcode,
} from "~/lib/barcode";
import type { Food } from "~/lib/db";

function sampleFood(overrides: Partial<Food> = {}): Food {
  return {
    barcode: "012345678905",
    brand: null,
    calories_per_serving: 200,
    carbs_g: 20,
    created_at: "2020-01-01",
    fat_g: 5,
    fiber_g: 0,
    id: 1,
    name: "Test Bar",
    protein_g: 10,
    serving_size: 100,
    serving_unit: "g",
    sodium_mg: 0,
    source: "user",
    sugar_g: 0,
    ...overrides,
  };
}

describe(normalizeBarcode, () => {
  it("strips spaces and accepts EAN-13 GTINs", () => {
    expect(normalizeBarcode("0 1234567 89012 3")).toBe("01234567890123");
  });

  it("rejects codes that are not valid GTIN lengths", () => {
    expect(normalizeBarcode("12345")).toBeNull();
  });
});

describe(barcodeLookupVariants, () => {
  it("adds a leading zero for 12-digit UPC-A codes", () => {
    expect(barcodeLookupVariants("123456789012")).toStrictEqual([
      "123456789012",
      "0123456789012",
    ]);
  });

  it("drops a leading zero from 13-digit EAN stored as UPC-A", () => {
    expect(barcodeLookupVariants("0012345678905")).toStrictEqual([
      "0012345678905",
      "012345678905",
    ]);
  });
});

describe(isBarcodeDetectorSupported, () => {
  it("is false in the node test environment", () => {
    expect(isBarcodeDetectorSupported()).toBeFalsy();
  });
});

describe(matchCachedFoodBarcode, () => {
  it("matches foods stored with an alternate GTIN form", () => {
    const foods = [sampleFood({ barcode: "0012345678905" })];
    expect(matchCachedFoodBarcode(foods, "012345678905")?.name).toBe(
      "Test Bar"
    );
  });
});
