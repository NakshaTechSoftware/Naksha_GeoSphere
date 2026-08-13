/**
 * Client-side session helpers.
 *
 * The app currently establishes "signed in" state as a JSON blob in
 * sessionStorage under the `user` key (see SignInContent). These helpers
 * centralize that so sign-in flows (email verification included) write the
 * same shape.
 */

export interface SessionUser {
  email: string;
  name: string;
}

const SESSION_USER_KEY = "user";

/** Stores the signed-in user for the current browser session. */
export function signInUser(user: SessionUser): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

/** Returns the signed-in user, or null when not signed in. */
export function getSessionUser(): SessionUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(SESSION_USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

/** Clears the signed-in user from the current browser session. */
export function signOutUser(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(SESSION_USER_KEY);
}
