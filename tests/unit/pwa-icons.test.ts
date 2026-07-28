import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PUBLIC = join(process.cwd(), "public");

/** Read width/height from a PNG IHDR chunk (bytes 16–23). */
function pngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(
      `Not a PNG (len=${buf.length}, sig=${buf.subarray(0, 8).toString("hex")})`
    );
  }
  return {
    height: buf.readUInt32BE(20),
    width: buf.readUInt32BE(16),
  };
}

describe("PWA icon assets (issue #48)", () => {
  it("keeps public/icon.svg as the committed source of truth", () => {
    expect(existsSync(join(PUBLIC, "icon.svg"))).toBeTruthy();
    const svg = readFileSync(join(PUBLIC, "icon.svg"), "utf-8");
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toMatch(/#ffffff|#fff/i);
  });

  it.each([
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-192.png", 192],
    ["icon-maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ] as const)("%s exists and decodes to %d×%d", (name, size) => {
    const path = join(PUBLIC, name);
    expect(existsSync(path)).toBeTruthy();
    const dims = pngDimensions(readFileSync(path));
    expect(dims).toStrictEqual({ height: size, width: size });
  });

  it("ships screenshots at the sizes declared in the manifest", () => {
    expect(
      pngDimensions(readFileSync(join(PUBLIC, "screenshot-narrow.png")))
    ).toStrictEqual({
      height: 844,
      width: 390,
    });
    expect(
      pngDimensions(readFileSync(join(PUBLIC, "screenshot-wide.png")))
    ).toStrictEqual({
      height: 720,
      width: 1280,
    });
  });
});

describe("web app manifest (issue #48)", () => {
  const manifest = JSON.parse(
    readFileSync(join(PUBLIC, "manifest.json"), "utf-8")
  ) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose: string }[];
    screenshots: { src: string; form_factor: string }[];
  };

  it("declares required install fields", () => {
    expect(manifest.name).toMatch(/FitTrack/);
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("splits any and maskable icon purposes (no combined any maskable)", () => {
    const purposes = manifest.icons.map((icon) => icon.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
    expect(purposes.every((p) => p === "any" || p === "maskable")).toBeTruthy();
  });

  it("points maskable entries at the padded maskable assets", () => {
    const maskable = manifest.icons.filter(
      (icon) => icon.purpose === "maskable"
    );
    expect(maskable.length).toBeGreaterThanOrEqual(2);
    for (const icon of maskable) {
      expect(icon.src).toMatch(/maskable/);
    }
  });

  it("declares screenshots for a richer Android install UI", () => {
    expect(manifest.screenshots.length).toBeGreaterThanOrEqual(2);
    expect(
      manifest.screenshots.some((s) => s.form_factor === "narrow")
    ).toBeTruthy();
    expect(
      manifest.screenshots.some((s) => s.form_factor === "wide")
    ).toBeTruthy();
  });
});
