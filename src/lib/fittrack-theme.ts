import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

/**
 * Neutral theme tuned for autonomous a11y gates (issue #49):
 * - Secondary text meets 4.5:1 on #f1f1f1 surfaces (WCAG 2.2 SC 1.4.3).
 * - Error badges meet 4.5:1 with white label text at 12px (axe color-contrast).
 */
export const fittrackTheme = defineTheme({
  components: {
    badge: {
      "variant:error": {
        backgroundColor: "light-dark(#c92a37, #ff705d)",
        color: "light-dark(#ffffff, #171717)",
      },
    },
  },
  extends: neutralTheme,
  name: "fittrack-neutral",
  tokens: {
    "--color-icon-secondary": ["#525252", "#a3a3a3"],
    "--color-text-secondary": ["#525252", "#a3a3a3"],
  },
});
