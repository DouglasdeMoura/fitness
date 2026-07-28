import type { Page } from "@playwright/test";

/** Migrated routes measured by computed-style design gates (issue #50). */
export const DESIGN_GATE_ROUTES = [
  "/",
  "/nutrition",
  "/progress",
  "/settings",
  "/workout",
] as const;

export type DesignGateRoute = (typeof DESIGN_GATE_ROUTES)[number];

/** Astryx motion duration tokens in milliseconds (astryx docs motion). */
export const ASTRYX_DURATION_MS = [
  130, 175, 230, 310, 410, 550, 730, 975, 1300,
] as const;

const DURATION_TOLERANCE_MS = 25;
const MIN_HERO_RATIO = 2.5;
const MIN_SECTION_GAP_PX = 24;
const MIN_BODY_CONTRAST = 4.5;

function _parseRgb(color: string): [number, number, number] | null {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/u);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(
  foreground: [number, number, number],
  background: [number, number, number]
): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background)
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background)
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function parseDurationMs(value: string): number {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "0s" || trimmed === "0ms") {
    return 0;
  }
  if (trimmed.endsWith("ms")) {
    return Number.parseFloat(trimmed);
  }
  return Number.parseFloat(trimmed) * 1000;
}

function isTokenDuration(ms: number): boolean {
  if (ms === 0) {
    return true;
  }
  return ASTRYX_DURATION_MS.some(
    (token) => Math.abs(token - ms) <= DURATION_TOLERANCE_MS
  );
}

function parseRem(value: string, rootPx: number): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  if (trimmed.endsWith("rem")) {
    return Number.parseFloat(trimmed) * rootPx;
  }
  if (trimmed.endsWith("px")) {
    return Number.parseFloat(trimmed);
  }
  return Number.parseFloat(trimmed);
}

export interface HeroMetricRatio {
  bodyPx: number;
  heroPx: number;
  ratio: number;
  text: string;
}

/** Largest hero metric token size vs body text token size on the page. */
export async function measureHeroMetricRatio(
  page: Page
): Promise<HeroMetricRatio | null> {
  return page.evaluate(
    ({ minRatio }) => {
      const rootPx = Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize
      );
      const bodyToken = getComputedStyle(document.documentElement)
        .getPropertyValue("--text-body-size")
        .trim();
      const bodyPx = bodyToken.endsWith("rem")
        ? Number.parseFloat(bodyToken) * rootPx
        : Number.parseFloat(bodyToken);

      const heroSizes = new Set(["2xl", "3xl", "4xl", "5xl"]);
      const heroes = [...document.querySelectorAll("main [data-size]")].filter(
        (element) => {
          const text = element.textContent?.trim() ?? "";
          const { size } = element.dataset;
          const tag = element.tagName.toLowerCase();
          if (
            !(size && heroSizes.has(size)) ||
            tag === "input" ||
            tag === "button"
          ) {
            return false;
          }
          return /\d/u.test(text);
        }
      );

      if (heroes.length === 0) {
        return null;
      }

      let best: {
        text: string;
        heroPx: number;
        bodyPx: number;
        ratio: number;
      } | null = null;

      for (const element of heroes) {
        const { size } = element.dataset;
        if (!size) {
          continue;
        }
        const token = getComputedStyle(element)
          .getPropertyValue(`--font-size-${size}`)
          .trim();
        if (!token) {
          continue;
        }
        const heroPx = token.endsWith("rem")
          ? Number.parseFloat(token) * rootPx
          : Number.parseFloat(token);
        if (!Number.isFinite(heroPx) || heroPx <= 0) {
          continue;
        }
        const ratio = heroPx / bodyPx;
        if (!best || ratio > best.ratio) {
          best = {
            bodyPx,
            heroPx,
            ratio,
            text: element.textContent?.trim().slice(0, 40) ?? "",
          };
        }
      }

      if (!best || best.ratio < minRatio) {
        return null;
      }

      return best;
    },
    { minRatio: MIN_HERO_RATIO }
  );
}

/** Minimum vertical gap between direct children of <main>. */
export async function measureMainSectionGap(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) {
      return 0;
    }

    const children = [...main.children].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.height > 0;
    });

    const gaps: number[] = [];
    for (let index = 0; index < children.length - 1; index += 1) {
      const current = children[index].getBoundingClientRect();
      const next = children[index + 1].getBoundingClientRect();
      gaps.push(next.top - current.bottom);
    }

    return gaps.length > 0 ? Math.min(...gaps) : 0;
  });
}

export async function findNonTokenTransitionElements(
  page: Page
): Promise<string[]> {
  return page.evaluate(
    ({ toleranceMs, tokens }) => {
      const isNearToken = (ms: number) =>
        ms === 0 ||
        tokens.some((token: number) => Math.abs(token - ms) <= toleranceMs);

      const offenders: string[] = [];
      for (const element of document.querySelectorAll("main *")) {
        if (element.getAttribute("role") === "progressbar") {
          continue;
        }
        const className = element.className?.toString() ?? "";
        if (className.includes("progressbar")) {
          continue;
        }

        const style = getComputedStyle(element);
        const durations = [
          ...style.transitionDuration.split(","),
          ...style.animationDuration.split(","),
        ];

        for (const part of durations) {
          const trimmed = part.trim();
          const ms = trimmed.endsWith("ms")
            ? Number.parseFloat(trimmed)
            : Number.parseFloat(trimmed) * 1000;
          if (ms > 0 && !isNearToken(ms)) {
            offenders.push(
              `${element.tagName.toLowerCase()} transition/animation ${trimmed} is not an Astryx duration token`
            );
            break;
          }
        }
      }

      return offenders;
    },
    { tokens: [...ASTRYX_DURATION_MS], toleranceMs: DURATION_TOLERANCE_MS }
  );
}

export async function findReducedMotionOffenders(
  page: Page
): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    for (const element of document.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      const durations = [
        ...style.transitionDuration.split(","),
        ...style.animationDuration.split(","),
      ];

      for (const part of durations) {
        const trimmed = part.trim();
        const ms = trimmed.endsWith("ms")
          ? Number.parseFloat(trimmed)
          : Number.parseFloat(trimmed) * 1000;
        if (ms > 0) {
          offenders.push(
            `${element.tagName.toLowerCase()} still animates at ${trimmed} under prefers-reduced-motion`
          );
          break;
        }
      }
    }

    return offenders;
  });
}

export interface BodyContrastSample {
  ratio: number;
  text: string;
}

export async function measureLowBodyContrastSamples(
  page: Page
): Promise<BodyContrastSample[]> {
  return page.evaluate((minContrast) => {
    const parseRgb = (color: string): [number, number, number] | null => {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/u);
      if (!match) {
        return null;
      }
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    };

    const luminance = ([r, g, b]: [number, number, number]) => {
      const channel = (value: number) => {
        const scaled = value / 255;
        return scaled <= 0.03928
          ? scaled / 12.92
          : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const ratio = (
      fg: [number, number, number],
      bg: [number, number, number]
    ) => {
      const lighter = Math.max(luminance(fg), luminance(bg));
      const darker = Math.min(luminance(fg), luminance(bg));
      return (lighter + 0.05) / (darker + 0.05);
    };

    const low: { text: string; ratio: number }[] = [];

    for (const element of document.querySelectorAll(
      "main .astryx-text, main p, main li, main td, main label, main .astryx-heading"
    )) {
      const style = getComputedStyle(element);
      if (style.display === "none" || !element.textContent?.trim()) {
        continue;
      }

      const foreground = parseRgb(style.color);
      if (!foreground) {
        continue;
      }

      let background: [number, number, number] | null = parseRgb(
        style.backgroundColor
      );
      if (!background || background[0] + background[1] + background[2] === 0) {
        let parent = element.parentElement;
        while (parent) {
          const parentStyle = getComputedStyle(parent);
          background = parseRgb(parentStyle.backgroundColor);
          if (background && background[0] + background[1] + background[2] > 0) {
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (!background) {
        continue;
      }

      const contrast = ratio(foreground, background);
      if (contrast < minContrast) {
        low.push({
          ratio: Number(contrast.toFixed(2)),
          text: element.textContent.trim().slice(0, 40),
        });
      }
    }

    return low;
  }, MIN_BODY_CONTRAST);
}

export const DESIGN_GATE_THRESHOLDS = {
  minBodyContrast: MIN_BODY_CONTRAST,
  minHeroRatio: MIN_HERO_RATIO,
  minSectionGapPx: MIN_SECTION_GAP_PX,
} as const;

export { isTokenDuration, parseDurationMs, parseRem };
