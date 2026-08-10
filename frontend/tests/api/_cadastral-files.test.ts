import { describe, expect, it } from "vitest";
import { pickCadastralFile } from "@/app/api/datasets/_cadastral-files";

describe("pickCadastralFile", () => {
  it("prefers a file named cadastral_boundaries.geojson", () => {
    const files = [
      "Administrative Boundaries/india/karnataka/Districts/17_Chikkamagaluru/SubDistricts/Chikkamagaluru/Hoblis/Kasaba/Villages/Hiremagaluru/cadastral_boundaries.geojson",
    ];
    expect(pickCadastralFile(files)).toBe(files[0]);
  });

  it("picks the cadastral-named file when several geojsons exist", () => {
    const files = [
      "…/Hiremagaluru/readme.md",
      "…/Hiremagaluru/village_boundaries.geojson",
      "…/Hiremagaluru/cadastral_boundaries.geojson",
    ];
    expect(pickCadastralFile(files)).toBe(files[2]);
  });

  it("matches cadastral names case-insensitively", () => {
    const files = ["…/Hiremagaluru/CADASTRAL_BOUNDARIES.GeoJSON"];
    expect(pickCadastralFile(files)).toBe(files[0]);
  });

  it("falls back to a parcel/survey-named file before an arbitrary one", () => {
    const files = [
      "…/Hiremagaluru/other.geojson",
      "…/Hiremagaluru/survey_parcels.geojson",
    ];
    expect(pickCadastralFile(files)).toBe(files[1]);
  });

  it("falls back to any .geojson when nothing is cadastral-named", () => {
    const files = ["…/Hiremagaluru/parcels-2024.geojson"];
    expect(pickCadastralFile(files)).toBe(files[0]);
  });

  it("finds files nested in a subfolder of the village folder", () => {
    const files = ["…/Hiremagaluru/survey/cadastral_boundaries.geojson"];
    expect(pickCadastralFile(files)).toBe(files[0]);
  });

  it("returns undefined when no .geojson exists", () => {
    expect(pickCadastralFile(["…/Hiremagaluru/readme.md", "…/Hiremagaluru/data.kml"])).toBe(
      undefined
    );
  });

  it("returns undefined for an empty listing", () => {
    expect(pickCadastralFile([])).toBe(undefined);
  });
});
