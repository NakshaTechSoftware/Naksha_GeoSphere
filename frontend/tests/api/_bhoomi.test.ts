import { describe, expect, it } from "vitest";
import { dropdownOptions, matchOption, parseOwners } from "@/app/api/land-records/_bhoomi";

// Trimmed from a real Bhoomi "Fetch details" response for Hassan/Belur/Arehalli/Hirigarje,
// survey 165, surnoc *, hissa 1.
const RTC_RESULT = `
<table id="ctl00_MainContent_grdCurrentYearOwnerDetails1">
  <tr><th>Owner</th><th>Extent</th><th>Owner Category</th></tr>
  <tr>
    <td><span id="ctl00_MainContent_grdCurrentYearOwnerDetails1_ctl02_lblowner">ಟಿ.ಪಿ.ಯಶೋಧಮ್ಮ ಟಿ.ಪಿ.ಉಮಾಶಂಕರ</span></td>
    <td><span id="ctl00_MainContent_grdCurrentYearOwnerDetails1_ctl02_lblext">2.0.0</span></td>
    <td><span id="ctl00_MainContent_grdCurrentYearOwnerDetails1_ctl02_lblkhatha">Private</span></td>
  </tr>
  <tr>
    <td><span id="ctl00_MainContent_grdCurrentYearOwnerDetails1_ctl03_lblowner">ಹೆಚ್.ಹೆಚ್.ಗಂಗಾಧರ</span></td>
    <td><span id="ctl00_MainContent_grdCurrentYearOwnerDetails1_ctl03_lblext">1.0.0</span></td>
    <td><span id="ctl00_MainContent_grdCurrentYearOwnerDetails1_ctl03_lblkhatha">Private</span></td>
  </tr>
</table>`;

const VILLAGE_SELECT = `
<select name="ctl00$MainContent$ddlCVillage" id="ctl00_MainContent_ddlCVillage">
  <option selected="selected" value="0">Select Village</option>
  <option value="2">ADAGENCHANAHALLI</option>
  <option value="50">HIRIGARJE</option>
  <option value="13">ALURU</option>
</select>`;

describe("parseOwners", () => {
  it("reads every owner row of the RTC grid", () => {
    expect(parseOwners(RTC_RESULT)).toEqual([
      { name: "ಟಿ.ಪಿ.ಯಶೋಧಮ್ಮ ಟಿ.ಪಿ.ಉಮಾಶಂಕರ", extent: "2.0.0", category: "Private" },
      { name: "ಹೆಚ್.ಹೆಚ್.ಗಂಗಾಧರ", extent: "1.0.0", category: "Private" },
    ]);
  });

  it("returns nothing when the lookup produced no grid", () => {
    expect(parseOwners("<p>No records</p>")).toEqual([]);
  });
});

describe("dropdownOptions / matchOption", () => {
  it("drops the Select… placeholder", () => {
    expect(dropdownOptions(VILLAGE_SELECT, "ddlCVillage").map((o) => o.text)).toEqual([
      "ADAGENCHANAHALLI",
      "HIRIGARJE",
      "ALURU",
    ]);
  });

  it("resolves a KGIS village spelling to Bhoomi's ('Hiregarje' -> 'HIRIGARJE')", () => {
    expect(matchOption(dropdownOptions(VILLAGE_SELECT, "ddlCVillage"), "Hiregarje")).toBe("50");
  });

  it("refuses a name that resembles nothing on the list", () => {
    expect(matchOption(dropdownOptions(VILLAGE_SELECT, "ddlCVillage"), "Bengaluru")).toBeUndefined();
  });
});
