"use client";

export interface StoredUserLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
  source: "browser_geolocation";
}

export interface StoredUserSession {
  email: string;
  name: string;
  preferredLocation: StoredUserLocation | null;
}

const USER_SESSION_KEY = "user";

function canUseBrowserStorage(): boolean {
  return typeof window !== "undefined";
}

function parseStoredSession(raw: string | null): StoredUserSession | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredUserSession>;
    if (typeof parsed.email !== "string" || typeof parsed.name !== "string") {
      return null;
    }

    const location = parsed.preferredLocation;
    const validLocation =
      location &&
      typeof location.latitude === "number" &&
      typeof location.longitude === "number" &&
      typeof location.capturedAt === "string"
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracyMeters:
              typeof location.accuracyMeters === "number" ? location.accuracyMeters : null,
            capturedAt: location.capturedAt,
            source: "browser_geolocation" as const,
          }
        : null;

    return {
      email: parsed.email,
      name: parsed.name,
      preferredLocation: validLocation,
    };
  } catch {
    return null;
  }
}

function removeStoredUserSessionFrom(storage: Storage) {
  storage.removeItem(USER_SESSION_KEY);
}

export function getStoredUserSession(): StoredUserSession | null {
  if (!canUseBrowserStorage()) return null;

  return (
    parseStoredSession(window.localStorage.getItem(USER_SESSION_KEY)) ??
    parseStoredSession(window.sessionStorage.getItem(USER_SESSION_KEY))
  );
}

export function getStoredUserLocation(): StoredUserLocation | null {
  return getStoredUserSession()?.preferredLocation ?? null;
}

export function saveStoredUserSession(session: StoredUserSession, persistAcrossVisits: boolean) {
  if (!canUseBrowserStorage()) return;

  removeStoredUserSessionFrom(window.localStorage);
  removeStoredUserSessionFrom(window.sessionStorage);

  const target = persistAcrossVisits ? window.localStorage : window.sessionStorage;
  target.setItem(USER_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredUserSession() {
  if (!canUseBrowserStorage()) return;

  removeStoredUserSessionFrom(window.localStorage);
  removeStoredUserSessionFrom(window.sessionStorage);
}

export function formatStoredLocationLabel(location: StoredUserLocation | null): string | null {
  if (!location) return null;
  return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
}
