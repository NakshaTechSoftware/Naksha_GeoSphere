/**
 * Native-app detection for the Capacitor mobile build.
 *
 * Capacitor injects a `window.Capacitor` bridge into the app's WebView; it is
 * absent in a regular desktop/mobile browser. Checking the bridge directly (via
 * the global, not an import) keeps this usable from anywhere in the app without
 * pulling @capacitor/core into the web bundle.
 *
 * Use this to gate mobile-app-only behavior (e.g. persistent sessions) so the
 * web experience stays exactly as it was.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return w.Capacitor?.isNativePlatform?.() === true;
}
