import { Container } from "@/components/ui/Container";

export function Header() {
  return (
    <header className="border-b border-[var(--color-navy-border)] bg-spatial-navy text-cloud-mist">
      <Container className="flex items-center justify-between py-5">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-geo-teal text-sm font-bold text-cloud-mist"
            aria-hidden="true"
          >
            NG
          </span>
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight">Naksha GeoSphere</p>
            <p className="text-xs text-cloud-mist/70">The Geospatial Data Marketplace</p>
          </div>
        </div>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm sm:flex">
          <a className="text-cloud-mist/80 transition-colors hover:text-cloud-mist" href="#platform-foundation">
            Platform
          </a>
          <a
            className="text-cloud-mist/80 transition-colors hover:text-cloud-mist"
            href="https://github.com"
            rel="noreferrer"
          >
            Documentation
          </a>
        </nav>
      </Container>
    </header>
  );
}
