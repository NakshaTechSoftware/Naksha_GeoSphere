/**
 * Client-side session helpers.
 *
 * The app establishes "signed in" state as a JSON blob under the `user` key
 * (see SignInContent). These helpers centralize that so sign-in flows (email
 * verification included) write the same shape.
 *
 * Where the blob lives depends on the environment:
 * - Native mobile app (Capacitor WebView): the session is durably persisted in
 *   native SharedPreferences (via the NativePermissions plugin) - WebView
 *   localStorage can be wiped when the app is closed/killed, which is why the
 *   native store is the source of truth. A synchronous in-memory cache (hydrated
 *   by bootstrapSession() at app start) keeps the rest of the code synchronous.
 * - Regular web browser: sessionStorage (unchanged), so the existing
 *   per-tab/per-session behavior is preserved.
 */

import { isNativeApp } from "./native";
import type { StoredUserLocation } from "./userSession";

export interface SessionUser {
  email: string;
  name: string;
  /** Best-effort browser geolocation captured at sign-in, used to personalize
   *  AQI/weather/environment data (see components/environment). Optional -
   *  older sessions and sign-ins where the user declined the permission
   *  prompt simply omit it. */
  preferredLocation?: StoredUserLocation | null;
}

const SESSION_USER_KEY = "user";

// In-memory mirror of the session, so getSessionUser() stays synchronous.
// Hydrated from the durable native store by bootstrapSession() at app start.
let memorySession: SessionUser | null = null;
let bootstrapped = false;

/** The native NativePermissions plugin bridge (undefined on the web). */
function nativeBridge(): {
  getSession?: () => Promise<{ json?: string }>;
  setSession?: (opts: { json: string }) => Promise<void>;
  clearSession?: () => Promise<void>;
} | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    Capacitor?: { Plugins?: { NativePermissions?: Record<string, unknown> } };
  };
  return w.Capacitor?.Plugins?.NativePermissions as ReturnType<typeof nativeBridge>;
}

/** Loads the persisted session into memory (native: from SharedPreferences). */
export async function bootstrapSession(): Promise<void> {
  if (bootstrapped || typeof window === "undefined") return;
  bootstrapped = true;
  if (!isNativeApp()) return;
  const plugin = nativeBridge();
  if (!plugin?.getSession) return;
  try {
    const result = await plugin.getSession();
    if (result?.json) {
      const parsed = JSON.parse(result.json) as SessionUser;
      if (parsed && typeof parsed.email === "string") {
        memorySession = parsed;
        // Mirror into localStorage so the rest of the app (and any component
        // reading the storage directly) sees the same session.
        try {
          window.localStorage.setItem(SESSION_USER_KEY, result.json);
        } catch {
          /* storage unavailable - in-memory copy is enough */
        }
      }
    }
  } catch {
    /* no persisted session - normal on first run / after sign-out */
  }
}

/** Stores the signed-in user (natively persisted in the app, per-session on web). */
export function signInUser(user: SessionUser): void {
  if (typeof window === "undefined") {
    return;
  }
  memorySession = user;
  try {
    (isNativeApp() ? window.localStorage : window.sessionStorage).setItem(
      SESSION_USER_KEY,
      JSON.stringify(user),
    );
  } catch {
    /* storage unavailable - in-memory copy is enough */
  }
  // Durable copy for the native app (survives WebView storage being cleared).
  void nativeBridge()
    ?.setSession?.({ json: JSON.stringify(user) })
    .catch((error) => console.error("[session] native persist failed:", error));
}

/** Returns the signed-in user, or null when not signed in. */
export function getSessionUser(): SessionUser | null {
  if (memorySession) {
    return memorySession;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = (isNativeApp() ? window.localStorage : window.sessionStorage).getItem(
      SESSION_USER_KEY,
    );
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

/** Clears the signed-in user. */
export function signOutUser(): void {
  if (typeof window === "undefined") {
    return;
  }
  memorySession = null;
  try {
    (isNativeApp() ? window.localStorage : window.sessionStorage).removeItem(SESSION_USER_KEY);
  } catch {
    /* ignore */
  }
  void nativeBridge()
    ?.clearSession?.()
    .catch(() => {
      /* ignore */
    });
}
