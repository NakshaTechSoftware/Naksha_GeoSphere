import { Container } from "@/components/ui/Container";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--color-navy-border)] bg-spatial-navy text-cloud-mist/70">
      <Container className="flex flex-col gap-2 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Naksha GeoSphere. Engineering foundation build.</p>
        <p className="text-cloud-mist/50">
          Marketplace modules (search, purchase, licensing) ship in later phases.
        </p>
      </Container>
    </footer>
  );
}
