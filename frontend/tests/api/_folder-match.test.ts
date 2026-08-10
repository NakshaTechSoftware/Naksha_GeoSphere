import { describe, expect, it } from "vitest";
import { cleanFolderName, namesMatch } from "@/app/api/datasets/_folder-match";

// ---------------------------------------------------------------------------
// cleanFolderName
// ---------------------------------------------------------------------------
describe("cleanFolderName", () => {
  it("strips a leading numeric code and separator", () => {
    expect(cleanFolderName("17_Chikkamagaluru")).toBe("chikkamagaluru");
    expect(cleanFolderName("2002_Bangalore-South")).toBe("bangalore south");
    expect(cleanFolderName("04-Kalaburgi")).toBe("kalaburgi");
  });

  it("lowercases the result", () => {
    expect(cleanFolderName("BENGALURU")).toBe("bengaluru");
    expect(cleanFolderName("Bangalore")).toBe("bangalore");
  });

  it("replaces underscores and hyphens with spaces", () => {
    expect(cleanFolderName("Bangalore-South")).toBe("bangalore south");
    expect(cleanFolderName("Bangalore_South")).toBe("bangalore south");
    expect(cleanFolderName("a-b_c")).toBe("a b c");
  });

  it("strips parentheses", () => {
    expect(cleanFolderName("20_Bengaluru_(Urban)")).toBe("bengaluru urban");
    expect(cleanFolderName("Bengaluru_(Rural)")).toBe("bengaluru rural");
  });

  it("trims leading/trailing whitespace", () => {
    expect(cleanFolderName("  hello  ")).toBe("hello");
    expect(cleanFolderName("20_Bengaluru_(Urban)")).toBe("bengaluru urban");
  });

  it("returns empty string for empty input", () => {
    expect(cleanFolderName("")).toBe("");
  });

  it("handles names with no numeric prefix", () => {
    expect(cleanFolderName("Kalaburagi")).toBe("kalaburagi");
    expect(cleanFolderName("Bengaluru Urban")).toBe("bengaluru urban");
  });
});

// ---------------------------------------------------------------------------
// namesMatch – exact / substring
// ---------------------------------------------------------------------------
describe("namesMatch – exact and substring", () => {
  it("matches identical strings", () => {
    expect(namesMatch("bangalore south", "Bangalore South")).toBe(true);
  });

  it("matches when folder name contains the display name", () => {
    expect(namesMatch("bengaluru urban district", "Bengaluru Urban")).toBe(true);
  });

  it("matches when display name contains the folder name", () => {
    expect(namesMatch("bangalore", "Bangalore South")).toBe(true);
  });

  it("returns false for empty inputs", () => {
    expect(namesMatch("", "Bangalore")).toBe(false);
    expect(namesMatch("bangalore", "")).toBe(false);
    expect(namesMatch("", "")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// namesMatch – transliteration fuzzy matching (similarity >= 0.90)
// ---------------------------------------------------------------------------
describe("namesMatch – transliteration fuzzy matching", () => {
  it("matches Kalaburgi ↔ Kalaburagi (1-char transliteration)", () => {
    expect(namesMatch("kalaburgi", "Kalaburagi")).toBe(true);
  });

  it("matches Chikkamagalur ↔ Chikkamagaluru (trailing vowel diff)", () => {
    expect(namesMatch("chikkamagalur", "Chikkamagaluru")).toBe(true);
  });

  it("matches Kalaburagi ↔ Kalaburgi (reverse direction)", () => {
    expect(namesMatch("kalaburagi", "Kalaburgi")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// namesMatch – critical regression: must NOT cross-match different taluks
// ---------------------------------------------------------------------------
describe("namesMatch – must not cross-match different places", () => {
  it("Bangalore North does NOT match Bangalore South", () => {
    expect(namesMatch("bangalore north", "Bangalore South")).toBe(false);
  });

  it("Bangalore South does NOT match Bangalore North", () => {
    expect(namesMatch("bangalore south", "Bangalore North")).toBe(false);
  });

  it("Bengaluru East does NOT match Bengaluru West", () => {
    expect(namesMatch("bengaluru east", "Bengaluru West")).toBe(false);
  });

  it("Bengaluru North does NOT match Bengaluru South", () => {
    expect(namesMatch("bengaluru north", "Bengaluru South")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// namesMatch – realistic end-to-end folder search
// ---------------------------------------------------------------------------
describe("namesMatch – realistic folder-to-display-name mapping", () => {
  const FOLDERS = [
    "2001_Bangalore-North",
    "2002_Bangalore-South",
    "2003_Bengaluru-East",
    "2004_Bengaluru-Central",
    "2005_Bengaluru-West",
  ];

  const cleaned = FOLDERS.map((f) => cleanFolderName(f));

  it.each([
    ["Bangalore North", "bangalore north"],
    ["Bangalore South", "bangalore south"],
    ["Bengaluru East", "bengaluru east"],
    ["Bengaluru Central", "bengaluru central"],
    ["Bengaluru West", "bengaluru west"],
  ])("query %s matches the correct cleaned folder", (query, expectedClean) => {
    const match = cleaned.find((c) => namesMatch(c, query));
    expect(match).toBe(expectedClean);
  });

  it("each query maps to exactly one distinct folder (no false positives)", () => {
    const queries = [
      "Bangalore North",
      "Bangalore South",
      "Bengaluru East",
      "Bengaluru Central",
      "Bengaluru West",
    ];
    const matches = queries.map(
      (q) => cleaned.find((c) => namesMatch(c, q)) ?? "NONE",
    );
    // All five queries should resolve, and each to a unique folder
    expect(new Set(matches).size).toBe(5);
    expect(matches).not.toContain("NONE");
  });
});

// ---------------------------------------------------------------------------
// namesMatch – district folder with parentheses (Bengaluru Urban)
// ---------------------------------------------------------------------------
describe("namesMatch – district folder with parentheses", () => {
  it('matches "20_Bengaluru_(Urban)" folder against "Bengaluru Urban" display name', () => {
    const cleaned = cleanFolderName("20_Bengaluru_(Urban)");
    expect(cleaned).toBe("bengaluru urban");
    expect(namesMatch(cleaned, "Bengaluru Urban")).toBe(true);
  });

  it('matches "20_Bengaluru_(Rural)" folder against "Bengaluru Rural" display name', () => {
    const cleaned = cleanFolderName("20_Bengaluru_(Rural)");
    expect(cleaned).toBe("bengaluru rural");
    expect(namesMatch(cleaned, "Bengaluru Rural")).toBe(true);
  });
});
