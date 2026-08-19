/**
 * GitHub OAuth (OAuth App authorization-code flow) client-side helpers.
 *
 * The backend callback at `<apiUrl>/api/v1/auth/github/callback` completes
 * the flow and redirects the browser back with a single-use ticket. GitHub
 * OAuth Apps don't support PKCE — the backend exchanges the code with the
 * client secret — so `state` only carries the return route.
 */

import { config } from "@/lib/config";

const GITHUB_AUTH_ENDPOINT = "https://github.com/login/oauth/authorize";
const GITHUB_SCOPES = "user:email";

/** True when NEXT_PUBLIC_GITHUB_CLIENT_ID is configured. */
export function isGitHubSignInConfigured(): boolean {
  return Boolean(config.githubClientId);
}

/** The exact redirect URI the backend expects (and GitHub must allow). */
export function githubRedirectUri(): string {
  return config.githubRedirectUri || `${config.apiUrl}/api/v1/auth/github/callback`;
}

function randomBase64Url(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return btoa(String.fromCharCode(...values))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Builds the GitHub consent URL for this client. `returnTo` is the app page
 * the browser should land on after the OAuth round-trip (`/signin` or
 * `/signup`); it rides inside `state` so the backend knows where to
 * redirect the browser after the callback.
 */
export function buildGitHubAuthUrl(returnTo: "/signin" | "/signup" = "/signup"): string {
  const route = returnTo === "/signin" ? "signin" : "signup";
  // `<csrf>.<route>` — GitHub echoes `state` back to the callback.
  const state = `${randomBase64Url(18)}.${route}`;

  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: githubRedirectUri(),
    scope: GITHUB_SCOPES,
    state,
  });
  return `${GITHUB_AUTH_ENDPOINT}?${params.toString()}`;
}
