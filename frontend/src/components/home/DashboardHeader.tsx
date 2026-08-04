"use client";

import { useState } from "react";
import { Menu, X, Globe, Search, ShoppingCart, Bell, ChevronDown } from "lucide-react";

interface NavigationItem {
  id: string;
  label: string;
  href: string;
}

const navigationItems: NavigationItem[] = [
  { id: "explore", label: "Explore Data", href: "/welcome-page#data-formats" },
  { id: "solutions", label: "Solutions", href: "/welcome-page#features" },
  { id: "pricing", label: "Pricing", href: "/welcome-page#pricing" },
  { id: "about", label: "About", href: "/welcome-page#trust" },
  { id: "contact", label: "Contact", href: "/welcome-page#contact" },
];

interface DashboardHeaderProps {
  userName?: string;
  cartCount?: number;
  notificationCount?: number;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function DashboardHeader({
  userName = "Arjun Singh",
  cartCount = 2,
  notificationCount = 4,
}: DashboardHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  return (
    <header className="border-[var(--color-text-on-dark)]/10 sticky top-0 z-50 w-full border-b bg-obsidian-graphite">
      <div className="mx-auto flex h-[70px] max-w-content items-center justify-between px-6 lg:px-16">
        {/* Logo and Brand */}
        <a href="/home-page" className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-atlas-cobalt"
            aria-hidden="true"
          >
            <Globe className="h-6 w-6 text-white" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold leading-tight tracking-tight text-white">
              Naksha GeoSphere
            </span>
            <span className="hidden text-xs leading-tight text-white/60 sm:block">
              The Geospatial Data Marketplace
            </span>
          </div>
        </a>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary navigation">
          {navigationItems.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className="text-sm font-medium text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian-graphite"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            aria-label="Search"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Search className="h-5 w-5" />
          </button>

          <a
            href="/cart"
            aria-label={`Cart, ${cartCount} items`}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-atlas-cobalt px-1 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </a>

          <a
            href="/notifications"
            aria-label={`Notifications, ${notificationCount} unread`}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e2483d] px-1 text-[10px] font-bold text-white">
                {notificationCount}
              </span>
            )}
          </a>

          {/* Account menu */}
          <div className="relative ml-2">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-white/10"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-atlas-cobalt text-xs font-bold text-white">
                {initialsFor(userName)}
              </span>
              <span className="text-sm font-medium text-white">{userName}</span>
              <ChevronDown
                className={`h-4 w-4 text-white/60 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {accountMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-[var(--color-border-medium)] bg-white p-1.5 shadow-card"
              >
                <a
                  href="/account"
                  role="menuitem"
                  className="block rounded-md px-3 py-2 text-sm text-obsidian-graphite hover:bg-[var(--color-cobalt-soft)]"
                >
                  Account Dashboard
                </a>
                <a
                  href="/orders"
                  role="menuitem"
                  className="block rounded-md px-3 py-2 text-sm text-obsidian-graphite hover:bg-[var(--color-cobalt-soft)]"
                >
                  Order History
                </a>
                <a
                  href="/logout"
                  role="menuitem"
                  className="block rounded-md px-3 py-2 text-sm text-obsidian-graphite hover:bg-[var(--color-cobalt-soft)]"
                >
                  Sign Out
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          className="flex items-center justify-center rounded-lg p-2 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt md:hidden"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label="Toggle mobile menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div id="mobile-menu" className="border-t border-white/10 bg-obsidian-graphite md:hidden">
          <nav className="flex flex-col px-6 py-4" aria-label="Mobile navigation">
            {navigationItems.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-atlas-cobalt text-xs font-bold text-white">
                {initialsFor(userName)}
              </span>
              <span className="text-sm font-medium text-white">{userName}</span>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
