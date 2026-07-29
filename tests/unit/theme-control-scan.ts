import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Sole module allowed to render a theme control (PRD 18 Batch 5, issue #95). */
export const THEME_CONTROL_OWNER = "src/routes/settings/index.tsx";

/** Module that defines persistTheme; calls here are not UI controls. */
export const PERSIST_THEME_DEFINITION_FILE = "src/lib/app-chrome.ts";

export type ThemeControlMarkerKind =
  | "applyThemePreference-handler"
  | "persistTheme-handler"
  | "toggle-dark-mode-label";

export interface ThemeControlMarker {
  filePath: string;
  line: number;
  lineContent: string;
  kind: ThemeControlMarkerKind;
}

export interface ThemeControlModule {
  filePath: string;
  markers: ThemeControlMarker[];
}

const TOGGLE_DARK_MODE_LABEL_PATTERN = /Toggle dark mode/;
const APPLY_THEME_PREFERENCE_CALL_PATTERN = /\bapplyThemePreference\s*\(/;
const PERSIST_THEME_CALL_PATTERN = /\bpersistTheme\s*\(/;

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function isApplyThemePreferenceDefinition(line: string): boolean {
  return /export\s+function\s+applyThemePreference\b/.test(line);
}

function isApplyThemePreferenceImport(line: string): boolean {
  return /\bimport\b.*\bapplyThemePreference\b/.test(line);
}

function isPersistThemeDefinition(line: string): boolean {
  return /export\s+function\s+persistTheme\b/.test(line);
}

function isPersistThemeImport(line: string): boolean {
  return /\bimport\b.*\bpersistTheme\b/.test(line);
}

function shouldScanApplyThemePreferenceHandler(
  filePath: string,
  line: string
): boolean {
  const normalizedPath = normalizePath(filePath);
  if (normalizedPath === PERSIST_THEME_DEFINITION_FILE) {
    return false;
  }
  if (
    isApplyThemePreferenceDefinition(line) ||
    isApplyThemePreferenceImport(line)
  ) {
    return false;
  }
  return APPLY_THEME_PREFERENCE_CALL_PATTERN.test(line);
}

function shouldScanPersistThemeHandler(
  filePath: string,
  line: string
): boolean {
  const normalizedPath = normalizePath(filePath);
  if (normalizedPath === PERSIST_THEME_DEFINITION_FILE) {
    return false;
  }
  if (isPersistThemeDefinition(line) || isPersistThemeImport(line)) {
    return false;
  }
  return PERSIST_THEME_CALL_PATTERN.test(line);
}

/** Return theme-control markers in one source file. */
export function findThemeControlMarkers(
  source: string,
  filePath: string
): ThemeControlMarker[] {
  const normalizedPath = normalizePath(filePath);
  const markers: ThemeControlMarker[] = [];

  for (const [index, line] of source.split("\n").entries()) {
    const lineNumber = index + 1;

    if (TOGGLE_DARK_MODE_LABEL_PATTERN.test(line)) {
      markers.push({
        filePath: normalizedPath,
        kind: "toggle-dark-mode-label",
        line: lineNumber,
        lineContent: line.trim(),
      });
    }

    if (shouldScanApplyThemePreferenceHandler(normalizedPath, line)) {
      markers.push({
        filePath: normalizedPath,
        kind: "applyThemePreference-handler",
        line: lineNumber,
        lineContent: line.trim(),
      });
    }

    if (shouldScanPersistThemeHandler(normalizedPath, line)) {
      markers.push({
        filePath: normalizedPath,
        kind: "persistTheme-handler",
        line: lineNumber,
        lineContent: line.trim(),
      });
    }
  }

  return markers;
}

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (entry === "generated") {
        continue;
      }
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    if (absolutePath.endsWith(".ts") || absolutePath.endsWith(".tsx")) {
      files.push(absolutePath);
    }
  }

  return files;
}

/** Walk src/ and group theme-control markers by module. */
export function scanThemeControlModules(
  projectRoot: string
): ThemeControlModule[] {
  const srcRoot = join(projectRoot, "src");
  const modulesByPath = new Map<string, ThemeControlMarker[]>();

  for (const absolutePath of collectSourceFiles(srcRoot)) {
    const relativePath = normalizePath(relative(projectRoot, absolutePath));
    const source = readFileSync(absolutePath, "utf-8");
    const markers = findThemeControlMarkers(source, relativePath);
    if (markers.length > 0) {
      modulesByPath.set(relativePath, markers);
    }
  }

  return [...modulesByPath.entries()].map(([filePath, markers]) => ({
    filePath,
    markers,
  }));
}

/** Format one actionable gate failure with its source location. */
export function formatThemeControlMarker(marker: ThemeControlMarker): string {
  return `${marker.filePath}:${marker.line} ${marker.lineContent}`;
}

/** Describe a scan result that does not match the single-owner invariant. */
export function formatThemeControlScanFailure(
  modules: ThemeControlModule[],
  expectedOwner: string = THEME_CONTROL_OWNER
): string {
  if (modules.length === 0) {
    return `expected exactly one theme control in ${expectedOwner}, found 0 modules`;
  }

  const owner = modules.find((module) => module.filePath === expectedOwner);
  if (modules.length === 1 && owner) {
    return "";
  }

  const lines: string[] = [];
  if (!owner) {
    lines.push(
      `expected theme control owner ${expectedOwner}, but that module has no markers`
    );
  }
  if (modules.length !== 1) {
    lines.push(
      `expected exactly one theme control module, found ${modules.length}`
    );
  }

  for (const module of modules) {
    for (const marker of module.markers) {
      lines.push(formatThemeControlMarker(marker));
    }
  }

  return lines.join("\n");
}
