#!/usr/bin/env node
/**
 * Rasterise public/icon.svg into the PNG sizes declared by the web app
 * manifest and apple-touch-icon link. Maskable variants keep the mark inside
 * the central 80% safe zone (W3C maskable icon guidance).
 *
 * Usage: npm run icons:build
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");
const SOURCE = join(PUBLIC, "icon.svg");
const BRAND = "#6741d9";
const SAFE_ZONE = 0.8;

if (!existsSync(SOURCE)) {
  throw new Error(
    `Missing icon source at ${SOURCE} (expected public/icon.svg)`
  );
}

mkdirSync(PUBLIC, { recursive: true });

/**
 * Rasterise the SVG mark to a transparent PNG of the given size.
 * @param {number} size
 * @param {string} outPath
 */
function rasterizeMark(size, outPath) {
  execFileSync(
    "rsvg-convert",
    ["-w", String(size), "-h", String(size), SOURCE, "-o", outPath],
    { stdio: "inherit" }
  );
}

/**
 * Composite the mark onto a solid brand canvas.
 * @param {{ outPath: string, canvas: number, mark: number, rounded?: boolean }} opts
 */
function compositeIcon({ outPath, canvas, mark, rounded = false }) {
  const tmpMark = join(PUBLIC, `.tmp-mark-${canvas}.png`);
  rasterizeMark(mark, tmpMark);

  const args = ["-size", `${canvas}x${canvas}`, `xc:${BRAND}`];

  if (rounded) {
    // Soft squircle mask for "any" / apple-touch icons (iOS expects rounded).
    const radius = Math.round(canvas * 0.2);
    args.push(
      "(",
      "+clone",
      "-alpha",
      "transparent",
      "-fill",
      "white",
      "-draw",
      `roundrectangle 0,0 ${canvas},${canvas} ${radius},${radius}`,
      ")",
      "-alpha",
      "off",
      "-compose",
      "copyopacity",
      "-composite"
    );
  }

  args.push(
    tmpMark,
    "-gravity",
    "center",
    "-compose",
    "over",
    "-composite",
    "-depth",
    "8",
    outPath
  );
  execFileSync("magick", args, { stdio: "inherit" });
  unlinkSync(tmpMark);
}

/**
 * Build a narrow/wide screenshot placeholder for the Android install UI.
 * @param {string} outPath
 * @param {number} width
 * @param {number} height
 * @param {string} label
 */
function buildScreenshot(outPath, width, height, label) {
  execFileSync(
    "magick",
    [
      "-size",
      `${width}x${height}`,
      "xc:#f5f5f5",
      "-fill",
      BRAND,
      "-draw",
      `rectangle 0,0 ${width},${Math.round(height * 0.12)}`,
      "-fill",
      "white",
      "-font",
      "Arial-Bold",
      "-pointsize",
      String(Math.max(28, Math.round(width * 0.06))),
      "-gravity",
      "north",
      "-annotate",
      `+0+${Math.round(height * 0.035)}`,
      "FitTrack",
      "-fill",
      "#333333",
      "-font",
      "Arial",
      "-pointsize",
      String(Math.max(18, Math.round(width * 0.035))),
      "-gravity",
      "center",
      "-annotate",
      "+0+0",
      label,
      "-depth",
      "8",
      outPath,
    ],
    { stdio: "inherit" }
  );
}

// "any" — mark fills most of the canvas (no maskable safe-zone padding).
compositeIcon({
  canvas: 192,
  mark: 154,
  outPath: join(PUBLIC, "icon-192.png"),
  rounded: true,
});
compositeIcon({
  canvas: 512,
  mark: 410,
  outPath: join(PUBLIC, "icon-512.png"),
  rounded: true,
});

// apple-touch-icon — 180×180; iOS ignores the web manifest for this.
compositeIcon({
  canvas: 180,
  mark: 144,
  outPath: join(PUBLIC, "apple-touch-icon.png"),
  rounded: true,
});

// "maskable" — meaningful content inside the central 80% circle.
compositeIcon({
  canvas: 192,
  mark: Math.round(192 * SAFE_ZONE),
  outPath: join(PUBLIC, "icon-maskable-192.png"),
  rounded: false,
});
compositeIcon({
  canvas: 512,
  mark: Math.round(512 * SAFE_ZONE),
  outPath: join(PUBLIC, "icon-maskable-512.png"),
  rounded: false,
});

buildScreenshot(
  join(PUBLIC, "screenshot-narrow.png"),
  390,
  844,
  "Nutrition & Workout Companion"
);
buildScreenshot(
  join(PUBLIC, "screenshot-wide.png"),
  1280,
  720,
  "Nutrition & Workout Companion"
);

console.log("Built PWA icons and screenshots into public/");
