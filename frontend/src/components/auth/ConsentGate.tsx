"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native";

// localStorage key recording that the user accepted the first-run consent.
// The native app persists localStorage across app restarts, so this shows the
// dialog exactly once per install instead of on every open.
const CONSENT_KEY = "nmaps_consent_accepted";

// Fires the native GPS + voice permission request after the user taps
// "Accept", then opens the folder picker for phone storage (exports are saved
// into an "N-MAP_exports" folder there). The plugin's request() only resolves
// after Android has finished showing the permission dialogs, so the folder
// picker never opens over them. Accessed through the global Capacitor bridge
// (the same pattern as isNativeApp) so nothing here imports @capacitor/core
// into the web bundle.
function requestNativePermissions(): void {
  const w = window as unknown as {
    Capacitor?: {
      Plugins?: {
        NativePermissions?: {
          request?: (opts: { permissions: string[] }) => Promise<unknown>;
          pickExportFolder?: () => Promise<unknown>;
        };
      };
    };
  };
  const plugin = w.Capacitor?.Plugins?.NativePermissions;
  void (async () => {
    try {
      // GPS + voice runtime permission dialogs (location first, then voice).
      await plugin?.request?.({ permissions: ["location", "voice"] });
    } catch (error) {
      console.error("[ConsentGate] native permission request failed:", error);
    }
    // Phone storage: let the user pick where exports should live. The choice is
    // remembered, so the picker only appears once (or again if revoked). If the
    // user dismisses it, it re-opens at the first export instead.
    try {
      await plugin?.pickExportFolder?.();
    } catch {
      /* dismissed - re-asked at first export */
    }
  })();
}

/** Persists the consent flag in native storage too (survives WebView storage clears). */
function persistNativeConsent(accepted: boolean): void {
  const w = window as unknown as {
    Capacitor?: {
      Plugins?: {
        NativePermissions?: { setConsent?: (opts: { accepted: boolean }) => Promise<unknown> };
      };
    };
  };
  void w.Capacitor?.Plugins?.NativePermissions?.setConsent?.({ accepted }).catch(() => {
    /* non-fatal */
  });
}

/** Reads the persisted consent flag: native store first, then localStorage. */
async function readConsent(): Promise<boolean> {
  const w = window as unknown as {
    Capacitor?: {
      Plugins?: {
        NativePermissions?: { getConsent?: () => Promise<{ accepted?: boolean }> };
      };
    };
  };
  const get = w.Capacitor?.Plugins?.NativePermissions?.getConsent;
  if (get) {
    try {
      const result = await get();
      if (typeof result?.accepted === "boolean") return result.accepted;
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First-open consent gate for the mobile app. Shown only in the Capacitor
 * native app, only until the user taps "Accept", and remembered afterwards so
 * it never re-appears. The web experience is completely unaffected.
 */
export function ConsentGate() {
  // null = undecided (not yet checked), true = consented, false = show dialog
  const [consented, setConsented] = useState<boolean | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isNativeApp()) {
        setConsented(true); // web: never show the dialog
        return;
      }
      const accepted = await readConsent();
      if (!cancelled) setConsented(accepted);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (consented !== false) return null;

  // User tapped "Accept": remember the choice, then fire the native GPS +
  // voice permission requests and the storage folder picker (Android shows
  // its own system dialogs).
  const handleAccept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, "1");
    } catch {
      /* storage unavailable - still proceed for this session */
    }
    persistNativeConsent(true);
    requestNativePermissions();
    setConsented(true);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-200">
            N-MAPS
          </p>
          <h2 className="text-lg font-semibold text-white">Accept needed cookies</h2>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          {!showTerms ? (
            <p className="text-sm leading-relaxed text-slate-600">
              N-MAPS needs your permission to provide location-based mapping and
              voice search. By accepting, you allow N-MAPS to access your
              device&apos;s <span className="font-semibold text-slate-900">GPS location</span>,{" "}
              <span className="font-semibold text-slate-900">voice (microphone)</span>, and{" "}
              <span className="font-semibold text-slate-900">phone storage</span> (to save your
              exports). Read the terms below for details.
            </p>
          ) : (
            <div className="space-y-3 text-sm leading-relaxed text-slate-600">
              <h3 className="text-base font-semibold text-slate-900">Terms &amp; Permissions</h3>
              <p>
                When you accept the cookies below, you are giving N-MAPS permission to
                access two capabilities of your device:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <span className="font-semibold text-slate-900">GPS location</span> — used to
                  locate your position on the map, center the map on your area, and support
                  location-based mapping features.
                </li>
                <li>
                  <span className="font-semibold text-slate-900">Voice (microphone)</span> — used
                  for voice search, so you can say a place name instead of typing it.
                </li>
                <li>
                  <span className="font-semibold text-slate-900">Phone storage</span> — lets N-MAPS
                  save your exported maps and data to your device. Exports are written into a
                  <span className="font-medium text-slate-900"> "N-MAP_exports"</span> folder inside
                  the storage location you choose.
                </li>
              </ul>
              <p>
                Your location, voice, and exports are used only inside N-MAPS to power these
                features. You can change or revoke any permission at any time in your device&apos;s
                Settings, or by reinstalling the app.
              </p>
              <p className="text-xs text-slate-400">
                By tapping &ldquo;Accept&rdquo; you agree to the above and grant N-MAPS access to
                your device&apos;s GPS location, voice, and phone storage.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 border-t border-gray-100 p-4">
          <button
            type="button"
            onClick={handleAccept}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => setShowTerms((v) => !v)}
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-gray-50"
          >
            {showTerms ? "Back" : "Read Terms"}
          </button>
        </div>
      </div>
    </div>
  );
}
