"use client";

import { useState } from "react";
import { Menu, X, Globe } from "lucide-react";
import { Button } from "@/components/ui/Button";

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

export function LandingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="border-[var(--color-text-on-dark)]/10 sticky top-0 z-50 w-full border-b bg-obsidian-graphite">
      <div className="mx-auto flex h-[70px] max-w-content items-center justify-between px-6 lg:px-16">
        {/* Logo and Brand */}
        <a href="/welcome-page" className="flex items-center gap-3">
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
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary navigation">
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
        <div className="hidden items-center gap-6 md:flex">
          <a
            href="/welcome-page#signin"
            className="text-sm font-medium text-white transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-primary focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian-graphite"
          >
            Sign In
          </a>
          <a href="/signup">
            <Button variant="headerCta" className="px-6">
              Get Started
            </Button>
          </a>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          className="flex items-center justify-center rounded-lg p-2 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt md:hidden"
          onClick={toggleMobileMenu}
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
                onClick={closeMobileMenu}
                className="rounded-lg px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4">
              <a
                href="/welcome-page#signin"
                onClick={closeMobileMenu}
                className="rounded-lg px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-primary"
              >
                Sign In
              </a>
              <a href="/signup" onClick={closeMobileMenu}>
                <Button variant="headerCta" className="w-full">
                  Get Started
                </Button>
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
