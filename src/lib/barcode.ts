/** GS1 GTIN lengths used on retail packaging (issue #58). */
const VALID_GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/**
 * Strip non-digits and validate GTIN length for packaged-food barcodes.
 * @example normalizeBarcode('0 1234567 89012 3') // '01234567890123'
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replaceAll(/\D/gu, "");
  if (!VALID_GTIN_LENGTHS.has(digits.length)) {
    return null;
  }
  return digits;
}

/**
 * Alternate stored forms for the same physical barcode (UPC-A vs EAN-13).
 * @example barcodeLookupVariants('012345678905') // ['012345678905', '12345678905']
 */
export function barcodeLookupVariants(normalized: string): string[] {
  const variants = new Set<string>([normalized]);
  if (normalized.length === 12) {
    variants.add(`0${normalized}`);
  }
  if (normalized.length === 13 && normalized.startsWith("0")) {
    variants.add(normalized.slice(1));
  }
  return [...variants];
}

/** True when the browser exposes the BarcodeDetector API (not iOS Safari). */
export function isBarcodeDetectorSupported(): boolean {
  return typeof globalThis !== "undefined" && "BarcodeDetector" in globalThis;
}
