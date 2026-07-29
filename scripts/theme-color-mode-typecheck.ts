/**
 * Type-level gate for issue #97: ColorMode must stay `"light" | "dark"`.
 * Widening ColorMode to include `"system"` must fail `npm run typecheck`.
 */
import type { ColorMode, ThemePreference } from "../src/lib/app-chrome.ts";

type AssertTrue<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type _ColorModeIsBinary = AssertTrue<Equal<ColorMode, "light" | "dark">>;
type _ThemePreferenceIsTriState = AssertTrue<
  Equal<ThemePreference, "light" | "dark" | "system">
>;

// system is a preference, not a resolved document mode.
// @ts-expect-error — ColorMode must not include "system"
const _systemIsNotColorMode: ColorMode = "system";

export type ThemeColorModeTypeGate = _ColorModeIsBinary &
  _ThemePreferenceIsTriState;
