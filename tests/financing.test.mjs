import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  calcLevelPlan,
  calcVariablePlan,
  impliedApr,
  buildAmortization
} = require('../financing.js');

const TOL = 0.05;
const PREMIUM = 75776.00;
let failed = 0;

function eq(a, b) {
  return Math.abs(Number(a) - Number(b)) <= TOL;
}

function check(id, ok, detail) {
  if (ok) console.log('PASS ' + id);
  else {
    failed++;
    console.log('FAIL ' + id + (detail ? ' — ' + detail : ''));
  }
}

function base(extra) {
  return Object.assign({
    totalPremium: PREMIUM,
    aprPct: 18,
    formula: 'standard',
    firstPaymentAt: 'binding'
  }, extra);
}

function assertPlan(id, plan, exp) {
  const parts = [];
  if (!plan) {
    check(id, false, 'null');
    return;
  }
  if (!eq(plan.down, exp.down)) parts.push('down ' + plan.down + '≠' + exp.down);
  if (!eq(plan.financed, exp.financed)) parts.push('financed ' + plan.financed + '≠' + exp.financed);
  if (exp.schedule) {
    if (!plan.schedule || plan.schedule.length !== exp.schedule.length) {
      parts.push('schedule len');
    } else {
      exp.schedule.forEach(function (tr, i) {
        const got = plan.schedule[i];
        if (got.count !== tr.count || !eq(got.amount, tr.amount)) {
          parts.push('sched[' + i + '] ' + got.count + 'x' + got.amount);
        }
      });
    }
  }
  if (exp.financeCost != null && !eq(plan.financeCost, exp.financeCost)) {
    parts.push('financeCost ' + plan.financeCost + '≠' + exp.financeCost);
  }
  if (exp.dueAtBinding != null && !eq(plan.dueAtBinding, exp.dueAtBinding)) {
    parts.push('dueAtBinding ' + plan.dueAtBinding + '≠' + exp.dueAtBinding);
  }
  check(id, parts.length === 0, parts.join('; '));
}

// A: 25%, 10, standard, binding
const planA = calcLevelPlan(base({ downPct: 25, payments: 10, formula: 'standard', firstPaymentAt: 'binding' }));
assertPlan('A', planA, {
  down: 18944.00,
  financed: 56832.00,
  schedule: [{ count: 10, amount: 6162.53 }],
  financeCost: 4793.30,
  dueAtBinding: 25106.53
});

// B: igual, 30days → dueAtBinding = down
const planB = calcLevelPlan(base({ downPct: 25, payments: 10, formula: 'standard', firstPaymentAt: '30days' }));
assertPlan('B', planB, {
  down: 18944.00,
  financed: 56832.00,
  schedule: [{ count: 10, amount: 6162.53 }],
  financeCost: 4793.30,
  dueAtBinding: 18944.00
});

// C: 20%, 10, standard, binding
const planC = calcLevelPlan(base({ downPct: 20, payments: 10, formula: 'standard', firstPaymentAt: 'binding' }));
assertPlan('C', planC, {
  down: 15155.20,
  financed: 60620.80,
  schedule: [{ count: 10, amount: 6573.37 }],
  financeCost: 5112.90,
  dueAtBinding: 21728.57
});

// D: 25%, 10, annuity-due, binding
const planD = calcLevelPlan(base({ downPct: 25, payments: 10, formula: 'annuity-due', firstPaymentAt: 'binding' }));
assertPlan('D', planD, {
  down: 18944.00,
  financed: 56832.00,
  schedule: [{ count: 10, amount: 6071.46 }],
  financeCost: 3882.60,
  dueAtBinding: 25015.46
});

// E: 20%, 10, annuity-due, binding
const planE = calcLevelPlan(base({ downPct: 20, payments: 10, formula: 'annuity-due', firstPaymentAt: 'binding' }));
assertPlan('E', planE, {
  down: 15155.20,
  financed: 60620.80,
  schedule: [{ count: 10, amount: 6476.22 }],
  financeCost: 4141.40,
  dueAtBinding: 21631.42
});

// F: 25%, standard, binding, [3×8000 · 7×auto]
const planF = calcVariablePlan(base({
  downPct: 25,
  formula: 'standard',
  firstPaymentAt: 'binding',
  tranches: [{ count: 3, amount: 8000 }, { count: 7, amount: null }]
}));
assertPlan('F', planF, {
  down: 18944.00,
  financed: 56832.00,
  schedule: [{ count: 3, amount: 8000.00 }, { count: 7, amount: 5314.50 }],
  financeCost: 4369.50,
  dueAtBinding: 26944.00
});

// G: 25%, standard, binding, [2×10000 · 4×auto · 4×4000]
const planG = calcVariablePlan(base({
  downPct: 25,
  formula: 'standard',
  firstPaymentAt: 'binding',
  tranches: [
    { count: 2, amount: 10000 },
    { count: 4, amount: null },
    { count: 4, amount: 4000 }
  ]
}));
assertPlan('G', planG, {
  down: 18944.00,
  financed: 56832.00,
  schedule: [
    { count: 2, amount: 10000 },
    { count: 4, amount: 6193.88 },
    { count: 4, amount: 4000 }
  ],
  financeCost: 3943.52,
  dueAtBinding: 28944.00
});

check('A-effectiveApr', eq(planA.effectiveAprPct, 22.16) && planA.warnings.length > 0,
  'apr=' + planA.effectiveAprPct + ' warnings=' + planA.warnings.length);
check('B-effectiveApr', eq(planB.effectiveAprPct, 18.00) && planB.warnings.length === 0,
  'apr=' + planB.effectiveAprPct + ' warnings=' + planB.warnings.length);

check('F-impliedApr', eq(planF.impliedAprPct, 18.0), 'implied=' + planF.impliedAprPct);
check('G-impliedApr', eq(planG.impliedAprPct, 18.0), 'implied=' + planG.impliedAprPct);

const amortA = buildAmortization(planA);
const row1 = amortA[0];
check('A-amort1', row1
  && row1.payment === 1
  && eq(row1.interest, 852.48)
  && eq(row1.principal, 5310.05)
  && eq(row1.balance, 51521.95),
  row1 ? JSON.stringify(row1) : 'null');

let excessErr = '';
try {
  calcVariablePlan(base({
    downPct: 25,
    tranches: [{ count: 3, amount: 30000 }, { count: 7, amount: null }]
  }));
} catch (e) {
  excessErr = String(e && e.message || e);
}
check('excess-balance', /saldo_excedido/.test(excessErr), excessErr);

check('impliedApr-fn', eq(impliedApr(planA.financed, planA.schedule, 1), 18.0),
  String(impliedApr(planA.financed, planA.schedule, 1)));

if (failed) {
  console.log(failed + ' failed');
  process.exit(1);
}
console.log('14 passed');
