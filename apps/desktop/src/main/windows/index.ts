/**
 * Window Management — barrel export.
 *
 * Re-exports splash and main window utilities so consumers
 * can import from `./windows` directly.
 *
 * @module windows
 */

export {
  createSplashWindow,
  closeSplashWindow,
  isSplashAlive,
} from "./splash";

export {
  createMainWindow,
  showMainWindow,
  getMainWindow,
  setPendingDeepLink,
  consumePendingDeepLink,
} from "./main";
