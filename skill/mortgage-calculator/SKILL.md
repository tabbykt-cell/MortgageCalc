---
name: mortgage-calculator
description: Run an interactive mortgage calculator with amortization charts, PMI and FHA MIP modeling, and extra-payment comparisons. Use when the user asks to calculate a mortgage payment, run a mortgage or loan scenario, see an amortization schedule, work out PMI or FHA mortgage insurance cost, compare loan terms, or asks "what would my payment be on a $X house". Trigger on "mortgage calculator", "monthly payment on a house", "amortization", "PMI", "FHA MIP", "how much interest will I pay", or "what if I pay extra on my mortgage".
---

# Mortgage calculator

An interactive calculator that renders inline in the conversation: monthly payment
breakdown, three amortization chart views, mortgage-insurance drop-off, and
extra-payment savings.

## How to run it

1. Read `assets/widget.html`.
2. Pass its **entire contents verbatim** as `widget_code` to the `show_widget` tool
   (the `visualize` MCP server). Do not rewrite, summarize, or re-style it — it is
   already built against the host design tokens and validated for light and dark mode.
   - `title`: `mortgage_calculator_amortization_app`
   - `loading_messages`: 2–3 short playful lines, e.g.
     `["Amortizing your amortization", "Teaching PMI when to leave"]`
3. Keep your own text response short. The widget carries the numbers; do not restate
   the payment breakdown in prose.

If the user gave specific numbers (price, down payment, rate, term), edit the `S = {...}`
state object near the top of the widget's `<script>` **and** the matching `value="..."`
attributes on the range inputs before passing it, so it opens on their scenario.

If `show_widget` is unavailable, fall back to `assets/standalone.html` — a full-page
version with an amortization table and CSV export. Deliver it with `SendUserFile`.

## What the user can change

**Widget:** price · down payment % · rate · term · extra monthly principal · mortgage
insurance mode · PMI rate and cancel-LTV · FHA annual MIP and duration · tax and insurance.

**Standalone (`assets/standalone.html`) adds:** an APPRAISED / MARKET VALUE field beside the
purchase price (blank by default) with an "assume appraisals come in at asking" toggle that governs
the max-affordable-price search, a "how long do you plan to own?" holding-period input (default 10
years) that drives the ownership analysis independently of loan payoff, loan program (Conventional /
FHA), fixed vs. adjustable rate with fixed period, adjustment frequency (6-month agency SOFR plans by
default, or a generic 12-month reset), fully indexed rate, rate floor, rate caps and scenario, a
total-paid-over-the-full-term breakdown, a payment-and-rate chart, an income-based
affordability section (housing ratio, total-debt ratio, max supportable price), a projected
home value, cumulative cost-to-owner and equity on the chart and schedule (with the balance
point where the two lines cross, and the BREAKEVEN point where equity covers everything paid),
closing costs and cash-to-close, an estimated borrowing range derived from income and debts, a
PROGRAM SCREENING section (rule-matrix eligibility per program, plus separate "financial profile
indicators" from credit score, work history, DTI, reserves, assets, property type and occupancy, and
an illustrative rate build-up), collapsible sections with one-line summaries, an offline
conforming-limit lookup by state and county, click-to-explain derivations on every boxed figure, a
print-to-PDF professional report, a brand watermark, selectable table column sets, and CSV export.

## Accuracy notes — repeat these when relevant

- The default PMI (0.55%/yr) and FHA MIP values are **editable placeholders, not quoted rates**.
  Real rates vary by lender, credit score, and LTV, and FHA premium rates and duration rules have
  changed several times. Tell the user to verify current figures with a lender.
- FHA annual MIP defaults follow an approximation of the HUD ML 2023-05 structure and are
  recomputed automatically whenever the down payment, term, or program change (until the user
  edits the MIP fields directly, which turns off the auto-default): LTV ≤ 90% → 0.50%/yr for 11
  years, then it drops off; LTV > 90% → 0.55%/yr for the life of the loan (or the full term, if
  15 years or shorter). "None" is not offered as an MI mode while FHA is selected — FHA mortgage
  insurance is mandatory by law.
- PMI cancellation is modeled simply: it ends when the balance reaches the chosen LTV of the
  **original value** (the lesser of price and appraised value). Real servicers distinguish
  borrower-requested cancellation (usually 80%) from automatic termination (usually 78%);
  appraisal-based cancellation differs. Those are three separate rules in the code — see MI OVERRIDES.
  MI end markers report the LAST CHARGED month, not the first uncharged one; an earlier build said
  "ends yr 12" for an 11-year premium and "ends yr 31" for a 30-year one.
- Property tax and insurance are held flat for the life of the loan. Real escrow payments are not.
- ARM projections are scenarios, not forecasts. "Worst case" assumes every adjustment hits its
  cap; "expected" assumes the user's index-plus-margin estimate; "best case" assumes no change.
  Real ARMs differ in index, margin, adjustment frequency, floors, and rounding — say so.
- COUNTY LOAN LIMITS are two independent embedded tables. Neither derives from the other and neither
  derives multi-unit values from single-unit ones — every figure is published or explicitly UNKNOWN.
  - **CLL / FHFA conforming — complete nationwide.** 3,226 counties and county-equivalents across all
    50 states, DC, PR, GU and VI, from the official FHFA 2026 full county list (HERA-based, final,
    flat), row counts reconciled against official county counts. 78 counties are above baseline with
    all four unit counts; **82 counties publish the ONE-UNIT limit only** — their 2–4 unit figures are
    UNKNOWN and must never be derived. Everything else sits exactly at the national baseline.
  - **FHA / HUD — 553 counties, 11 states + DC.** AK AL AR AZ CA CO CT DC DE FL GA HI, every figure
    verbatim from HUD's CY2026 flat file; nothing is derived and no other state is inferred.
    **Everywhere else the FHA limit is genuinely UNKNOWN** (HUD's county lookup is POST-only, there
    is no API, and the flat file truncates county names) and the loan-size test is SUPPRESSED, never
    guessed at the national floor. This is a PERMANENT coverage gap and the UI labels it as one.
  - **Never treat a ceiling as a county limit.** The special-exception figure for AK/HI/GU/VI is a
    higher ceiling, not the limit for every county there. Honolulu's real 1-unit FHA limit is
    $828,000 and Anchorage's is the $541,287 floor — an earlier build showed $1,873,625 for both.
  - **"FHA limit <= FHFA limit" is NOT a valid invariant.** Garfield, Pitkin and San Miguel counties
    in Colorado genuinely run FHA above FHFA, because FHA's ceiling is 150% of FHFA's NATIONAL
    BASELINE rather than of the local conforming limit. Do not add that as a sanity check.
  - **CONFIRMED PRIMARY** (HUD Handbook 4000.1 glossary; 24 CFR 203.18(g)): the FHA limit is compared
    against the **BASE loan amount, before financed upfront MIP**. Financed UFMIP rides on top and the
    total mortgage may legitimately exceed the limit.
  - Unknown stays unknown in the headline, the program row, the flags, the PDF and the CSV.
- The 28/36 ratios (and FHA's commonly cited 31/43) are rules of thumb, not underwriting.
  Lenders weigh credit, reserves, employment and program rules, and they measure GROSS income —
  the user's after-tax picture is tighter than the percentages imply. Never tell someone a home
  is or isn't affordable; show the ratios and let them decide.
- Home value is projected by compounding an appreciation rate the user sets. It is an assumption,
  not a forecast — housing markets are local and can fall. Equity shown is before selling costs.
  PMI removal on appreciation normally needs a lender-approved appraisal, which is not modeled.
- The "Ownership cost and projected equity" section (formerly labeled as a value-vs-cost comparison)
  is deliberately naive: it counts every dollar out (including tax and insurance, which buy nothing
  you keep) and credits nothing for rent avoided. It is NOT an investment, ROI, or rent-vs-buy
  verdict, and a negative "value − paid" does not mean buying was a mistake. It also excludes
  maintenance, closing and selling costs, the opportunity cost of the down-payment cash, and tax
  treatment. Always say this when showing it.
- Amortization-table year rows are labeled "Year N" (loan year, 1-indexed from the first payment),
  not a calendar year — the file no longer implies a specific calendar year per row, since the
  first payment's actual calendar year depends on when the loan closes.
- PROGRAM SCREENING is an experimental screening estimate, NEVER underwriting, a pre-approval, or a
  rate quote. Only a lender can qualify a borrower — say so. The section deliberately separates two
  different things, and you should too:
  - **The headline is a program-screening verdict**, driven by hard rules: "Conventional and FHA may
    fit — verify with a lender", "No standard program indicated", "Blocked — see issues below",
    "Cannot screen — loan-limit status unknown", or "Custom / nonstandard scenario". A hard failure
    can NEVER produce a positive-sounding headline.
  - **"Financial profile indicators" (the 0–100 score)** is a secondary descriptor of the BORROWER
    (credit, ratios, reserves, work history, down payment). It is an input, never a verdict: a 97/100
    profile still gets "No standard program indicated" if a program rule fails. Never quote the score
    as if it were an eligibility answer.
- PROGRAM RULE MATRICES: each program is screened on the COMBINATION of occupancy, property type,
  unit count, LTV, credit, DTI and loan limit — not one generic threshold, because the decisive rules
  are the intersections. Implemented as `screenPrograms()` + `convMaxLTV()`. Key screening rules:
  - Conventional max LTV is a RANGE, not one number (`convLTVRule()`), because the published tables
    genuinely have two answers: what an AUS "Accept" allows, and the lower manually-underwritten
    figure. LTV <= manual screens as a pass; between manual and AUS it is CONDITIONAL; above AUS it
    fails. 1-unit primary 97 AUS / 95 manual (the 97% option is FIXED-RATE ONLY, so a 97% ARM is
    conditional, never a clean pass); 2-unit primary 95/85; 3-4 unit primary 95/80 (Freddie Mac's
    published table; Fannie Mae's figure can be lower — explain the agency difference rather than
    asserting one number); second home 90; manufactured primary 95; 1-unit investment 85; 2-4 unit
    investment 75. Manufactured homes are NOT eligible as investment properties.
    **HARD GATES run BEFORE any LTV test**: occupancy + unit count. A multi-unit SECOND HOME fails
    outright (Fannie restricts second homes to one-unit dwellings). Above 95% LTV the 97% option
    additionally requires a one-unit principal residence, a FIXED rate, and a NON-HIGH-BALANCE loan —
    a $900k San Diego purchase at 3% down fails on high balance even though it is under the local
    high-cost limit. DTI ceiling ~50%.
    **CREDIT IS NO LONGER A CATEGORICAL 620 CUTOFF (H14):** since 15 November 2025 Fannie Mae's DU no
    longer imposes a minimum third-party credit score. Sub-620 screens as CONDITIONAL — AUS- and
    product-dependent — because manual underwriting, Freddie Mac, mortgage-insurer and lender overlays
    commonly still require 620. Do not call it unavailable. Present conditional results as conditional
    — never as pass or fail.
  - FHA: primary residence ONLY, 1-4 units, 500 floor, 3.5% down at 580+ / 10% below, and its own
    separate lower loan limit. Second homes: say "ordinary second/vacation homes are ineligible; rare
    HUD-approved Secondary Residence exceptions exist under hardship or location conditions with a
    limited LTV" — not a flat impossibility. Condos: FHA additionally requires an APPROVED PROJECT or
    a qualifying Single-Unit Approval, so a strong borrower can still be declined over the building.
    **FHA DTI IS TWO-DIMENSIONAL AND SCORE-BANDED (H5), never a flat 43/50 total-only rule.**
    `fhaDtiRule(fico)` returns HUD's ordinary manual limits (Handbook 4000.1) as {front, back} —
    31/43 for a 500-579 score and 31/43 at 580+ without documented compensating factors — and BOTH
    the housing (front) and total (back) ratios are computed and tested. Above those limits, and below
    `FHA_AUS_INDETERMINATE_MAX` (57%), the result is INDETERMINATE, not a pass: a TOTAL Scorecard
    Accept is AUS-driven and HUD publishes no universal ceiling for it. Never describe 43-50% as a
    generic FHA possibility for every score, and never present 50% as a universal TOTAL ceiling.
  - Statuses are `pass` / `conditional` / `caution` / `unknown` / `na` / `fail`; a failure renders as
    "not indicated by this screening tool" with the specific reason, never a bare "no".
  - The section screens BROAD possibilities against published program rules. It does NOT approximate
    Desktop Underwriter, Loan Product Advisor, TOTAL Scorecard or any other specific automated
    underwriting path, and applies no lender overlays. Say so.
- If FHA is selected together with a non-primary occupancy, the FHA cost math (MIP, the 31/43 bands)
  is SUSPENDED — that loan cannot exist, so pricing it would be misleading. The tool blocks and tells
  the user to switch program or occupancy.
- MI OVERRIDES (H7/H8) — **ANY override of a MANDATORY premium forces "Custom pricing experiment"
  and suppresses ALL program-eligibility conclusions. There is deliberately no bypass path.**
  `customScenario()` owns this, and it covers five paths: MI=None above 80% LTV, a PMI rate of 0,
  a PMI CANCELLATION THRESHOLD raised above the 80% origination rule, FHA upfront MIP of 0, and FHA
  annual MIP of 0. Forcing PMI ON below 80% is also custom, so the Conventional copy can never say
  "no PMI at 20% down" while the model charges $36,135 of it. The three MI rules are modelled
  SEPARATELY and must not be conflated: **origination requirement** (`MI_ORIGINATION_LTV` = 80, the
  only rule that can decide whether a loan may START without MI), **borrower-requested cancellation**
  (the editable threshold), and **automatic termination** (`MI_AUTO_TERM_LTV` = 78). An editable
  cancellation setting must never erase required PMI at 96.5% LTV. Never present a custom scenario's
  payment as an obtainable quote.
- BLOCKER PRECEDENCE: universal blockers are evaluated FIRST and outrank every informational state.
  Unreadable input, no income, not enough cash for ANY screened program, and a sub-500 score stop the
  purchase regardless of program or pricing experiment. A custom-pricing warning can coexist with a
  blocker but must never replace it, and "no mortgage needed" is a SUCCESS state that requires the
  buyer to actually have the cash. Program-specific ratio failures are NOT universal blockers — each
  program row judges its own DTI on its own payment, which is why switching the displayed program
  cannot move the blocker list.
- THE THREE PAYMENT CONCEPTS. Every payment figure in the file — cards, charts, explain panels, CSV,
  PDF — resolves through `payments(D)`, which defines exactly three values. Use the same vocabulary:
  - **required** — what a LENDER qualifies on. Excludes voluntary extra principal. For an ARM it uses
    the product-rule qualifying rate. Drives every ratio, the score, the verdict and the blockers.
  - **actualFirst** — what actually leaves the account in month 1, with extra principal capped at the
    remaining balance. Drives the hero figure and the donut.
  - **planned** — required plus the full intended extra. If the entered extra exceeds the balance
    there is no recurring plan, so this falls back to the actual first payment and the UI calls it a
    one-time payoff. NEVER label a one-time payoff as recurring.
  No renderer does its own payment arithmetic. The PDF is a consumer-facing decision document and its
  numbers must match the screen exactly — that reconciliation is release-blocking and is tested.
- PER-PROGRAM MODELS (the architectural rule). `specFor(program, canonical)` builds a complete,
  independent spec — own base loan, MI stream, cash to close, rate and qualifying payment — and
  `screenPrograms()` judges Conventional and FHA each against ITS OWN model. **The program selector in
  the input panel only changes which detailed payment view is displayed; it must never move either
  program's row status or the headline verdict.** There is a regression test for exactly this, and it
  asserts the displayed payment DOES change so the invariance check cannot pass vacuously.
- ARM QUALIFYING RATE is product-specific (`qualRateInfo`), not "note rate + lifetime cap":
  - fixed period **5 years or less** -> the greater of the fully indexed rate and the note rate plus
    the **initial adjustment cap** (Fannie Mae B3-6-04). For a 6.5% 5/1 with 2/2/5 caps and a 7.5%
    fully indexed estimate that is max(7.5, 8.5) = **8.5%**, not 11.5%.
  - fixed period **more than 5 years** -> the note rate.
  - **fixed period >= term** -> no reset can ever occur, so the loan is qualified and modelled as
    fixed. A 10/1 ARM on a 10-year term must never be stressed at the lifetime cap.
  It is also invariant to the Best/Expected/Worst control, which affects the projection and lifetime
  cost ONLY. Three ARM figures are shown and each is named: **month-one payment**, **projected peak in
  the selected scenario**, and **qualification stress payment**. Only say "capped out" when the rate
  actually reaches the lifetime cap.
- ARM PRODUCT HONESTY: the tool exposes adjustment frequency, fully indexed rate and a floor, and
  **DEFAULTS to the six-month agency reset** (`S.armFreq = 6`) because Fannie's current standard plans
  are 3/6, 5/6, 7/6 and 10/6 SOFR. Selecting the 12-month reset relabels the product 5/1 and marks it a
  generic non-agency structure that **cannot determine agency eligibility**. The product name is
  derived (`armPlanName()`), never hard-coded, so the label can never contradict the frequency being
  modelled — an earlier build printed "5/1 ARM" while resetting every six months.
- ALL-CASH PURCHASES ($0 loan) skip program screening, the profile score and the DTI test entirely,
  and report "No mortgage needed — no loan program applies". Never claim a program "may fit" when
  there is no loan.
- The rate build-up starts from the rate the USER entered and applies placeholder adjustments in the
  spirit of loan-level price adjustments — real LLPA matrices are agency-published, revised
  periodically, and differ by lender. Present it as direction and magnitude, never as price.
- CONSUMER-FACING LANGUAGE is deliberately hedged and should stay that way. Use the tool's own
  wording: "Program screening" (not "loan readiness"), "Possible program match (screening only)"
  (not "programs you'd likely fit"), "Estimated borrowing range (not a pre-approval)" (not "max loan
  you'd qualify for"), "may fit — verify with a lender" (not "eligible"), and "not indicated by this
  screening tool" (not "not eligible"). Do not restate these as harder claims in your own prose.
- INPUT HARDENING (do not regress). Money fields parse a strict currency grammar (`parseMoney`):
  optional $, thousands separators, up to two decimals. Scientific notation, letters, multiple decimal
  points and negatives are **REJECTED and held visibly invalid** — never silently reinterpreted. An
  earlier build turned `450000.50` into $45,000,050 and `1e6` into $16. Percentage and numeric fields
  clamp to their declared min/max, and **on blur every visible value is rewritten to exactly the value
  being calculated with**, so a field can never show 999 while the model uses 25. The amortization
  loop runs to exactly `n` months with a $0.01 epsilon.
- CONFORMING LIMITS: the file embeds the FULL official FHFA 2026 county list — 3,226 counties and
  county-equivalents across all 50 states, DC, PR, GU and VI — as `CLL.names` (every recognised
  county), `CLL.above` (the 78 counties above baseline, all four unit counts verbatim) and `CLL.one`
  (the 82 counties where FHFA publishes the ONE-UNIT limit only). Absence from `above`/`one` means
  the county is exactly at the national baseline ($832,750 / $1,066,250 / $1,288,800 / $1,601,750);
  the high-cost ceiling is $1,249,125 1-unit. **Multi-unit values are NEVER derived or interpolated.**
  For a `one`-only county a 2–4 unit question returns UNKNOWN — an earlier build derived San Diego's
  2-unit figure as $1,413,557 when the published value is $1,413,350, and applied a blanket
  $1,249,125 across Hawaii when Maui and Kalawao are $1,299,500. Regenerate from
  `/home/claude/fhfa_limits_2026_full.json` (and `fha_limits_2026_full.json`) when the year rolls;
  `test-mortgage-calculator.js` diffs every embedded row against those files and fails on one
  mismatched dollar. Property type distinguishes 2-, 3- and 4-unit separately, never a single
  "2-4 unit" bucket. UNVERIFIED LIMITS PROPAGATE: `S.cllVerified` is false for an unrecognised or
  blank county and for any `one`-only county asked a multi-unit question. The baseline is still used
  for arithmetic, but every downstream conclusion changes — the screening verdict becomes "Cannot
  screen — loan-limit status unknown", programs read `unknown` rather than pass/fail, and the report
  marks the limit UNVERIFIED. Never state conforming-vs-jumbo as a fact in that case.
- The PDF report is print-based (window.print + @media print), deliberately: no library, no network,
  works offline. Charts are snapshotted in light theme with in-chart text labels suppressed and a
  printed legend substituted, so nothing collides on paper.
- BRAND holds the branding: name, url (opexchangepro.com) and logo. The OpExChange Pro mark is baked
  in as a data URI (white background keyed out, resampled to 804x128), shown top-right of the page as
  a clickable link and in the PDF header + footer. The "Change logo" button swaps it via FileReader,
  and the report always uses whatever BRAND.logo currently holds.
- Do NOT use position:fixed for a per-page print watermark: Chromium then lays the print out against
  the viewport and crops the sheet. Branding must ride in the document flow.
- FHA's rate can screen lower than conventional because FHA barely prices for credit; mandatory MIP
  usually makes the total cost higher. Always compare payments, not rates.
- The rate build-up is derived, never stored: S.rate is always the par anchor the user typed, and
  applyProfileRate switches what the amortization uses. Do not write an adjusted rate back into
  S.rate — that makes it the new par and compounds on every application.
- Results are estimates, not a quote or financial advice.
- The tool is FULLY OFFLINE by design — no network calls, ever. Where data is not embedded it must
  say "unknown" rather than fall back to a number that drives a definitive verdict.

## Regression tests

`/home/claude/test-mortgage-calculator.js` is a runnable Playwright suite (**184 assertions**)
covering every finding from all four QA rounds plus the behaviours that already passed, so fixes
cannot silently regress. It takes about six minutes. Run it after ANY change to the calculator:

```
node /home/claude/test-mortgage-calculator.js [path-to-html]
```

It covers program-selector invariance, AK/HI county FHA limits, the strict money grammar, the
product-specific ARM qualifying rate and every fixed-period>=term combination, conventional hard
gates (97% fixed-only, high-balance, multi-unit second homes), the FHA two-dimensional DTI matrix,
MIP order-independence, all five mandatory-premium override paths, blocker precedence, the ownership
horizon, oversized-extra containment across screen/explain/chart/PDF, per-program rate identification,
unknown-limit propagation, a full row-by-row diff of all 3,226 FHFA and 553 HUD county rows against
the official source files, the appraisal assumption on hypothetical prices, the CSV appraisal and
unknown-limit metadata, holding-period independence from an accelerated payoff, accessibility names,
the live region, 320px overflow, and HTML-injection safety.

**A note on test quality:** a round-3 PDF assertion passed vacuously because `page.evaluate` threw
inside the file's IIFE and the check trivially succeeded. The PDF is now driven by clicking `#pdfBtn`
and reading `#report`, and there is an explicit assertion that the report actually rendered. The C1
invariance test likewise asserts that the displayed payment DOES change, so it cannot pass by
everything being identical. Prefer assertions that can fail.

## Math (already implemented — for answering follow-ups)

- Payment: `M = L·r / (1 − (1+r)^−n)`, `r` = annual rate / 12, `n` = months.
- Each month: `interest = balance · r`; `principal = M − interest + extra`; balance decreases by principal.
- Conventional PMI: `original loan × rate / 12`, charged while `balance / original price > cancel LTV`.
- FHA annual MIP follows **HUD's method (H12), not the live balance**: the AVERAGE OUTSTANDING
  BALANCE of each amortization year taken from the **ORIGINAL** schedule (original rate, original
  P&I), held constant for that whole year. Extra principal therefore does NOT reduce the remitted
  premium, and an ARM uses the original rate and P&I throughout. On the default 3.5%-down scenario
  this gives about $201.49/mo in year one versus the old live-balance figure of $202.51.
  **APPROXIMATION, and the UI says so:** HUD's published worked example applies further intermediate
  rounding steps that are not specified in machine-readable form, so a given month can differ from a
  servicer's figure by a few cents. Do not claim cent-exactness. MI is reported as THREE separately
  labelled figures — `miUpfront`, `miAnnualTotal` and `miCombined` — because "total mortgage
  insurance" that omits the financed UFMIP understates FHA by the whole upfront premium.
- ARM: rate is fixed for the fixed period, then adjusts every `S.armFreq` months (6 by default, 12 for
  the generic plan) by at most the initial cap
  (first adjustment) or periodic cap (later ones), bounded by start ± lifetime cap. At each
  adjustment the payment **recasts**: it is recomputed to amortize the *remaining balance* over the
  *remaining term*. With extra principal the recast payment can fall even while the rate is flat.
- Appraised value vs. purchase price: `S.appraised` is TODAY's market value from the appraisal
  (blank = "not entered", which reproduces the purchase-price-only behaviour exactly). LTV is
  computed against the LESSER of the contract price and the appraised value, as lenders do on a
  purchase: `LTV = price × (1 − down%) / min(price, appraised)`. That flows into PMI/MIP
  determination, the conventional max-LTV screening and the 97/95/85% gates. A low appraisal
  produces an APPRAISAL GAP = `price − appraised`, which the buyer must bring in cash, so it is
  added to cash to close. A high appraisal is shown as instant equity but changes no cost.
  This is NOT the appreciation-driven projected value, which always compounds forward from the
  PURCHASE price — keep the two clearly apart when explaining.
- Cash at closing = down payment + closing costs + appraisal gap + any unfinanced upfront MIP.
- APPRAISAL ON HYPOTHETICAL PRICES (A1). The max-affordable-price binary search prices homes nobody
  has appraised, so the assumption is explicit and user-controlled: `S.apprAtAsk` (default ON) assumes
  every candidate home appraises AT its asking price — no gap, LTV = 100 − down%, identical to the
  pre-appraisal behaviour. Switched OFF, the entered appraisal-to-price RATIO (`apprRatio()`) is
  applied to every candidate price, so each carries a proportional gap: higher LTV, PMI switching on
  earlier, and gap cash added by `cashNeededAt()`. **The assumption is printed in the affordability
  card, its explain panel and the CSV metadata — never quote a max price without it.**
- OWNERSHIP HORIZON (H9) is `S.holdYears` (default 10), a USER INPUT that is INDEPENDENT of loan
  payoff. `build()` extends the row set with ownership-only rows (tax, insurance, HOA, appreciation;
  no P&I) past the payoff month. An all-cash purchase or a lump-sum payoff must never collapse the
  ownership analysis to one synthetic month. `D.n` is the LOAN payoff month; `D.horizonMonths` is how
  long the owner holds — report them separately and never substitute one for the other.
- Total paid over the term = cash at closing + principal + interest + mortgage insurance +
  (tax + insurance + HOA) × months.
- Front-end ratio = housing payment / gross monthly income. Back-end = (housing + other debts) /
  gross monthly income. Max supportable price is a binary search on price against the ratio budget,
  scaling property tax with price and holding insurance and HOA flat.
- Projected home value at month m = price × (1 + appreciation/100)^(m/12); equity = value − balance.
- BREAKEVEN POINT = first month where equity (value − amount still owed) >= total paid to date.
  Tracked twice: with closing costs in the total (the headline) and without (the optimistic edge).
  Always state which one you are quoting — closing costs can move it by years. Distinct from the
  balance point, which compares full home VALUE (not equity) to total paid, and so arrives earlier.
- Max loan = binary-searched max price under the binding ratio × (1 − down%) + financed FHA MIP.
- Total paid to date = cash at closing (down payment + any unfinanced upfront MIP) + the running sum
  of every monthly outflow (P&I + MI + tax + insurance + HOA). "Value − paid" is value minus that.
- The BALANCE POINT is where the value and cost lines CROSS — detected as the first sign change in
  (value − total paid), not the first time value exceeds cost. With any real down payment value
  starts ahead (the bank funded most of the asset), so "first exceeds" fires at month 1 and is
  meaningless. Usually the crossing is cost overtaking value later in the term.
