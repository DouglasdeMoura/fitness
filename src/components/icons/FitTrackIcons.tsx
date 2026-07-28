/**
 * FitTrack-specific SVG icon components (issue #35 — Batch 6).
 *
 * Replaces emoji fallbacks with proper SVG icons. Each component is a
 * standalone function returning an SVG element, usable as the `icon` prop
 * for Astryx EmptyState, Button, or the custom `icon` render prop on Tab
 * and IconButton (wrapped in a span for consistent sizing).
 *
 * All icons use `currentColor` for fill/stroke so they inherit the parent
 * text color and adapt to the active theme automatically — no hardcoded
 * hex values.
 */

import type { ComponentType, SVGProps } from "react";

/* ------------------------------------------------------------------ */
/* Shared SVG wrapper — 24×24 viewBox, currentColor fill              */
/* ------------------------------------------------------------------ */

function createIcon(
  d: string,
  stroke = false
): ComponentType<SVGProps<SVGSVGElement>> {
  const Icon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
    <svg
      aria-hidden="true"
      fill={stroke ? "none" : "currentColor"}
      height="1em"
      stroke={stroke ? "currentColor" : undefined}
      strokeLinecap={stroke ? "round" : undefined}
      strokeLinejoin={stroke ? "round" : undefined}
      strokeWidth={stroke ? 2 : undefined}
      viewBox="0 0 24 24"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d={d} />
    </svg>
  );
  Icon.displayName = "FitTrackIcon";
  return Icon;
}

/* ------------------------------------------------------------------ */
/* Named icons                                                         */
/* ------------------------------------------------------------------ */

/** Apple / nutrition icon — used for food logging and nutrition nav. */
export const NutritionIcon = createIcon(
  "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm4.3 14.3a.996.996 0 0 1-1.41 0L12 13.41l-2.89 2.89a.996.996 0 1 1-1.41-1.41L10.59 12 7.7 9.11A.996.996 0 1 1 9.11 7.7L12 10.59l2.89-2.89a.996.996 0 1 1 1.41 1.41L13.41 12l2.89 2.89c.39.38.39 1.02 0 1.41z"
);

/** Barbell / workout icon — used for training pages and workout nav. */
export const WorkoutIcon = createIcon(
  "M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14 2 5.86l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29l-1.43-1.43z"
);

/** Chart up / progress icon — used for progress pages and nav. */
export const ProgressIcon = createIcon(
  "M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2 2H5V5h14v14zm0-16H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
);

/** Dashboard / home icon — used for dashboard nav. */
export const DashboardIcon = createIcon("M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z");

/** Settings / gear icon — used for settings nav. */
export const SettingsIcon = createIcon(
  "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
);

/** Scale / weight icon — used for body weight entries. */
export const ScaleIcon = createIcon(
  "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zm-1-6h2v-4h-2v4zm0 4h2v-2h-2v2z"
);

/** Bar chart / volume icon — used for volume analysis empty state. */
export const BarChartIcon = createIcon(
  "M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"
);

/** Meal / plate icon — used for nutrition empty states. */
export const MealIcon = createIcon(
  "M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 0 0 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"
);

/** Template / document icon — used for meal templates empty state. */
export const TemplateIcon = createIcon(
  "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h8v2H8v-2zm0-8h3v2H8V9z"
);

/** Sun/moon toggle icon — used for dark mode button. */
export const ThemeToggleIcon = createIcon(
  "M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"
);

/** Clip board / weekly review icon — used for review quick action. */
export const ReviewIcon = createIcon(
  "M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"
);
