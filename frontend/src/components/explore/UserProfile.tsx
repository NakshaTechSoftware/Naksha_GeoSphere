"use client";

import { useEffect, useState } from "react";
import { User, LogOut, Settings, HelpCircle } from "lucide-react";
import { bootstrapSession, getSessionUser, signOutUser, type SessionUser } from "@/lib/session";

interface UserProfileProps {
  /** Explicit overrides — when omitted, the signed-in session user is used. */
  userName?: string;
  userEmail?: string;
  userLocationLabel?: string | null;
  /** Fired with the new open state whenever the avatar button toggles the dropdown. */
  onMenuToggle?: (open: boolean) => void;
  /** Overrides the dropdown's vertical offset class (default `"top-12"`). Use this when
      the avatar sits inside another element (e.g. the mobile search pill) so the menu
      clears it with a small gap instead of overlapping it. */
  menuPositionClassName?: string;
}

/**
 * User profile component with avatar and dropdown menu
 * Positioned in the top navigation bar
 */
export function UserProfile({
  userName,
  userEmail,
  onMenuToggle,
  menuPositionClassName,
}: UserProfileProps) {
  const [isOpen, setIsOpen] = useState(false);
  // The session lives in client storage (sessionStorage on web, localStorage in the
  // native app - see lib/session.ts), which only exists on the client - reading it
  // synchronously during render would make the server HTML ("Guest User") differ from
  // the client's first paint (the signed-in user), tripping React's hydration check and
  // throwing the whole page into the client-render fallback. So the session user is
  // loaded after mount instead: both server and client render the guest fallback first,
  // then this effect swaps in the real signed-in user.
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Load the durable session (native app: persisted in SharedPreferences)
    // before reading it, so the profile shows the signed-in account even after
    // a fresh app open. On the web bootstrap is a no-op.
    (async () => {
      await bootstrapSession();
      if (!cancelled) setSessionUser(getSessionUser());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Explicit props win; otherwise show the signed-in user; fall back to a
  // generic guest label when no session exists.
  const displayName = userName ?? sessionUser?.name ?? "Guest User";
  const displayEmail = userEmail ?? sessionUser?.email ?? "guest@naksha.com";

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const initials = getInitials(displayName);

  return (
    <div className="relative flex-shrink-0">
      {/* Profile Avatar Button */}
      <button
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          onMenuToggle?.(next);
        }}
        className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="User profile menu"
      >
        <span className="text-sm font-semibold text-white">{initials}</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop to close menu when clicking outside */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu Content. On mobile (common phone resolutions) the menu becomes a
              fixed overlay with the same bounds as the search bar (left-4/right-4 +
              an 8px gap below it), so it always lines up with the pill exactly. */}
          <div
            className={`absolute right-0 z-20 w-64 rounded-xl bg-white shadow-xl border border-gray-200 overflow-hidden max-md:fixed max-md:left-4 max-md:right-4 max-md:top-[84px] max-md:w-auto ${
              menuPositionClassName ?? "top-12"
            }`}
          >
            {/* User Info Section */}
            <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-sm">
                  <span className="text-base font-bold text-white">
                    {initials}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-gray-600 truncate">{userEmail}</p>
                  {userLocationLabel && (
                    <p className="mt-1 text-[11px] text-gray-500 truncate">
                      Location: {userLocationLabel}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  // Handle profile action
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
              >
                <User className="w-4 h-4 text-gray-500" />
                <span>My Profile</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  // Handle settings action
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
              >
                <Settings className="w-4 h-4 text-gray-500" />
                <span>Settings</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  // Handle help action
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
              >
                <HelpCircle className="w-4 h-4 text-gray-500" />
                <span>Help & Support</span>
              </button>

              <div className="border-t border-gray-200 my-2" />

              <button
                onClick={() => {
                  setIsOpen(false);
                  signOutUser();
                  // Full-page navigation clears any in-memory state and
                  // sends the user back to the public welcome page.
                  window.location.href = "/welcome-page";
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
