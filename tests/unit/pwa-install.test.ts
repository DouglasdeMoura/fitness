import { describe, it, expect } from "vitest";

import {
  getInstallMode,
  isIosDevice,
  readIsStandalone,
  IOS_INSTALL_STEPS,
  INSTALL_BUTTON_LABEL,
  INSTALL_CARD_TITLE,
} from "~/lib/pwa-install";

const chromeDesktop = {
  maxTouchPoints: 0,
  platform: "Linux x86_64",
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const iphoneSafari = {
  maxTouchPoints: 5,
  platform: "iPhone",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

describe(isIosDevice, () => {
  it("detects iPhone Safari", () => {
    expect(isIosDevice(iphoneSafari)).toBeTruthy();
  });

  it("detects iPadOS desktop UA with touch", () => {
    expect(
      isIosDevice({
        maxTouchPoints: 5,
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      })
    ).toBeTruthy();
  });

  it("rejects desktop Chrome", () => {
    expect(isIosDevice(chromeDesktop)).toBeFalsy();
  });
});

describe(getInstallMode, () => {
  it("returns installed when running as a standalone PWA", () => {
    expect(
      getInstallMode({
        ...chromeDesktop,
        hasDeferredPrompt: true,
        isStandalone: true,
      })
    ).toBe("installed");
  });

  it("returns prompt when beforeinstallprompt was captured", () => {
    expect(
      getInstallMode({
        ...chromeDesktop,
        hasDeferredPrompt: true,
        isStandalone: false,
      })
    ).toBe("prompt");
  });

  it("returns ios-instructions on iOS without a deferred prompt", () => {
    expect(
      getInstallMode({
        ...iphoneSafari,
        hasDeferredPrompt: false,
        isStandalone: false,
      })
    ).toBe("ios-instructions");
  });

  it("returns unavailable on desktop Chromium before the install event", () => {
    expect(
      getInstallMode({
        ...chromeDesktop,
        hasDeferredPrompt: false,
        isStandalone: false,
      })
    ).toBe("unavailable");
  });
});

describe(readIsStandalone, () => {
  it("reads display-mode standalone from matchMedia", () => {
    expect(
      readIsStandalone({
        matchMedia: (q) => ({ matches: q.includes("standalone") }),
        navigator: {},
      })
    ).toBeTruthy();
  });

  it("falls back to iOS navigator.standalone", () => {
    expect(
      readIsStandalone({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: true },
      })
    ).toBeTruthy();
  });
});

describe("install copy constants", () => {
  it("exposes stable labels used by Settings and e2e selectors", () => {
    expect(INSTALL_CARD_TITLE).toBe("Install App");
    expect(INSTALL_BUTTON_LABEL).toBe("Add to home screen");
    expect(IOS_INSTALL_STEPS).toHaveLength(3);
    expect(IOS_INSTALL_STEPS[0]).toMatch(/Share/);
  });
});
