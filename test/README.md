# Test suite

Playwright-driven regression suite (184 assertions) covering amortization math,
ARM qualification, program screening, loan-limit lookups, input validation,
export reconciliation and accessibility.

```bash
npm install
node test-mortgage-calculator.js
```

The suite expects `../index.html`. Several assertions are mutation-tested — if you
change a computed value, confirm the corresponding assertion actually fails before
trusting a green run. A `page.evaluate` that throws inside the app's IIFE can make
an assertion pass vacuously; this has bitten this codebase twice.
