import {
  clearStoredUserSession,
  formatStoredLocationLabel,
  getStoredUserLocation,
  getStoredUserSession,
  saveStoredUserSession,
} from "@/lib/userSession";
import { afterEach, describe, expect, it } from "vitest";

describe("userSession storage", () => {
  afterEach(() => {
    clearStoredUserSession();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("stores session-only users in sessionStorage", () => {
    saveStoredUserSession(
      {
        email: "demo@gmail.com",
        name: "Arjun Singh",
        preferredLocation: null,
      },
      false
    );

    expect(window.sessionStorage.getItem("user")).toContain("demo@gmail.com");
    expect(window.localStorage.getItem("user")).toBeNull();
    expect(getStoredUserSession()?.name).toBe("Arjun Singh");
  });

  it("stores remembered users in localStorage", () => {
    saveStoredUserSession(
      {
        email: "demo@gmail.com",
        name: "Arjun Singh",
        preferredLocation: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracyMeters: 18,
          capturedAt: "2026-08-12T10:00:00Z",
          source: "browser_geolocation",
        },
      },
      true
    );

    expect(window.localStorage.getItem("user")).toContain("12.9716");
    expect(getStoredUserLocation()?.longitude).toBe(77.5946);
  });

  it("formats saved coordinates for UI labels", () => {
    expect(
      formatStoredLocationLabel({
        latitude: 12.9715987,
        longitude: 77.594566,
        accuracyMeters: 10,
        capturedAt: "2026-08-12T10:00:00Z",
        source: "browser_geolocation",
      })
    ).toBe("12.9716, 77.5946");
  });
});
