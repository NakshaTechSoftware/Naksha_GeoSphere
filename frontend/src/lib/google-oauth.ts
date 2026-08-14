/**
 * Google OAuth (authorization-code flow with PKCE) client-side helpers.
 *
 * The backend callback at `<apiUrl>/api/v1/auth/google/callback` completes
 * the flow and redirects the browser back to /signup with a single-use
 * ticket. The PKCE verifier rides along inside `state` (Google echoes it
 * back) so the backend can exchange the code.
 */

import { config } from "@/lib/config";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

/** True when NEXT_PUBLIC_GOOGLE_CLIENT_ID is configured. */
export function isGoogleSignInConfigured(): boolean {
  return Boolean(config.googleClientId);
}

/** The exact redirect URI the backend expects (and Google must allow). */
export function googleRedirectUri(): string {
  return config.googleRedirectUri || `${config.apiUrl}/api/v1/auth/google/callback`;
}

function randomBase64Url(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return btoa(String.fromCharCode(...values))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Builds the Google consent URL for this client, with PKCE. `returnTo` is
 * the app page the browser should land on after the OAuth round-trip
 * (`/signin` or `/signup`); it rides inside `state` so the backend knows
 * where to redirect the browser after the callback.
 */
export async function buildGoogleAuthUrl(returnTo: "/signin" | "/signup" = "/signup"): Promise<string> {
  const verifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(verifier);
  // `<csrf>.<verifier>.<route>` — Google echoes `state` back to the
  // callback, which is how the backend receives the verifier for the token
  // exchange and the page to redirect the browser back to.
  const route = returnTo === "/signin" ? "signin" : "signup";
  const state = `${randomBase64Url(18)}.${verifier}.${route}`;

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}
