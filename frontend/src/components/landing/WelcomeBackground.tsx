export function WelcomeBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* The layered topographic relief image, 4K / 16:9, cover-cropped to the viewport */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/welcome-page_background.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Soft polar-pearl wash: keeps the hero text and white cards readable
          while letting the terrain stay clearly visible (heavier at the top
          where the headline sits, lighter as the page scrolls down). */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(246,248,251,0.62) 0%, rgba(246,248,251,0.38) 35%, rgba(246,248,251,0.12) 100%)",
        }}
      />
    </div>
  );
}
