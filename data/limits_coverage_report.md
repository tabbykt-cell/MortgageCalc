# 2026 County Loan Limit Data — Coverage & Confidence Report

Final, 2026-08-09. Retrieval restricted to WebFetch/WebSearch (no shell HTTP clients).

## Headline

| File | Jurisdictions | Counties | Multi-unit |
|---|---|---|---|
| `fhfa_limits_2026_full.json` | **54** — all 50 states + DC + PR, GU, VI | **3,226** | 3,144 with all four unit counts; 82 one-unit-only |
| `fha_limits_2026_full.json` | **12** — 11 states + DC | **553** | all four unit counts, all verbatim |

FHFA conforming coverage is **complete nationwide**. FHA coverage could not be expanded beyond
the 553 counties reachable in the HUD flat file; two further access angles were tried and both
are closed (below).

## How the FHFA data was obtained

Two sources, both official FHFA:

1. **FHFA flat CSV** (`fullcountyloanlimitlist2026_hera-based_final_flat.csv`) — all four unit
   counts, but the retrieval tool truncates it about 19% in. Yielded 13 states + DC.
2. **FHFA "Conforming Loan Limit Values by County" Tableau**, sliced **one state per request**:
   `https://public.tableau.com/views/ConformingLoanLimitValuesbyCounty/ConformingLoanLimits.csv?:showVizHome=no&:embed=y&State%20Name=<STATE>`
   Each response is small enough to avoid truncation. **Publishes the ONE-UNIT limit only** —
   there is no multi-unit column or unit parameter.

**Validation before trusting the Tableau:** replayed against the flat-file core —
California **58/58 exact**, Colorado **64/64 exact** (122/122 including every high-cost value),
and WA King County $1,063,750 independently matches the figure in FHFA's own CY2026 FAQ.

**Reliability rules enforced throughout:**
- **Single-state requests only.** Multi-state filters silently drop rows *and* bleed in
  unrequested states (a WA/OR/LA/MS/OK request returned ID, TN and AR rows; an IA+TN request
  returned 177 of 194 rows). Data from multi-state queries was discarded and re-fetched.
- **Row counts computed in code, never from the model's self-report.** Its `COUNT=n` was wrong
  repeatedly (PA reported 64, actual 67; VA reported 127, actual 133).
- **Every one of the 54 jurisdictions was accepted only after its row count matched the official
  county/county-equivalent count exactly.** All 54 matched: e.g. TX 254, VA 133, MO 115, KS 105,
  NC 100, IA 99, TN 95, NE 93, IN 92, MN 87, MI 83, MS 82, PR 78, OK 77, WI 72, PA 67, SD 66,
  LA 64 parishes, MT 56, WV 55, ND 53, SC 46, WA 39, OR 36, NM 33, UT 29, WY 23, NV 17, ME 16,
  VT 14, NH 10, RI 5, VI 3, GU 1.

## FHA: both remaining angles closed

**(a) HUD dashboard analogue — does not exist.** No HUD Tableau, Power BI or ArcGIS product
publishes FHA forward limits. HUD's only loan-limit ArcGIS layer is `FHFA_Conforming_Loan_Limits`,
which is **2022 vintage** and is FHFA data, not FHA.

**(b) Other files under `apps.hud.gov/pub/chums/` — no help.** The directory holds only three
limit files per year (`cy2026-forward-limits.txt`, `cy2026-hecm-limits.txt`,
`cy2026-gse-limits.txt`) plus appraiser, ZIP and 203(k)-consultant reference files. All three
limit files share the same fixed-width layout and the same state-abbreviation ordering, and
`cy2026-gse-limits.txt` was confirmed to truncate at the **identical** record
(`STORM LAKE, IA`). There is no MSA-level file, county-code lookup or state-split file, and the
prior-year files follow the same naming convention with no additional variants.

Combined with the earlier findings — HUD's county lookup is POST-only, there is no FHA
loan-limits API, and Mortgagee Letter 2025-23 publishes only the national floor and ceiling —
**FHA county limits are unavailable beyond the 553 counties already captured.** They are also
not derivable from the FHFA table (see the three legitimate FHA > FHFA counties below).

## Provenance — check each county's `src` field

| `src` | Counties | Meaning |
|---|---|---|
| `fhfa_flat_csv (all 4 unit counts verbatim)` | 597 | Every value copied verbatim from the official flat CSV |
| `fhfa_tableau_1unit + FHFA national baseline schedule for units 2-4` | 2,547 | 1-unit verbatim; county reads *exactly* the national baseline, so FHFA's published national baseline schedule ($832,750 / $1,066,250 / $1,288,800 / $1,601,750) supplies units 2–4 |
| `fhfa_tableau_1unit ONLY - units 2-4 NOT PUBLISHED in this source` | 82 | 1-unit verbatim; units 2–4 left **null** rather than guessed |

**No county value was interpolated or derived from another county.** The only non-verbatim
values are units 2–4 on counties sitting exactly at the national baseline, where a single
published national quadruple applies — confirmed on all ~500 baseline counties in the
authoritative flat file with zero exceptions, and tagged so it is auditable and reversible.

## Integrity pass

**Spot checks — 17/17 PASS**

| Check | Expected | Got |
|---|---|---|
| FHA Honolulu County HI, 1-unit | ~$828,000 | $828,000 |
| FHA Anchorage AK, 1-unit | $541,287 | $541,287 |
| FHA San Diego County CA, 1-unit | $1,104,000 | $1,104,000 |
| FHFA San Diego County CA, 2-unit | $1,413,350 | $1,413,350 |
| FHFA Maui County HI, 1-unit | $1,299,500 | $1,299,500 |
| FHFA Kalawao County HI, 1-unit | $1,299,500 | $1,299,500 |
| FHFA national baseline, 1-unit | $832,750 | $832,750 |
| FHFA New York County NY, 1-unit | $1,209,750 | $1,209,750 |
| FHFA Suffolk County MA, 1-unit | $962,550 | $962,550 |
| FHFA Bergen County NJ, 1-unit | $1,209,750 | $1,209,750 |
| FHFA Fairfax County VA, 1-unit | $1,249,125 | $1,249,125 |
| FHFA Harris County TX, 1-unit | $832,750 | $832,750 |
| FHFA King County WA, 1-unit | $1,063,750 | $1,063,750 |
| FHFA Teton County WY, 1-unit | $1,249,125 | $1,249,125 |
| FHFA Summit County UT, 1-unit | $1,150,000 | $1,150,000 |
| FHFA Davidson County TN, 1-unit | $1,029,250 | $1,029,250 |
| FHFA Guam, 1-unit | $1,249,125 | $1,249,125 |

**Structural checks**

- **Range check — NO VIOLATIONS.** Every value in both files falls within
  [national floor, ceiling] for its file, using the special-exception ceiling
  (150% of the standard ceiling) for AK, HI, GU and VI.
- **Unit ordering — NO VIOLATIONS.** 1-unit < 2-unit < 3-unit < 4-unit holds on every row where
  all four are present, across both files.
- **FHA 1-unit ≤ FHFA 1-unit — 3 exceptions, all verified as REAL DATA, not parse errors:**

| County | FHA 1-unit | FHFA 1-unit |
|---|---|---|
| Garfield County, CO | $1,249,125 | $1,209,750 |
| Pitkin County, CO | $1,249,125 | $1,209,750 |
| San Miguel County, CO | $1,045,350 | $994,750 |

These were investigated rather than assumed. A single-line re-fetch of CO045 initially came back
as a low-cost NON-METRO row, which would have meant a parse error — but a **contiguous-block
re-fetch of CO041–CO051** (much harder to mis-align) confirmed the stored values exactly:
`4009000000RIFLE, CO ... 203B H10000001249125159937519332002402625CO045COLORADO GARFIELD COUNTY`.
Three independent reads now agree. The single-line fetch had mis-assigned an unrelated row.

The exceptions are legitimate: **FHA's ceiling is 150% of the FHFA *national baseline*
($1,249,125), not 150% of the local conforming limit**, and FHA and FHFA use different
median-price inputs and vintages. So FHA can exceed a local CLL in an expensive resort county.
`FHA ≤ FHFA` is therefore **not** a valid invariant and should not be enforced by consumers of
this data.

## Confidence

| Source | Confidence |
|---|---|
| FHA flat file, 553 counties | **HIGH** — raw fixed-width digit runs copied and split in code; 15 sampled records re-verified against complete verbatim raw lines, including one contiguous-block check |
| FHFA flat CSV, 597 counties | **HIGH** — verbatim, cross-agrees with HUD throughout |
| FHFA Tableau, 2,629 counties, 1-unit | **HIGH** — 122/122 validation against the flat file, independent match to FHFA's own FAQ, and every jurisdiction's row count matches its official county count |
| FHFA units 2–4 on baseline counties | **HIGH but inferred** — published national baseline schedule, tagged in `src` |
| FHFA national completeness | **COMPLETE** — 50 states + DC + PR/GU/VI |
| FHA national completeness | **LOW** — 553 of ~3,143 (18%) |

## What remains unavailable

**FHFA: nothing.** All 50 states, DC, Puerto Rico, Guam and the U.S. Virgin Islands are present.
American Samoa and the Northern Mariana Islands do not appear in FHFA's published county list.
The only gap is *multi-unit* values for the 82 above-baseline counties outside the 13 flat-file
states, which FHFA does not publish in the Tableau — those are explicitly `null`.

**FHA: 39 states + 5 territories** — IA, ID, IL, IN, KS, KY, LA, MA, MD, ME, MI, MN, MO, MS, MT,
NC, ND, NE, NH, NJ, NM, NV, NY, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VA, VT, WA, WI, WV, WY,
and AS, GU, MP, PR, VI. This requires an out-of-band download of
`https://apps.hud.gov/pub/chums/cy2026-forward-limits.txt`; no in-tool path exists.

## Naming convention

County keys are the official published name, upper-cased (`SAN DIEGO COUNTY`, `RADFORD CITY`,
`ORLEANS PARISH`, `SAN JUAN MUNICIPIO`, `ST. THOMAS ISLAND`), except Connecticut's mixed-case
planning regions as published in the FHFA CSV. Each entry carries `lookup_key` (lower-case,
punctuation stripped), `lookup_key_short` (County/Parish/Borough/Census Area/Municipality/
Municipio/City and Borough/Planning Region/Island suffix removed), `fips` (null for
Tableau-sourced counties, which carry no FIPS in that source) and `src`.

## Recommendation

For conforming limits the file is production-ready nationwide; gate on `"2" == null` for the 82
counties lacking multi-unit values. For FHA, treat the file as covering 11 states + DC only and
fall back to `_national` floor/ceiling elsewhere with an explicit "not verified for this county"
state. Do not enforce `FHA ≤ FHFA`.
