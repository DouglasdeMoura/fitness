import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const settingsFile = "src/routes/settings/index.tsx";
const settingsSource = readFileSync(join(projectRoot, settingsFile), "utf-8");
interface SourceScanHit {
  line: number;
  lineContent: string;
  rule: string;
}

function scanForbiddenLines(
  source: string,
  filePath: string,
  rules: { name: string; pattern: RegExp }[]
): SourceScanHit[] {
  const hits: SourceScanHit[] = [];
  const lines = source.split("\n");

  for (const [index, lineContent] of lines.entries()) {
    for (const rule of rules) {
      if (rule.pattern.test(lineContent)) {
        hits.push({
          line: index + 1,
          lineContent: lineContent.trim(),
          rule: rule.name,
        });
      }
    }
  }

  if (hits.length > 0) {
    return hits;
  }

  return hits;
}

function formatScanHits(filePath: string, hits: SourceScanHit[]): string {
  return hits
    .map((hit) => `${filePath}:${hit.line} ${hit.rule}: ${hit.lineContent}`)
    .join("\n");
}

const FORBIDDEN_THEME_CONTROL_PATTERNS = [
  { name: "binary theme Switch component", pattern: /<Switch\b/ },
  { name: "switch role on theme control", pattern: /role=["']switch["']/ },
  { name: "resolved-mode isDark binding", pattern: /\bisDark\b/ },
] as const;

describe("settings theme control gate (issue #99)", () => {
  it("rejects a binary switch or resolved-mode isDark binding in Settings", () => {
    const hits = scanForbiddenLines(settingsSource, settingsFile, [
      ...FORBIDDEN_THEME_CONTROL_PATTERNS,
    ]);

    expect(
      hits,
      hits.length > 0
        ? formatScanHits(settingsFile, hits)
        : "no forbidden theme-control patterns found"
    ).toEqual([]);
  });

  it("writes ThemePreference through the server-backed appearance control", () => {
    const requiredMarkers = [
      { name: "ThemePreference type", pattern: /\bThemePreference\b/ },
      { name: "themePreference state", pattern: /\bthemePreference\b/ },
      {
        name: "updateThemePreference server write",
        pattern: /\bupdateThemePreference\b/,
      },
      {
        name: "theme_preference payload",
        pattern: /theme_preference:\s*preference/,
      },
    ] as const;

    const missing = requiredMarkers.filter(
      (marker) => !marker.pattern.test(settingsSource)
    );

    expect(
      missing.map((marker) => marker.name),
      missing.length > 0
        ? `${settingsFile} missing required theme-preference markers: ${missing
            .map((marker) => marker.name)
            .join(", ")}`
        : "all required theme-preference markers present"
    ).toEqual([]);
  });

  it("documents the three-way Appearance radiogroup segments", () => {
    expect(settingsSource).toContain('label="Appearance"');
    expect(settingsSource).toContain('<SegmentedControlItem label="Light"');
    expect(settingsSource).toContain('<SegmentedControlItem label="System"');
    expect(settingsSource).toContain('<SegmentedControlItem label="Dark"');
  });

  it("names the offending file and line when a forbidden pattern is present", () => {
    const sampleHits = scanForbiddenLines(
      '  <Switch label="Dark Mode" />\n',
      settingsFile,
      [...FORBIDDEN_THEME_CONTROL_PATTERNS]
    );

    expect(formatScanHits(settingsFile, sampleHits)).toBe(
      `${settingsFile}:1 binary theme Switch component: <Switch label="Dark Mode" />`
    );
  });
});
