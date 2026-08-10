// Picks the cadastral (survey/parcel) boundaries file out of a village folder's object
// listing. The convention is a file named like "cadastral_boundaries.geojson", but any
// .geojson file works as a fallback so a freshly-uploaded dataset loads without code
// changes: the village folder is dedicated to that village's cadastral data, so whatever
// geojson is in there is the file to render.
export function pickCadastralFile(files: string[]): string | undefined {
  const geojsons = files.filter((key) => key.toLowerCase().endsWith(".geojson"));
  if (geojsons.length === 0) return undefined;

  const lower = geojsons.map((key) => ({ key, lower: key.toLowerCase() }));
  return (
    lower.find((f) => f.lower.includes("cadastral"))?.key ??
    // Common cadastral synonyms rank above arbitrary names but below an explicit
    // "cadastral" file (in case a village folder carries more than one geojson).
    lower.find((f) => f.lower.includes("parcel") || f.lower.includes("survey"))?.key ??
    geojsons[0]
  );
}
