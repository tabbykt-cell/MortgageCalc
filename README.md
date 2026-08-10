# MortgageCalc

An offline, single-file mortgage calculator with amortization charts, mortgage-insurance
modeling, program screening, and a printable report.

**[Open the calculator](https://tabbykt-cell.github.io/MortgageCalc/)** (once GitHub Pages is enabled — see below)

Everything lives in one `index.html`. No build step, no dependencies, no network calls.
Download it and double-click it, or serve it from anywhere. It works with the network cable
unplugged, which is deliberate — the loan-limit tables are embedded rather than fetched.

## What it does

- **Amortization** — fixed and adjustable rate, 10/15/20/30-year terms, extra principal,
  full monthly and annual schedules, CSV export.
- **Mortgage insurance** — conventional PMI with origination/cancellation/automatic-termination
  modeled separately, and FHA MIP following the HUD ML 2023-05 rate and duration matrix.
- **ARMs** — 3/6, 5/6, 7/6 and 10/6 agency SOFR plans plus generic annual-reset products, with
  caps, recast at each adjustment, and best/expected/worst projections.
- **Program screening** — a broad educational screen for conventional and FHA, with
  occupancy/unit/LTV gates, credit and DTI bands, and county loan limits.
- **Loan limits** — the complete 2026 FHFA conforming table (3,226 counties, all 50 states plus
  DC and the territories) and FHA limits for the 553 counties HUD's published file yielded.
- **Ownership view** — projected equity against total cost over a holding period you choose,
  independent of when the loan is paid off.
- **Printable report** — a light-themed, branded summary of every input and result.

Click any figure in a box to see exactly how it was calculated.

## What it is not

The program-screening section is an educational possibility screen, not underwriting. It does
not model Desktop Underwriter, Loan Product Advisor, the TOTAL Scorecard, or any lender's
overlays, and where agency paths diverge it shows a range rather than a verdict. Only a lender
can qualify a borrower.

The ownership view compares projected value against money spent. It is **not** an investment or
rent-versus-buy analysis — it excludes maintenance, capital repairs, selling costs, rent avoided,
the opportunity cost of your down payment, and tax effects.

### Known limits

These are documented rather than hidden, because a financial tool that quietly guesses is worse
than one that says it doesn't know.

- **FHA county limits cover 11 states plus DC** (AK, AL, AR, AZ, CA, CO, CT, DC, DE, FL, GA, HI).
  HUD's full county file is not machine-retrievable. Everywhere else the FHA limit reports as
  unknown and the loan-size conclusion is suppressed rather than defaulting to the floor.
- **82 above-baseline counties** publish only a 1-unit conforming limit. Their 2/3/4-unit values
  report as unknown rather than being derived — deriving them produced real errors in an earlier
  build.
- **FHA periodic MIP is approximate.** The average-outstanding-balance method is implemented and
  the approximation is disclosed in the UI, but it has not been reconciled to the dollar against
  HUD's prescribed rounding.
- **The FHA manual DTI matrix returns 31/43 for every credit band.** The 37/47 and 40/50
  compensating-factor tiers are described in the copy but are not yet selectable.
- **Appraisal-ratio mode** (used when solving maximum affordable price) applies your current
  appraisal-to-price ratio to candidate prices. That's a defensible modeling choice, not an
  agency rule.

## Repository layout

```
index.html                          the calculator (this is the whole product)
widget.html                         compact embeddable variant
test/test-mortgage-calculator.js    Playwright regression suite, 184 assertions
data/                               source loan-limit tables + provenance report
skill/mortgage-calculator/          Claude skill packaging
dist/mortgage-calculator.skill      installable skill bundle
```

## Running the tests

```bash
cd test
npm install
node test-mortgage-calculator.js
```

## Data provenance

Conforming limits come from FHFA's official 2026 county table; every state's row count was
verified against the official county count before being accepted. FHA limits come from HUD
Mortgagee Letter 2025-23 and the CY2026 forward-limits file. `data/limits_coverage_report.md`
records exactly what was retrieved, from where, and with what confidence.

Where a value could not be verified, it is absent rather than estimated.

## License

Copyright (c) 2026 OpExChange Pro. **All rights reserved.** See [LICENSE](LICENSE).

This is proprietary software. Viewing this repository does not grant any right to use, copy,
modify, or distribute it. The loan-limit data reproduced here comes from public FHFA and HUD
publications and is not covered by that claim.

Nothing this tool produces is financial advice, underwriting, or a commitment to lend.
