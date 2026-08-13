export function Footer({ compact = false }: { compact?: boolean }) {
  const currentYear = new Date().getFullYear();
  return (
    <footer
      className={`border-t border-[var(--color-border-subtle)] bg-polar-pearl ${compact ? "py-4" : "py-8"}`}
    >
      <div className="mx-auto max-w-content px-6 lg:px-16">
        <div className="flex flex-col items-center justify-between gap-4 text-sm sm:flex-row">
          <p className="text-[var(--color-text-secondary)]">
            &copy; {currentYear} Naksha GeoSphere. The Geospatial Data Marketplace.
          </p>
          <nav className="flex gap-6" aria-label="Footer navigation">
            <a
              className="text-[var(--color-text-secondary)] transition-colors hover:text-obsidian-graphite"
              href="#data-formats"
            >
              Products
            </a>
            <a
              className="text-[var(--color-text-secondary)] transition-colors hover:text-obsidian-graphite"
              href="#trust"
            >
              About
            </a>
            <a
              className="text-[var(--color-text-secondary)] transition-colors hover:text-obsidian-graphite"
              href="#contact"
            >
              Contact
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
