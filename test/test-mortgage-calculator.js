#!/usr/bin/env node
/* Regression tests for mortgage-calculator.html
 *
 *   node test-mortgage-calculator.js [path-to-html]   (defaults to ../index.html)
 *
 * Covers every scenario from the round-1, round-2 and round-3 QA reports — both the findings that
 * were fixed and the behaviours that already passed, so a later change cannot silently undo them.
 * Requires playwright + chromium (npx playwright install chromium).
 */
const path = require('path');

// Resolve a playwright whose bundled browser revision is actually installed. Several copies can be
// present at different versions, and only the one matching /opt/pw-browsers will launch.
function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/node-tools/node_modules/playwright',
    '/home/claude/.npm-global/lib/node_modules/playwright',
    '/home/claude/node_modules/playwright',
  ];
  const errs = [];
  for (const c of candidates) {
    try {
      const pw = require(c);
      if (pw.chromium.executablePath && require('fs').existsSync(pw.chromium.executablePath())) return pw;
      errs.push(`${c}: browser binary missing`);
    } catch (e) { errs.push(`${c}: ${e.message.split('\n')[0]}`); }
  }
  console.error('Could not find a usable playwright install:\n  ' + errs.join('\n  '));
  console.error('\nTry: npx playwright install chromium');
  process.exit(2);
}
const { chromium } = loadPlaywright();

// Everything resolves relative to this file so the suite runs from any checkout.
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const DATA = path.join(__dirname, '..', 'data');
const FILE = 'file://' + HTML;

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  (ok ? pass++ : fail++);
  results.push({ name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail && !ok ? `\n          ${detail}` : ''}`);
}

let browser;
async function scenario(setup) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(FILE);
  await page.waitForTimeout(400);
  if (setup) { await setup(page); await page.waitForTimeout(500); }
  page.errors = errors;
  return page;
}
const txt = (p, sel) => p.textContent(sel);
const norm = s => (s || '').replace(/\s+/g, ' ').trim();

// pull the values that must be invariant across ARM projection settings
async function qualSnapshot(page) {
  return {
    verdict: norm(await txt(page, '#rdyFig')),
    affFig: norm(await txt(page, '#affFig')),
    affSub: norm(await txt(page, '#affSub')),
    meters: norm(await txt(page, '#affMeters')),
    maxLoan: norm(await txt(page, '#affMaxLoan')),
    left: norm(await txt(page, '#affLeft')),
    programs: norm(await txt(page, '#rdyPrograms')),
  };
}

(async () => {
  browser = await chromium.launch();
  console.log('\n=== ROUND 3 ===\n');

  /* ---- 1. ARM qualification invariant across Best / Expected / Worst ---- */
  console.log('1. ARM qualification is invariant to the projection control');
  {
    const page = await scenario(async p => {
      await p.fill('#price', '450000');
      await p.fill('#down', '90000');
      await p.fill('#rate', '6.5');
      await p.fill('#income', '90000');
      await p.fill('#debts', '450');
      await p.click('#typeSeg button[data-v="arm"]');
    });
    const snaps = {};
    for (const scen of ['min', 'indexed', 'max']) {
      const btn = await page.$(`#armScenSeg button[data-v="${scen}"]`);
      if (btn) { await btn.click(); } else { await page.selectOption('#armScen', scen).catch(() => {}); }
      await page.waitForTimeout(500);
      snaps[scen] = await qualSnapshot(page);
    }
    const keys = Object.keys(snaps.max);
    for (const k of keys) {
      const vals = ['min', 'indexed', 'max'].map(s => snaps[s][k]);
      const same = vals.every(v => v === vals[0]);
      check(`   ${k} identical across best/expected/worst`, same,
        same ? '' : `min=${vals[0].slice(0, 70)} | indexed=${vals[1].slice(0, 70)} | max=${vals[2].slice(0, 70)}`);
    }
    check('   no console errors', page.errors.length === 0, page.errors.join('; '));
    await page.close();
  }

  /* ---- 2. FHA limits: real HUD data, compared against the BASE loan ---- */
  console.log('\n2. FHA county limits (HUD ML 2025-23) and the base-loan rule');
  {
    // San Diego 1-unit FHA limit is $1,104,000. $800k at 3.5% down => base loan $772,000 => passes.
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'CA');
      await p.fill('#cllCounty', 'San Diego');
      await p.fill('#price', '800000');
      await p.fill('#down', '28000');       // 3.5%
    });
    const cll = norm(await txt(page, '#cllOut'));
    check('   San Diego FHA limit shown as $1,104,000', cll.includes('$1,104,000'), cll.slice(0, 200));
    const progs = norm(await txt(page, '#rdyPrograms'));
    const fhaFails = /FHA[\s\S]{0,400}?above this county's FHA limit/.test(progs);
    check('   FHA not rejected on loan size (base loan $772,000 < $1,104,000)', !fhaFails,
      progs.slice(0, 300));
    check('   base-loan rule is stated in the UI', cll.includes('base'), cll.slice(0, 200));
    await page.close();
  }
  {
    // A county at the national floor: $541,287. Price 600k / 3.5% down => base 579,000 => over.
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'AL');
      await p.fill('#cllCounty', 'Autauga');
      await p.fill('#price', '600000');
      await p.fill('#down', '21000');
    });
    const cll = norm(await txt(page, '#cllOut'));
    check('   AL Autauga at the national floor $541,287', cll.includes('$541,287'), cll.slice(0, 200));
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('   FHA rejected when the BASE loan exceeds the county limit',
      /above this county's FHA limit/.test(progs), progs.slice(0, 260));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.selectOption('#cllState', 'TX'); });
    const cll = norm(await txt(page, '#cllOut'));
    check('   uncovered state reports the FHA limit as UNKNOWN (never assumes the floor)',
      cll.includes('UNKNOWN'), cll.slice(0, 200));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'CA');
      await p.fill('#cllCounty', 'Los Angeles');
      await p.selectOption('#propType', 'multi2');
    });
    const cll = norm(await txt(page, '#cllOut'));
    check('   LA 2-unit FHA limit uses the published ceiling $1,599,375',
      cll.includes('$1,599,375'), cll.slice(0, 200));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.click('#progSeg button[data-v="fha"]'); });
    check('   upfront MIP defaults to 175 bps', (await page.inputValue('#mipUp')) === '1.75');
    await page.close();
  }
  {
    // >$726,200 base loan, LTV>95, 30yr => 75 bps for the life of the loan
    const page = await scenario(async p => {
      await p.click('#progSeg button[data-v="fha"]');
      await p.fill('#price', '900000');
      await p.fill('#down', '31500');       // 3.5% => base 868,500 (> threshold), LTV 96.5
    });
    check('   MIP matrix: >$726,200 + LTV>95 + 30yr => 0.75%/life',
      (await page.inputValue('#mipAnn')) === '0.75' && (await page.inputValue('#mipDur')) === '99',
      `mipAnn=${await page.inputValue('#mipAnn')} mipDur=${await page.inputValue('#mipDur')}`);
    await page.close();
  }
  {
    // 15-year term, <=726,200, LTV<=90 => 15 bps for 11 years
    const page = await scenario(async p => {
      await p.click('#progSeg button[data-v="fha"]');
      await p.click('#termSeg button[data-v="15"]');
      await p.fill('#down', '45000');       // 10% => LTV 90
    });
    check('   MIP matrix: <=$726,200 + LTV<=90 + 15yr => 0.15%/11yr',
      (await page.inputValue('#mipAnn')) === '0.15' && (await page.inputValue('#mipDur')) === '11',
      `mipAnn=${await page.inputValue('#mipAnn')} mipDur=${await page.inputValue('#mipDur')}`);
    await page.close();
  }

  /* ---- 3. Conventional LTV as a range, conditional results ---- */
  console.log('\n3. Conventional LTV ranges and conditional results');
  {
    const page = await scenario(async p => {
      await p.click('#typeSeg button[data-v="arm"]');
      await p.fill('#down', '13500');       // 3% => 97% LTV
    });
    const progs = norm(await txt(page, '#rdyPrograms'));
    const verdict = norm(await txt(page, '#rdyFig'));
    // Superseded by round-4 H4: an ARM at 97% LTV must FAIL, not merely be conditional.
    check('   97% LTV ARM is not a pass (round-4: it must fail outright)',
      !/\bmay fit\b/i.test(verdict), verdict + ' | ' + progs.slice(0, 200));
    check('   and it says the 97% option is fixed-rate only',
      /fixed-rate only/i.test(progs), progs.slice(0, 260));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#propType', 'multi2');
      await p.fill('#down', '45000');       // 10% => 90% LTV on a duplex
    });
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('   90% LTV primary duplex is conditional, not rejected',
      /conditional/i.test(progs) && !/above every published path/i.test(progs), progs.slice(0, 300));
    check('   and it names both underwriting paths',
      /automated underwriting/i.test(progs) && /manually underwritten/i.test(progs), progs.slice(0, 300));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#occupancy', 'invest');
      await p.fill('#down', '22500');       // 5% => 95% LTV on a 1-unit investment
    });
    const verdict = norm(await txt(page, '#rdyFig'));
    check('   5% down 1-unit investment still fails outright',
      /no standard program/i.test(verdict), verdict);
    await page.close();
  }

  /* ---- 4. Three payment concepts: screen and PDF agree ---- */
  console.log('\n4. The three payment concepts are consistent everywhere');
  {
    const page = await scenario(async p => { await p.fill('#extra', '1000000'); });
    await page.waitForTimeout(1600);
    const hero = norm(await txt(page, '#heroFig'));
    check('   screen hero uses the capped actual first payment (~$362,550)',
      hero.includes('362,550'), hero);
    // The report is built by #pdfBtn into #report. window.print() is stubbed so the click cannot
    // block on a print dialog.
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('#pdfBtn');
    await page.waitForTimeout(400);
    const clean = norm(await page.$eval('#report', el => el.innerText || el.textContent));
    check('   PDF report actually rendered', clean.length > 500, `length=${clean.length}`);
    const mp = clean.match(/(?:Required monthly payment|Month-one payment)\s*(\$[\d,.]+)/);
    check('   PDF monthly payment matches the screen ($362,550-class, not $1,002,875)',
      !!mp && !clean.includes('1,002,875'), `cell=${mp ? mp[1] : 'not found'}`);
    const le = clean.match(/Left each month\s*(−?-?\$[\d,]+)/);
    check('   PDF "left each month" is not the −$990,825 artifact',
      !!le && !/990,825/.test(clean), `cell=${le ? le[1] : 'not found'}`);
    check('   PDF flags the extra as a capped one-time payoff',
      /one-time payoff/i.test(clean), clean.slice(0, 160));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#extra', '500'); });
    const cardLeft = norm(await txt(page, '#affLeft'));
    const cardPlan = norm(await txt(page, '#affLeftPlan'));
    await page.click('[data-explain="left"]');
    await page.waitForTimeout(400);
    const panel = norm(await txt(page, '.xpanel'));
    const m = panel.match(/Remaining after the required payment\s*(\$[\d,]+)/);
    check('   card and its explain panel agree on the required-payment figure',
      !!m && m[1] === cardLeft, `card=${cardLeft} panel=${m ? m[1] : 'not found'}`);
    check('   card also shows the planned-extra figure as a second line',
      /after planned extra principal/i.test(cardPlan), cardPlan);
    check('   the two figures differ by the $500 extra',
      /8,675|after planned extra principal: \$/.test(cardPlan), cardPlan);
    await page.close();
  }

  /* ---- 5. All-cash purchase skips screening entirely ---- */
  console.log('\n5. All-cash purchase runs no program screening');
  {
    const page = await scenario(async p => {
      await p.fill('#cash', '600000');
      await p.fill('#down', '450000');      // 100% down
    });
    const verdict = norm(await txt(page, '#rdyFig'));
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('   verdict says no mortgage needed', /no mortgage needed/i.test(verdict), verdict);
    check('   no program is claimed to "may fit"', !/may fit/i.test(progs), progs.slice(0, 200));
    check('   profile score is not scored', /not scored/i.test(norm(await txt(page, '#rdyScoreH'))));
    check('   payoff shows N/A', norm(await txt(page, '#sPay')) === 'N/A');
    await page.close();
  }

  /* ---- 6. Disclaimer names the AUS limitation ---- */
  console.log('\n6. Section disclaimer is explicit about scope');
  {
    const page = await scenario();
    const note = norm(await txt(page, '.rdy-top-note'));
    check('   says broad possibilities only', /broad\s*possibilities/i.test(note), note.slice(0, 160));
    check('   names the AUS engines it does not model',
      /desktop underwriter|loan product advisor|total scorecard/i.test(note), note.slice(0, 200));
    await page.close();
  }
  {
    const page = await scenario();
    const reqs = [];
    page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) reqs.push(r.url()); });
    await page.reload();
    await page.waitForTimeout(700);
    check('   stays fully offline (no network requests)', reqs.length === 0, reqs.join(', '));
    await page.close();
  }

  /* ================= ROUND 4 ================= */
  console.log('\n=== ROUND 4 ===\n');

  // --- C1: toggling the displayed program never moves either program row or the verdict ---
  console.log('C1. Program selector changes the payment view only');
  {
    const page = await scenario(async p => {
      await p.fill('#price', '450000'); await p.fill('#down', '15750');
      await p.fill('#income', '96000'); await p.fill('#debts', '450');
      await p.selectOption('#cllState', 'NC'); await p.fill('#cllCounty', 'Wake');
    });
    const grab = async () => ({
      verdict: norm(await txt(page, '#rdyFig')),
      rows: await page.$$eval('#rdyPrograms .prog', els => els.map(x =>
        x.querySelector('b').textContent + '|' + x.querySelector('.pr').textContent.trim())),
      hero: norm(await txt(page, '#heroFig')),
    });
    await page.click('#progSeg button[data-v="conv"]'); await page.waitForTimeout(650);
    const A = await grab();
    await page.click('#progSeg button[data-v="fha"]'); await page.waitForTimeout(650);
    const B = await grab();
    check('   program rows identical across Conventional/FHA views',
      JSON.stringify(A.rows) === JSON.stringify(B.rows), `${A.rows.join(',')} vs ${B.rows.join(',')}`);
    check('   headline verdict identical across views', A.verdict === B.verdict, `${A.verdict} vs ${B.verdict}`);
    check('   but the displayed payment DOES change (proves the test is live)', A.hero !== B.hero,
      `both ${A.hero} — the assertion above would be vacuous`);
    check('   no console errors', page.errors.length === 0, page.errors.join('; '));
    await page.close();
  }

  // --- C2: special-exception ceiling is never used as a county limit ---
  console.log('\nC2. AK/HI county FHA limits are real, not the special-exception ceiling');
  for (const [st, county, expect] of [['HI','Honolulu','$828,000'], ['AK','Anchorage','$541,287'],
                                      ['HI','Maui','$1,299,500'], ['CA','San Diego','$1,104,000']]) {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', st); await p.fill('#cllCounty', county);
    });
    const t = norm(await txt(page, '#cllOut'));
    const m = t.match(/FHA limit:\s*(\$[\d,]+|UNKNOWN)/);
    check(`   ${st}/${county} FHA limit = ${expect}`, !!m && m[1] === expect,
      `got ${m ? m[1] : 'not found'}`);
    check(`   ${st}/${county} is not the $1,873,625 ceiling`, !t.includes('1,873,625'), t.slice(0, 120));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'HI'); await p.fill('#cllCounty', 'Honolulu');
      await p.fill('#price', '1200000'); await p.fill('#down', '42000');
      await p.fill('#income', '600000'); await p.fill('#cash', '400000');
    });
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('   Honolulu $1.2M at 3.5% down is rejected on FHA loan size',
      /above this county's FHA limit/i.test(progs), progs.slice(0, 230));
    await page.close();
  }

  // --- C3: strict money grammar ---
  console.log('\nC3. Money fields parse a real currency grammar');
  {
    const cases = [
      ['450000.50', 'price', '450,000.50', false],
      ['$450,000.50', 'price', '450,000.50', false],
      ['11250.75', 'closing', '11,250.75', false],
      ['500.50', 'extra', '500.50', false],
      ['1e6', 'price', null, true],
      ['abc', 'price', null, true],
      ['1.2.3', 'price', null, true],
      ['', 'extra', '0', false],
    ];
    for (const [input, field, expect, shouldReject] of cases) {
      const page = await scenario(async p => {
        await p.fill('#' + field, input);
        await p.dispatchEvent('#' + field, 'blur');
      });
      const visible = await page.inputValue('#' + field);
      const invalid = await page.$eval('#' + field, e => e.getAttribute('aria-invalid'));
      if (shouldReject) {
        check(`   "${input}" is rejected, not reinterpreted`, invalid === 'true',
          `visible=${visible} aria-invalid=${invalid}`);
      } else {
        check(`   "${input}" normalises to ${expect}`, visible === expect && invalid !== 'true',
          `visible=${visible} aria-invalid=${invalid}`);
      }
      await page.close();
    }
  }
  {
    // the specific corruption from the report: 450000.50 must NOT become 45,000,050
    const page = await scenario(async p => {
      await p.fill('#price', '450000.50'); await p.dispatchEvent('#price', 'blur');
    });
    const loan = norm(await txt(page, '#sLoan'));
    check('   $450,000.50 does not become $45,000,050', !loan.includes('45,000,050') && !loan.includes('36,000,040'),
      `loan=${loan}`);
    await page.close();
  }

  // --- H1/H2: ARM qualifying rate follows the product rule ---
  console.log('\nH1/H2. ARM qualifying rate is product-specific');
  {
    const page = await scenario(async p => {
      await p.click('#typeSeg button[data-v="arm"]'); await p.waitForTimeout(300);
      await p.fill('#price', '450000'); await p.fill('#down', '90000');
      await p.fill('#rate', '6.5'); await p.fill('#income', '100000'); await p.fill('#debts', '450');
      await p.fill('#armIndexed', '7.5'); await p.dispatchEvent('#armIndexed', 'input');
    });
    const max = norm(await txt(page, '#heroMax'));
    const stress = (max.split(/Qualification stress payment/)[1] || '');
    // Assert the DOLLAR figure, not the explanatory sentence: the sentence quotes 8.50% either way,
    // so matching it alone would pass even if the tool qualified at the 11.50% lifetime cap.
    const pAt = (L, pct, n) => { const r = pct/100/12; return r === 0 ? L/n : L*r/(1-Math.pow(1+r,-n)); };
    const usd = v => '$' + Math.round(v).toLocaleString('en-US');
    const escrow = 5400/12 + 1800/12;                       // default tax + insurance, no HOA
    const want85 = usd(pAt(360000, 8.5, 360) + escrow);     // correct product rule
    const wrong115 = usd(pAt(360000, 11.5, 360) + escrow);  // the old note-rate + lifetime-cap bug
    check('   5/1 ARM qualifies at max(fully indexed 7.50%, note+initial cap 8.50%) = 8.50%',
      stress.includes(want85) && !stress.includes(wrong115),
      `wanted ${want85}, must not be ${wrong115} — stress section: ` + stress.slice(0, 200));
    check('   the qualification stress payment is named as such',
      /qualification stress payment/i.test(max), max.slice(0, 120));
    check('   the projected peak is named separately',
      /projected peak/i.test(max), max.slice(0, 120));
    await page.close();
  }
  {
    // H2: 10-year fixed period on a 10-year term — no reset can ever occur
    const page = await scenario(async p => {
      await p.click('#typeSeg button[data-v="arm"]'); await p.waitForTimeout(300);
      await p.selectOption('#armFixed', '10');
      await p.click('#termSeg button[data-v="10"]');
      await p.fill('#income', '130000');
    });
    const max = norm(await txt(page, '#heroMax'));
    const verdict = norm(await txt(page, '#rdyFig'));
    // Again the dollar figure, not the prose: the qualifying payment must be the NOTE-rate payment
    // on a 10-year term, never the note rate plus any cap.
    const pAt2 = (L, pct, n) => { const r = pct/100/12; return r === 0 ? L/n : L*r/(1-Math.pow(1+r,-n)); };
    const usd2 = v => '$' + Math.round(v).toLocaleString('en-US');
    const esc2 = 5400/12 + 1800/12;
    const stress2 = (max.split(/Qualification stress payment/)[1] || '');
    check('   10/1 ARM on a 10-year term applies no cap (modelled as fixed)',
      /no reset can ever occur/i.test(max)
      && stress2.includes(usd2(pAt2(360000, 6.5, 120) + esc2))
      && !stress2.includes(usd2(pAt2(360000, 11.5, 120) + esc2)),
      max.slice(0, 260));
    check('   and is not blocked by an impossible stress rate',
      !/blocked/i.test(verdict), verdict);
    await page.close();
  }
  {
    // every fixed-period >= term combination
    const page = await scenario(async p => { await p.click('#typeSeg button[data-v="arm"]'); });
    let allOk = true, detail = '';
    for (const [fixed, term] of [[5,'10'],[7,'10'],[10,'10'],[10,'15'],[3,'10']]) {
      await page.selectOption('#armFixed', String(fixed));
      await page.click(`#termSeg button[data-v="${term}"]`);
      await page.waitForTimeout(450);
      const max = norm(await txt(page, '#heroMax'));
      const shouldBeFixed = fixed >= Number(term);
      const capped = /lifetime cap is reached/.test(max);
      if (shouldBeFixed && capped) { allOk = false; detail += `${fixed}/${term} stressed; `; }
    }
    check('   no fixed-period >= term combination applies a post-maturity cap', allOk, detail);
    await page.close();
  }

  // --- H4: conventional false positives ---
  console.log('\nH4. Conventional hard gates');
  {
    const page = await scenario(async p => {
      await p.click('#typeSeg button[data-v="arm"]'); await p.waitForTimeout(250);
      await p.fill('#down', '13500');   // 97% LTV
    });
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('   97% LTV ARM FAILS (the 97% option is fixed-rate only)',
      /FIXED-RATE ONLY/i.test(progs), progs.slice(0, 260));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'CA'); await p.fill('#cllCounty', 'San Diego');
      await p.fill('#price', '900000'); await p.fill('#down', '27000');   // 3% => high balance
      await p.fill('#income', '400000'); await p.fill('#cash', '200000');
    });
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('   high-balance 97% fixed is NOT eligible for 97% financing',
      /high-balance/i.test(progs) && /NOT eligible for 97%/i.test(progs), progs.slice(0, 300));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#propType', 'multi2');
      await p.selectOption('#occupancy', 'second');
    });
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('   multi-unit second home fails (second homes are one-unit only)',
      /ONE-unit dwellings/i.test(progs), progs.slice(0, 240));
    await page.close();
  }

  // --- H5: FHA front AND back ratios, score-banded ---
  console.log('\nH5. FHA uses a two-dimensional, score-banded DTI matrix');
  {
    const page = await scenario(async p => {
      await p.click('#progSeg button[data-v="fha"]'); await p.waitForTimeout(250);
      await p.selectOption('#cllState', 'CA'); await p.fill('#cllCounty', 'Fresno');
      await p.fill('#price', '450000'); await p.fill('#down', '45000');
      await p.fill('#fico', '550'); await p.dispatchEvent('#fico', 'input');
      await p.fill('#debts', '0'); await p.fill('#income', '85100');
      await p.fill('#cash', '120000');
    });
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('   47.6% front/back at a 550 score is not a clean FHA pass',
      !/FHA[\s\S]{0,60}\bmay fit\b/i.test(norm(await txt(page, '#rdyFig'))) || /manual matrix|not a manual pass|indeterminate/i.test(progs),
      progs.slice(0, 300));
    check('   the manual matrix and the score band are named',
      /MANUAL matrix/i.test(progs) && /500–579|500-579/.test(progs), progs.slice(0, 300));
    await page.close();
  }

  // --- H6: FHA MIP defaults are order-independent ---
  console.log('\nH6. FHA MIP defaults do not depend on click order');
  {
    const readState = async page => ({
      ann: await page.inputValue('#mipAnn'), dur: await page.inputValue('#mipDur'),
      hero: norm(await txt(page, '#heroFig')),
    });
    const a = await scenario(async p => {
      await p.fill('#down', '15750');
      await p.click('#progSeg button[data-v="fha"]'); await p.waitForTimeout(300);
      await p.click('#termSeg button[data-v="15"]');
    });
    const b = await scenario(async p => {
      await p.fill('#down', '15750');
      await p.click('#termSeg button[data-v="15"]'); await p.waitForTimeout(300);
      await p.click('#progSeg button[data-v="fha"]');
    });
    const A = await readState(a), B = await readState(b);
    check('   identical MIP band regardless of order', A.ann === B.ann && A.dur === B.dur,
      `orderA=${A.ann}/${A.dur} orderB=${B.ann}/${B.dur}`);
    check('   identical payment regardless of order', A.hero === B.hero, `${A.hero} vs ${B.hero}`);
    await a.close(); await b.close();
  }

  // --- H7/H8: MI overrides force the custom state ---
  console.log('\nH7/H8. Any mandatory-premium override forces the custom state');
  {
    const cases = [
      ['PMI cancellation raised to 100%', async p => { await p.fill('#down', '15750'); await p.fill('#pmiCut', '100'); await p.dispatchEvent('#pmiCut','input'); }],
      ['PMI rate set to 0',               async p => { await p.fill('#down', '22500'); await p.fill('#pmiRate', '0'); await p.dispatchEvent('#pmiRate','input'); }],
      ['MI = None at high LTV',           async p => { await p.fill('#down', '15750'); await p.click('#miSeg button[data-v="none"]'); }],
      ['FHA upfront MIP set to 0',        async p => { await p.click('#progSeg button[data-v="fha"]'); await p.waitForTimeout(250); await p.fill('#down','15750'); await p.fill('#mipUp','0'); await p.dispatchEvent('#mipUp','input'); }],
      ['FHA annual MIP set to 0',         async p => { await p.click('#progSeg button[data-v="fha"]'); await p.waitForTimeout(250); await p.fill('#down','15750'); await p.fill('#mipAnn','0'); await p.dispatchEvent('#mipAnn','input'); }],
    ];
    for (const [name, setup] of cases) {
      const page = await scenario(setup);
      const verdict = norm(await txt(page, '#rdyFig'));
      const progs = norm(await txt(page, '#rdyPrograms'));
      check(`   ${name} => custom pricing experiment`, /custom pricing experiment/i.test(verdict), verdict);
      check(`   ${name} => no program says "may fit"`, !/\bmay fit\b/i.test(progs), progs.slice(0, 160));
      await page.close();
    }
  }

  // --- H9/H16: all-cash blockers first + holding period ---
  console.log('\nH9/H16. Blockers outrank informational states; ownership horizon is user-set');
  {
    const page = await scenario(async p => { await p.fill('#down', '450000'); await p.fill('#cash', '140000'); });
    const verdict = norm(await txt(page, '#rdyFig'));
    check('   all-cash but short => Blocked, not "no mortgage needed"',
      /blocked/i.test(verdict) && !/no mortgage needed/i.test(verdict), verdict);
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#cash', '600000'); await p.fill('#down', '450000'); });
    const verdict = norm(await txt(page, '#rdyFig'));
    check('   all-cash with enough cash => no mortgage needed', /no mortgage needed/i.test(verdict), verdict);
    const totalSub = norm(await txt(page, '#totalSub'));
    check('   ownership analysis spans the 10-year holding period, not 0.1 years',
      /10\.0 year/.test(totalSub) && !/0\.1 year/.test(totalSub), totalSub.slice(0, 170));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.fill('#cash', '600000'); await p.fill('#down', '450000');
      await p.fill('#holdYears', '20'); await p.dispatchEvent('#holdYears', 'input');
    });
    const totalSub = norm(await txt(page, '#totalSub'));
    check('   changing the holding period changes the ownership horizon',
      /20\.0 year/.test(totalSub), totalSub.slice(0, 170));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#down', '15750'); await p.click('#miSeg button[data-v="none"]'); await p.fill('#income', '0'); });
    check('   custom scenario + zero income => Blocked wins the headline',
      /blocked/i.test(norm(await txt(page, '#rdyFig'))), norm(await txt(page, '#rdyFig')));
    await page.close();
  }

  // --- H10: oversized extra never recurs anywhere ---
  console.log('\nH10. Oversized extra is capped in every renderer');
  {
    const page = await scenario(async p => { await p.fill('#extra', '1000000'); });
    await page.waitForTimeout(1500);
    const hero = norm(await txt(page, '#heroFig'));
    check('   hero shows the capped $362,550', hero.includes('362,550'), hero);
    await page.click('[data-explain="hero"]'); await page.waitForTimeout(400);
    const panel = norm(await txt(page, '.xpanel'));
    check('   explain panel does NOT show $1,002,875', !panel.includes('1,002,875'), panel.slice(0, 200));
    check('   explain panel calls it a one-time payoff', /one-time payoff/i.test(panel), panel.slice(0, 240));
    await page.click('#chartSeg button[data-v="rate"]'); await page.waitForTimeout(600);
    const chart = norm(await txt(page, '#mainLegend')) + norm(await txt(page, '#chSub'));
    check('   payment/rate chart does not show $1,002,275', !/1,002,275/.test(chart), chart.slice(0, 160));
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('#pdfBtn'); await page.waitForTimeout(500);
    const rep = norm(await page.$eval('#report', e => e.innerText || e.textContent));
    check('   PDF renders (guards against a vacuous assertion)', rep.length > 500, `len=${rep.length}`);
    check('   PDF does not print $1,002,875', !rep.includes('1,002,875'), rep.slice(0, 160));
    check('   PDF distinguishes required from planned/month-one',
      /Required monthly payment/i.test(rep) && /Month-one payment/i.test(rep), rep.slice(0, 260));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#extra', '500'); });
    await page.waitForTimeout(900);
    const hero = norm(await txt(page, '#heroFig'));
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('#pdfBtn'); await page.waitForTimeout(500);
    const rep = norm(await page.$eval('#report', e => e.innerText || e.textContent));
    const req = rep.match(/Required monthly payment\s*(\$[\d,.]+)/);
    const plan = rep.match(/Planned monthly payment\s*(\$[\d,.]+)/);
    check('   $500 extra: PDF states required and planned separately', !!req && !!plan,
      `req=${req ? req[1] : 'n/a'} plan=${plan ? plan[1] : 'n/a'}`);
    check('   planned = required + $500', !!req && !!plan &&
      Math.round(Number(plan[1].replace(/[$,]/g,'')) - Number(req[1].replace(/[$,]/g,''))) === 500,
      `req=${req && req[1]} plan=${plan && plan[1]}`);
    check('   screen hero equals the planned figure', !!plan && hero.replace(/\.\d+$/,'').includes(plan[1].replace(/^\$/,'').split('.')[0]),
      `hero=${hero} plan=${plan && plan[1]}`);
    await page.close();
  }

  // --- H11: one rate per program ---
  console.log('\nH11. The applied rate is the selected program\'s rate');
  {
    const page = await scenario(async p => {
      await p.click('#progSeg button[data-v="fha"]'); await p.waitForTimeout(250);
      await p.fill('#down', '90000'); await p.fill('#fico', '620'); await p.dispatchEvent('#fico','input');
      await p.selectOption('#cllState', 'CA'); await p.fill('#cllCounty', 'Fresno');
      await p.check('#applyRate');
    });
    await page.waitForTimeout(600);
    const note = norm(await txt(page, '#applyNote'));
    const fhaRate = (await page.$$eval('#rdyPrograms .prog', els => els.map(x => x.querySelector('.pr').textContent.trim())))[1];
    check('   the apply-rate note quotes the FHA rate, not Conventional\'s',
      !!fhaRate && note.includes(fhaRate.replace('%','')), `note=${note} fhaRow=${fhaRate}`);
    await page.close();
  }

  // --- H12: MI totals ---
  console.log('\nH12. FHA premium totals are reported in full');
  {
    const page = await scenario(async p => {
      await p.click('#progSeg button[data-v="fha"]'); await p.waitForTimeout(250);
      await p.fill('#down', '15750');
      await p.selectOption('#cllState', 'CA'); await p.fill('#cllCounty', 'Fresno');
    });
    const mid = norm(await txt(page, '#sMiD'));
    check('   the MI headline reports upfront + annual separately',
      /upfront/i.test(mid) && /annual/i.test(mid), mid);
    await page.close();
  }

  // --- H13: unknown stays unknown everywhere ---
  console.log('\nH13. Unknown limits stay unknown in every surface');
  {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'CA'); await p.fill('#cllCounty', '');
      await p.fill('#price', '900000'); await p.fill('#down', '180000');
      await p.fill('#income', '400000'); await p.fill('#cash', '250000');
    });
    const progs = norm(await txt(page, '#rdyPrograms'));
    const verdict = norm(await txt(page, '#rdyFig'));
    check('   CA with no county never says "jumbo" in the program row',
      !/\(jumbo\)/i.test(progs), progs.slice(0, 220));
    check('   and the row says the limit is undetermined',
      /undetermined/i.test(progs), progs.slice(0, 240));
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('#pdfBtn'); await page.waitForTimeout(450);
    const rep = norm(await page.$eval('#report', e => e.innerText || e.textContent));
    check('   PDF also reports it as undetermined',
      /Undetermined for this county/i.test(rep), rep.slice(0, 200));
    await page.close();
  }
  {
    // every county/unit result matches the official source
    const fhfa = require(path.join(DATA, 'fhfa_limits_2026_full.json'));
    const page = await scenario();
    let bad = 0, tot = 0, sample = [];
    const picks = [['CA','San Diego',2],['CA','Los Angeles',4],['HI','Maui',1],['HI','Kalawao',1],
                   ['NC','Wake',1],['TX','Harris',3],['WA','King',1],['NY','New York',2],['CO','Pitkin',1]];
    for (const [st, co, u] of picks) {
      await page.selectOption('#cllState', st);
      await page.fill('#cllCounty', co);
      await page.selectOption('#propType', u === 1 ? 'sfr' : 'multi' + u);
      await page.waitForTimeout(220);
      const t = norm(await txt(page, '#cllOut'));
      const shown = (t.match(/^\$[\d,]+/) || [''])[0].replace(/[$,]/g, '');
      const rec = Object.values(fhfa[st]).find(v => v.lookup_key_short === co.toLowerCase());
      const want = rec ? rec[String(u)] : null;
      tot++;
      if (want !== null && want !== undefined && Number(shown) !== want) {
        bad++; sample.push(`${st}/${co} u${u}: shown ${shown} want ${want}`);
      }
    }
    check(`   ${tot} spot-checked county/unit values match the official FHFA rows`, bad === 0, sample.join('; '));
    await page.close();
  }

  // --- H14: sub-620 is not categorical ---
  console.log('\nH14. Sub-620 conventional is AUS/product-dependent');
  {
    const page = await scenario(async p => { await p.fill('#fico', '610'); await p.dispatchEvent('#fico','input'); });
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('   sub-620 is described as AUS/product-dependent, not a flat failure',
      /Desktop Underwriter/i.test(progs) && !/Conventional generally starts at a 620 score/i.test(progs),
      progs.slice(0, 260));
    await page.close();
  }

  // --- H15: ARM plan honesty ---
  console.log('\nH15. ARM plan structure is declared');
  {
    const page = await scenario(async p => { await p.click('#typeSeg button[data-v="arm"]'); });
    const why6 = norm(await txt(page, '#armPlanWhy'));
    check('   the DEFAULT plan is the 6-month agency reset',
      (await page.inputValue('#armFreq')) === '6' && /SOFR/i.test(why6), why6.slice(0, 160));
    check('   and the product is named 5/6, not 5/1',
      /5\/6 ARM/.test(norm(await txt(page, '#armFixedHint'))) &&
      /5\/6 ARM/.test(norm(await txt(page, '#insightTx'))),
      norm(await txt(page, '#armFixedHint')));
    await page.selectOption('#armFreq', '12'); await page.waitForTimeout(500);
    const why = norm(await txt(page, '#armPlanWhy'));
    check('   12-month reset is labelled generic/non-agency',
      /generic, non-agency/i.test(why) && /cannot be determined/i.test(why), why.slice(0, 180));
    check('   and the product renames itself 5/1',
      /5\/1 ARM/.test(norm(await txt(page, '#insightTx'))) &&
      /every 12 months/.test(norm(await txt(page, '#insightTx'))),
      norm(await txt(page, '#insightTx')).slice(0, 120));
    await page.close();
  }

  // --- M-series ---
  console.log('\nM-series');
  {
    const page = await scenario(async p => { await p.fill('#income', '80000'); await p.fill('#debts', '458'); });
    const flags = norm(await txt(page, '#rdyFlags'));
    const m = flags.match(/A (\d+(?:\.\d+)?)% total-debt ratio is above/);
    check('M2 boundary DTI prints enough precision to support the sentence',
      !m || Number(m[1]) > 50, `stated ${m ? m[1] : 'n/a'}%`);
    await page.close();
  }
  {
    const page = await scenario(async p => {
      for (const [f, v] of [['price','0'],['down','0'],['closing','0'],['tax','0'],['ins','0'],['hoa','0']]) await p.fill('#'+f, v);
    });
    await page.waitForTimeout(1200);
    check('M6 a genuinely zero-cost scenario shows $0, not $1',
      !/\$1(\.00)?$/.test(norm(await txt(page, '#heroFig'))), norm(await txt(page, '#heroFig')));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#income', '0'); });
    await page.waitForTimeout(1200);
    check('M5 zero income leaves no stale percentage', norm(await txt(page, '#affFig')) === '—',
      norm(await txt(page, '#affFig')));
    check('M5 profile indicators marked unavailable',
      /unavailable/i.test(norm(await txt(page, '#rdyScoreH'))), norm(await txt(page, '#rdyScoreH')).slice(0, 120));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#rate', '999'); await p.dispatchEvent('#rate','blur'); });
    check('M4 visible rate equals the computed rate', (await page.inputValue('#rate')) === '25',
      await page.inputValue('#rate'));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#appr', '-200'); await p.dispatchEvent('#appr','blur'); });
    check('M4 visible appreciation equals the computed value', (await page.inputValue('#appr')) === '-10',
      await page.inputValue('#appr'));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#down', '999999'); await p.dispatchEvent('#down','blur'); });
    const v = (await page.inputValue('#down')).replace(/,/g, '');
    check('M4 visible down payment is clamped to the price', Number(v) <= 450000, v);
    await page.close();
  }
  {
    const page = await scenario();
    const missing = await page.$$eval(
      'input:not([type=hidden]):not([type=button]), select, [role=button]',
      els => els.filter(e => {
        if (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby')) return false;
        if (e.id && document.querySelector(`label[for="${e.id}"]`)) return false;
        if (e.closest('label')) return false;
        return true;
      }).map(e => e.id || e.tagName + '.' + e.className));
    check('M8 every interactive control has an accessible name', missing.length === 0, missing.join(', '));
    await page.close();
  }
  {
    const page = await scenario();
    const live = await page.$('#liveStatus[aria-live="polite"]');
    check('M9 a polite live region exists', !!live);
    await page.fill('#price', '500000'); await page.waitForTimeout(900);
    const msg = norm(await txt(page, '#liveStatus'));
    check('M9 recalculation emits one concise status', msg.length > 10 && msg.length < 260, msg);
    await page.close();
  }
  {
    const page = await scenario();
    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForTimeout(700);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('M11 no horizontal overflow at 320px', over <= 1, `overflow ${over}px`);
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'NC');
      await p.fill('#cllCounty', '<em>Injected</em>');
    });
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('#pdfBtn'); await page.waitForTimeout(450);
    const injected = await page.$$eval('#report em', e => e.length);
    const cllInjected = await page.$$eval('#cllOut em', e => e.length);
    check('M17 county text is never parsed as HTML', injected === 0 && cllInjected === 0,
      `report em=${injected} cllOut em=${cllInjected}`);
    await page.close();
  }
  {
    const page = await scenario();
    check('M18 the print button is named for what it does',
      /print \/ save pdf/i.test(norm(await txt(page, '#pdfBtn'))), norm(await txt(page, '#pdfBtn')));
    await page.close();
  }

  /* ================= ROUND 1 + 2 REGRESSIONS ================= */
  console.log('\n=== ROUND 1 & 2 REGRESSIONS ===\n');
  {
    const page = await scenario(async p => { await p.fill('#income', '0'); });
    check('zero income => Blocked, not a confident score',
      /blocked/i.test(norm(await txt(page, '#rdyFig'))), norm(await txt(page, '#rdyFig')));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#cash', '1000'); });
    check('insufficient cash to close => Blocked',
      /blocked/i.test(norm(await txt(page, '#rdyFig'))), norm(await txt(page, '#rdyFig')));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#income', '10000'); });
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('FHA has a DTI ceiling (399% DTI is not a fit)', !/FHA[\s\S]{0,80}may fit/i.test(progs),
      progs.slice(0, 200));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#propType', 'manu');
      await p.selectOption('#occupancy', 'invest');
    });
    check('manufactured + investment => no standard program',
      /no standard program/i.test(norm(await txt(page, '#rdyFig'))), norm(await txt(page, '#rdyFig')));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.click('#progSeg button[data-v="fha"]');
      await p.selectOption('#occupancy', 'invest');
    });
    check('FHA + investment occupancy => Blocked and MIP suppressed',
      /blocked/i.test(norm(await txt(page, '#rdyFig'))) && norm(await txt(page, '#sMi')) === '$0',
      `${norm(await txt(page, '#rdyFig'))} / sMi=${norm(await txt(page, '#sMi'))}`);
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.fill('#down', '13500');
      await p.click('#miSeg button[data-v="none"]');
    });
    check('MI "None" at 97% LTV => custom pricing experiment, conclusions suppressed',
      /custom pricing experiment/i.test(norm(await txt(page, '#rdyFig'))), norm(await txt(page, '#rdyFig')));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.click('#progSeg button[data-v="fha"]'); });
    const none = await page.$eval('#miSeg button[data-v="none"]', e => getComputedStyle(e).display);
    check('FHA hides the "None" MI option', none === 'none', none);
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#rate', '999'); await p.dispatchEvent('#rate', 'input'); });
    check('rate clamps to the 25% maximum', /30 yr$/.test(norm(await txt(page, '#sPay'))),
      norm(await txt(page, '#sPay')));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#appr', '-200'); await p.dispatchEvent('#appr', 'input'); });
    check('appreciation clamps to the -10% floor',
      /-10%/.test(norm(await txt(page, '#chSub'))), norm(await txt(page, '#chSub')).slice(0, 90));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#tax', '-1200'); });
    // Round-4 C3 supersedes the round-2 clamp: negatives are now REJECTED, never reinterpreted.
    const taxInvalid = await page.$eval('#tax', e => e.getAttribute('aria-invalid'));
    check('negative currency is rejected, never silently flipped to positive',
      taxInvalid === 'true', `visible=${await page.inputValue('#tax')} aria-invalid=${taxInvalid}`);
    check('   and says so inline', !!(await page.$('.neg-note')));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.fill('#fico', '499'); await p.dispatchEvent('#fico', 'input'); });
    check('credit 499 => Blocked', /blocked/i.test(norm(await txt(page, '#rdyFig'))),
      norm(await txt(page, '#rdyFig')));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.click('#typeSeg button[data-v="arm"]'); });
    check('ARM hero is labelled the INITIAL payment',
      /initial monthly payment/i.test(norm(await txt(page, '#heroLabel'))), norm(await txt(page, '#heroLabel')));
    check('   and names it as the month-one figure (H3: three distinct numbers)',
      /month one/i.test(norm(await txt(page, '#heroLabel'))), norm(await txt(page, '#heroLabel')));
    check('   and the stressed maximum is shown alongside',
      /projected peak/i.test(norm(await txt(page, '#heroMax'))) &&
      /qualification stress payment/i.test(norm(await txt(page, '#heroMax'))),
      norm(await txt(page, '#heroMax')).slice(0, 120));
    await page.close();
  }
  {
    const page = await scenario(async p => { await p.selectOption('#cllState', 'TX'); });
    // Round 4 embeds the full FHFA table, so a state is never unknown — but a BLANK county still is.
    const progs = norm(await txt(page, '#rdyPrograms'));
    check('state with no county => conforming status reported as undetermined',
      /undetermined/i.test(progs) && !/\(jumbo\)/i.test(progs), progs.slice(0, 200));
    await page.close();
  }
  {
    const page = await scenario();
    const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await page.click('#csvBtn');
    const d = await dl;
    let rows = 0;
    if (d) rows = require('fs').readFileSync(await d.path(), 'utf8').trim().split('\n')
      .filter(l => l && !l.startsWith('#')).length - 1;
    check('CSV exports and has exactly 360 rows for a 30-year loan', !!d && rows === 360,
      d ? `rows=${rows}` : 'no download event');
    await page.close();
  }
  {
    const page = await scenario();
    const box = await page.$('[data-explain="loan"]');
    await box.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check('explain triggers are keyboard operable', !!(await page.$('.xpanel')));
    await page.close();
  }
  /* ---- ROUND 4 / FIX 1: the embedded limit tables are the official files, verbatim ---- */
  console.log('\nFIX 1. Embedded county tables vs. the official source files');
  {
    // Parse the CLL / FHA object literals straight out of the HTML and diff every single row
    // against the source JSON. This cannot pass vacuously: a parse failure throws, and a single
    // mismatched county/unit value fails the check.
    const fs = require('fs');
    const src = fs.readFileSync(HTML, 'utf8');
    const iC = src.indexOf('const CLL = {'), iF = src.indexOf('const FHA = {');
    const cllSrc = src.slice(iC, src.lastIndexOf('\n};', iF) + 3);
    const fhaSrc = src.slice(iF, src.indexOf('\n};', src.indexOf('counties: {', iF)) + 3);
    const mod = {};
    // eslint-disable-next-line no-eval
    eval(cllSrc.replace('const CLL', 'mod.CLL') + '\n' + fhaSrc.replace('const FHA', 'mod.FHA'));
    const CLL = mod.CLL, FHAT = mod.FHA;
    const fhfa = require(path.join(DATA, 'fhfa_limits_2026_full.json'));
    const hud  = require(path.join(DATA, 'fha_limits_2026_full.json'));
    const base = fhfa._national.baseline;
    const keyOf = v => v.lookup_key_short;

    let counted = 0, errs = [];
    const srcStates = Object.keys(fhfa).filter(k => k[0] !== '_');
    check(`   CLL covers all ${srcStates.length} FHFA jurisdictions`,
      srcStates.every(s => !!CLL.names[s]) && Object.keys(CLL.names).length === srcStates.length,
      `${Object.keys(CLL.names).length} embedded`);
    for (const st of srcStates) {
      const names = new Set(CLL.names[st].split('|'));
      const above = CLL.above[st] || {}, one = CLL.one[st] || {};
      for (const rec of Object.values(fhfa[st])) {
        const k = keyOf(rec); counted++;
        if (!names.has(k)) { errs.push(`${st}/${k} missing from names`); continue; }
        const vals = [rec['1'], rec['2'], rec['3'], rec['4']];
        const nulls = vals.slice(1).some(v => v === null);
        if (nulls) {
          if (one[k] !== vals[0]) errs.push(`${st}/${k} one-unit ${one[k]} != ${vals[0]}`);
          if (above[k]) errs.push(`${st}/${k} multi-unit values invented`);
        } else if (vals.every((v, n) => v === base[String(n + 1)])) {
          if (above[k] || one[k] !== undefined) errs.push(`${st}/${k} should be plain baseline`);
        } else if (JSON.stringify(above[k]) !== JSON.stringify(vals)) {
          errs.push(`${st}/${k} ${JSON.stringify(above[k])} != ${JSON.stringify(vals)}`);
        }
      }
    }
    check(`   all ${counted} FHFA county rows match the official file exactly`,
      counted === 3226 && errs.length === 0, errs.slice(0, 5).join('; ') + ` (${errs.length} errors)`);

    let fCount = 0; const fErrs = [];
    const hudStates = Object.keys(hud).filter(k => k[0] !== '_');
    check('   FHA table carries exactly the 11 HUD states + DC, nothing invented',
      JSON.stringify(Object.keys(FHAT.counties).sort()) === JSON.stringify(hudStates.sort()),
      Object.keys(FHAT.counties).sort().join(','));
    for (const st of hudStates) {
      const tbl = FHAT.counties[st] || {};
      for (const rec of Object.values(hud[st])) {
        const k = keyOf(rec); fCount++;
        const want = [rec['1'], rec['2'], rec['3'], rec['4']];
        if (JSON.stringify(tbl[k]) !== JSON.stringify(want)) fErrs.push(`${st}/${k}`);
      }
      for (const k of Object.keys(tbl)) if (!Object.values(hud[st]).some(r => keyOf(r) === k)) fErrs.push(`${st}/${k} extra`);
    }
    check(`   all ${fCount} HUD FHA county rows match the official file exactly`,
      fCount === 553 && fErrs.length === 0, fErrs.slice(0, 5).join('; ') + ` (${fErrs.length} errors)`);
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'CA'); await p.fill('#cllCounty', 'San Diego');
      await p.selectOption('#propType', 'multi2');
    });
    const t = norm(await txt(page, '#cllOut'));
    check('   San Diego 2-unit conforming is exactly $1,413,350',
      t.startsWith('$1,413,350'), t.slice(0, 90));
    check('   and is not the old derived $1,413,557', !t.includes('1,413,557'), t.slice(0, 90));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'HI'); await p.fill('#cllCounty', 'Maui');
    });
    const t = norm(await txt(page, '#cllOut'));
    check('   Maui 1-unit conforming is $1,299,500, not the blanket $1,249,125',
      t.startsWith('$1,299,500'), t.slice(0, 90));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'NY'); await p.fill('#cllCounty', 'New York');
      await p.selectOption('#propType', 'multi2');
    });
    const t = norm(await txt(page, '#cllOut'));
    check('   a one-unit-only FHFA county suppresses the 2-unit conclusion',
      /Unknown/.test(t) && /not published|not derivable/i.test(t), t.slice(0, 160));
    await page.close();
  }
  {
    const page = await scenario(async p => {
      await p.selectOption('#cllState', 'NC'); await p.fill('#cllCounty', 'Wake');
    });
    const t = norm(await txt(page, '#cllOut'));
    check('   an FHA-uncovered state reports the FHA limit UNKNOWN, never the floor',
      /FHA limit: UNKNOWN/.test(t) && !/FHA limit: \$541,287/.test(t), t.slice(-260));
    check('   and the conforming limit is still known there',
      t.startsWith('$832,750'), t.slice(0, 60));
    await page.close();
  }
  {
    const page = await scenario();
    check('default scenario screens as a fit',
      /may fit/i.test(norm(await txt(page, '#rdyFig'))), norm(await txt(page, '#rdyFig')));
    check('   with no console errors', page.errors.length === 0, page.errors.join('; '));
    await page.close();
  }

  /* ---- Appraised / market value vs. purchase price ---- */
  console.log('\nAPPRAISED VALUE vs PURCHASE PRICE');
  {
    // (a) blank appraised value — every figure must be exactly what it was before the field existed
    const page = await scenario();
    const loanD = norm(await txt(page, '#sLoanD'));
    check('   blank appraised: LTV is still 80.0% on the default scenario',
      loanD === '$90,000 down · 80.0% LTV', loanD);
    check('   blank appraised: cash to close unchanged at $101,250',
      norm(await txt(page, '#affCash')) === '$101,250', norm(await txt(page, '#affCash')));
    check('   blank appraised: no mortgage insurance at 20% down',
      /Not required at 20/.test(norm(await txt(page, '#sMiD'))), norm(await txt(page, '#sMiD')));
    check('   blank appraised: the comparison stat is hidden',
      (await page.isVisible('#apprCmp')) === false, 'apprCmp visible with no appraisal entered');
    check('   blank appraised: the input starts empty',
      (await page.inputValue('#appraised')) === '', await page.inputValue('#appraised'));
    check('   no console errors', page.errors.length === 0, page.errors.join('; '));
    await page.close();
  }
  {
    // (b) appraised ABOVE price — instant equity, LTV still on the (lower) purchase price
    const page = await scenario(async p => { await p.fill('#appraised', '470000'); });
    const cmp = norm(await txt(page, '#apprCmp'));
    check('   appraised above price: reports buying below market with instant equity',
      /Buying \$20,000 below market \(4\.4% instant equity\)/.test(cmp), cmp.slice(0, 160));
    check('   appraised above price: LTV still uses the $450,000 purchase price',
      norm(await txt(page, '#sLoanD')) === '$90,000 down · 80.0% LTV', norm(await txt(page, '#sLoanD')));
    check('   appraised above price: cash to close unchanged at $101,250',
      norm(await txt(page, '#affCash')) === '$101,250', norm(await txt(page, '#affCash')));
    check('   no console errors', page.errors.length === 0, page.errors.join('; '));
    await page.close();
  }
  {
    // (c) appraised BELOW price — LTV on the appraisal, PMI switches on, gap added to cash
    const page = await scenario(async p => { await p.fill('#appraised', '430000'); });
    const cmp = norm(await txt(page, '#apprCmp'));
    check('   appraised below price: warns about the $20,000 appraisal gap',
      /Paying \$20,000 above appraised value/.test(cmp) && /appraisal gap in cash/.test(cmp), cmp.slice(0, 220));
    check('   appraised below price: LTV computed on $430,000 => 83.7%',
      norm(await txt(page, '#sLoanD')) === '$90,000 down · 83.7% LTV', norm(await txt(page, '#sLoanD')));
    check('   appraised below price: PMI is now required at 20% down',
      /PMI/.test(norm(await txt(page, '#sMiD'))) && norm(await txt(page, '#sMi')) !== '$0',
      norm(await txt(page, '#sMi')) + ' / ' + norm(await txt(page, '#sMiD')));
    check('   appraised below price: cash to close includes the gap ($101,250 + $20,000)',
      norm(await txt(page, '#affCash')) === '$121,250', norm(await txt(page, '#affCash')));
    // the explain panel must open on the comparison stat and show the arithmetic
    await page.click('#apprCmp');
    await page.waitForTimeout(300);
    const x = norm(await txt(page, '.xpanel'));
    check('   explain panel opens on the comparison stat',
      /Appraised value vs\. purchase price/.test(x), x.slice(0, 120));
    check('   explain panel shows price, appraised value, LTV basis and the extra cash',
      /Purchase price\$450,000/.test(x) && /\$430,000 \(the appraised value\)/.test(x)
      && /Extra cash required \(appraisal gap\)\+ \$20,000/.test(x) && /Resulting LTV83\.7%/.test(x),
      x.slice(0, 400));
    check('   no console errors', page.errors.length === 0, page.errors.join('; '));
    await page.close();
  }
  {
    // (d) clearing the field returns the scenario exactly to its pre-appraisal state
    const page = await scenario(async p => { await p.fill('#appraised', '430000'); await p.waitForTimeout(300); await p.fill('#appraised', ''); });
    check('   clearing the appraised value restores the original LTV and cash',
      norm(await txt(page, '#sLoanD')) === '$90,000 down · 80.0% LTV'
      && norm(await txt(page, '#affCash')) === '$101,250',
      norm(await txt(page, '#sLoanD')) + ' / ' + norm(await txt(page, '#affCash')));
    await page.close();
  }

  /* ---- H9: the holding period is independent of an ACCELERATED payoff, not just all-cash ---- */
  {
    const page = await scenario(async p => { await p.fill('#extra', '1000000'); });
    await page.waitForTimeout(900);
    const totalSub = norm(await txt(page, '#totalSub'));
    const summary = norm(await txt(page, '#sum-total'));
    check('   a one-month payoff still reports the 10-year ownership horizon',
      /10\.0 year/.test(totalSub) && /10\.0 yrs of ownership/.test(summary),
      totalSub.slice(0, 200) + ' || ' + summary.slice(0, 120));
    await page.close();
  }
  {
    // and the horizon follows the input, not the payoff month
    const page = await scenario(async p => {
      await p.fill('#extra', '1000000'); await p.waitForTimeout(300);
      await p.fill('#holdYears', '25'); await p.dispatchEvent('#holdYears', 'input');
    });
    await page.waitForTimeout(700);
    check('   and it follows the holding-period input, not the payoff month',
      /25\.0 year/.test(norm(await txt(page, '#totalSub'))), norm(await txt(page, '#totalSub')).slice(0, 200));
    await page.close();
  }

  /* ---- H12: the MIP approximation is disclosed where the figure is explained ---- */
  {
    const page = await scenario(async p => {
      await p.click('#progSeg button[data-v="fha"]'); await p.waitForTimeout(300);
      await p.fill('#down', '15750');
    });
    await page.click('[data-explain="mi"]'); await page.waitForTimeout(400);
    const x = norm(await txt(page, '.xpanel'));
    check('H12 the FHA MIP explain panel discloses the average-balance method and its approximation',
      /AVERAGE outstanding balance/.test(x) && /APPROXIMATION/.test(x) && /original schedule/i.test(x),
      x.slice(-320));
    await page.close();
  }

  /* ---- A1: the max-affordable-price search states, and applies, an appraisal assumption ---- */
  console.log('\nA1. Appraisal assumption on hypothetical prices');
  {
    // dollars out of "$553K home at 20.0% down · needs $121,874 cash"
    const priceOf = t => { const m = t.match(/\$([\d.]+)K/); return m ? Number(m[1]) * 1000 : NaN; };
    const cashOf  = t => { const m = t.match(/needs \$([\d,]+) cash/); return m ? Number(m[1].replace(/,/g, '')) : NaN; };

    const base = await scenario();
    const baseD = norm(await txt(base, '#affMaxLoanD'));
    const baseNote = norm(await txt(base, '#affNoteTx'));
    check('   the assumption is stated in the affordability card',
      /assume every home appraises at its asking price/i.test(baseNote), baseNote.slice(0, 200));
    check('   the toggle defaults to ON', await base.isChecked('#apprAtAsk'), 'apprAtAsk unchecked by default');
    await base.close();

    // 10% low appraisal, toggle left ON => the search is unaffected (same as no appraisal at all)
    const on = await scenario(async p => { await p.fill('#appraised', '405000'); });
    const onD = norm(await txt(on, '#affMaxLoanD'));
    check('   ON: a low appraisal does not move the max-price search', onD === baseD, `${onD} vs ${baseD}`);
    await on.close();

    // same inputs, toggle OFF => 90% of asking is applied to every candidate price
    const off = await scenario(async p => {
      await p.fill('#appraised', '405000'); await p.waitForTimeout(300);
      await p.uncheck('#apprAtAsk');
    });
    const offD = norm(await txt(off, '#affMaxLoanD'));
    const offNote = norm(await txt(off, '#affNoteTx'));
    check('   OFF: the max price the guidelines support drops',
      priceOf(offD) > 0 && priceOf(offD) < priceOf(baseD), `${offD} vs ${baseD}`);
    check('   OFF: the cash figure carries the proportional appraisal gap',
      cashOf(offD) > cashOf(baseD), `${cashOf(offD)} vs ${cashOf(baseD)}`);
    check('   OFF: the stated assumption changes to the entered ratio',
      /appraisals are assumed to come in at 90\.0% of asking/i.test(offNote), offNote.slice(0, 260));
    check('   no console errors', off.errors.length === 0, off.errors.join('; '));
    await off.close();
  }

  /* ---- A2: the CSV carries the appraisal and the unknown-limit state ---- */
  console.log('\nA2 / F. CSV metadata');
  {
    const page = await scenario(async p => { await p.fill('#appraised', '430000'); });
    const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await page.click('#csvBtn');
    const d = await dl;
    const text = d ? require('fs').readFileSync(await d.path(), 'utf8') : '';
    check('   CSV metadata carries the appraised value, LTV basis and appraisal gap',
      /# Appraised \/ market value,430000\.00/.test(text) &&
      /# LTV basis \(lesser of price and appraised value\),430000\.00/.test(text) &&
      /# Appraisal gap paid in cash,20000\.00/.test(text),
      text.split('\n').filter(l => l.startsWith('#')).join(' | ').slice(0, 400));
    check('   CSV carries the per-row LTV against that basis',
      /LTVagainstLtvBasis/.test(text.split('\n').find(l => l.startsWith('Month,')) || ''),
      (text.split('\n').find(l => l.startsWith('Month,')) || '').slice(0, 200));
    check('   CSV states the max-price appraisal assumption',
      /# Max-price search appraisal assumption,hypothetical homes appraise at asking/.test(text),
      (text.match(/# Max-price.*/) || [''])[0]);
    await page.close();
  }
  {
    // F / H13: a state with no county must read UNKNOWN in the CSV too, never a jumbo verdict
    const page = await scenario(async p => { await p.selectOption('#cllState', 'CA'); await p.fill('#price', '900000'); });
    const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await page.click('#csvBtn');
    const d = await dl;
    const text = d ? require('fs').readFileSync(await d.path(), 'utf8') : '';
    check('   unknown county => CSV reports the conforming limit and status as UNKNOWN',
      /# Conforming loan limit,UNKNOWN/.test(text) && /# Conforming\/jumbo status,UNKNOWN/.test(text),
      text.split('\n').filter(l => /Conforming/.test(l)).join(' | '));
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}\n`);
  if (fail) {
    console.log('Failures:');
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}\n      ${r.detail}`));
  }
  process.exit(fail ? 1 : 0);
})();
