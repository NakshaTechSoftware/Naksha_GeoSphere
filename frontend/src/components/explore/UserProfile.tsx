"use client";

import { useState } from "react";
import { User, LogOut, Settings, HelpCircle } from "lucide-react";

interface UserProfileProps {
  userName?: string;
  userEmail?: string;
}

/**
 * User profile component with avatar and dropdown menu
 * Positioned in the top navigation bar
 */
export function UserProfile({
  userName = "Guest User",
  userEmail = "guest@naksha.com",
}: UserProfileProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const initials = getInitials(userName);

  return (
    <div className="relative flex-shrink-0">
      {/* Profile Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
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

          {/* Menu Content */}
          <div className="absolute right-0 top-12 z-20 w-64 rounded-xl bg-white shadow-xl border border-gray-200 overflow-hidden">
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
                    {userName}
                  </p>
                  <p className="text-xs text-gray-600 truncate">{userEmail}</p>
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
                  // Full-page navigation clears any in-memory session state and
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
