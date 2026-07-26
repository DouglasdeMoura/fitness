/**
 * Pure helpers for the in-app PWA install affordance (issue #48 / PRD 12 Batch 1).
 *
 * beforeinstallprompt only fires on Chromium-family browsers that consider the
 * app installable. iOS Safari never fires it — callers must fall back to
 * Share-sheet instructions when `getInstallMode` returns `ios-instructions`.
 */

export type InstallMode =
  | 'installed'
  | 'prompt'
  | 'ios-instructions'
  | 'unavailable'

export type InstallEnvironment = {
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** true when display-mode is standalone, or iOS navigator.standalone */
  isStandalone: boolean
  hasDeferredPrompt: boolean
}

/**
 * Detect iPhone / iPad / iPod, including iPadOS desktop-UA with touch.
 *
 * @example
 * isIosDevice({ userAgent: '…iPhone…', platform: 'iPhone', maxTouchPoints: 5 })
 */
export function isIosDevice(env: {
  userAgent: string
  platform: string
  maxTouchPoints: number
}): boolean {
  const ua = env.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ reports as MacIntel but remains a touch tablet.
  return env.platform === 'MacIntel' && env.maxTouchPoints > 1
}

/**
 * Decide which install UI Settings should render.
 *
 * @example
 * getInstallMode({ …, isStandalone: false, hasDeferredPrompt: true }) // 'prompt'
 */
export function getInstallMode(env: InstallEnvironment): InstallMode {
  if (env.isStandalone) return 'installed'
  if (env.hasDeferredPrompt) return 'prompt'
  if (isIosDevice(env)) return 'ios-instructions'
  return 'unavailable'
}

/**
 * Read standalone / installed state from a window-like object.
 */
export function readIsStandalone(win: {
  matchMedia: (query: string) => { matches: boolean }
  navigator: { standalone?: boolean }
}): boolean {
  if (win.matchMedia('(display-mode: standalone)').matches) return true
  return win.navigator.standalone === true
}

export const IOS_INSTALL_STEPS = [
  'Tap the Share button in Safari',
  'Scroll and tap “Add to Home Screen”',
  'Tap Add to confirm',
] as const

export const INSTALL_CARD_TITLE = 'Install App'
export const INSTALL_BUTTON_LABEL = 'Add to home screen'
export const INSTALLED_MESSAGE = 'FitTrack is installed on this device.'
export const UNAVAILABLE_MESSAGE =
  'Install is offered by your browser when FitTrack meets its install criteria. Check the browser menu for “Install app” or “Add to Home Screen”.'
export const IOS_INSTALL_DESCRIPTION =
  'On iPhone and iPad, add FitTrack from the Safari Share sheet:'
