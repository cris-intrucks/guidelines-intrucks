/**
 * Funciones puras de financiamiento.
 * Importable desde Node vía module.exports.
 */
(function (root) {
  /**
   * Cálculo por porcentaje (PD / TI-NOT) con financiamiento APR 18% anual.
   * Fallbacks: financiamiento_down_pct → 20, financiamiento_cuotas → 9.
   * Retorna null si el avalúo o el porcentaje no son válidos (> 0).
   * Liability / Cargo / Excess NO usan esta función (usan monthly_payment de BD).
   */
  function nvCalcPorcentaje(row, avaluo){
    const APR = 0.18;
    const i = APR / 12; // 0.015

    const a = Number(avaluo);
    const pct = Number(row.porcentaje);
    if(!(a > 0) || !(pct > 0)) return null;

    const downPct = Number(row.financiamiento_down_pct) || 20;
    const cuotasRaw = Number(row.financiamiento_cuotas);
    const cuotas = (cuotasRaw && cuotasRaw > 0) ? cuotasRaw : 9;

    const prima = a * (pct / 100);
    const down = prima * (downPct / 100);
    const P = prima - down;

    // Cuota lineal sin interés (solo para auditoría / comparación)
    const mensualidadLineal = (P > 0 && cuotas > 0) ? (P / cuotas) : 0;

    let mensualidad = 0;
    if(P > 0){
      const factor = Math.pow(1 + i, cuotas);
      mensualidad = P * (i * factor) / (factor - 1);
    }

    if(!Number.isFinite(down) || !Number.isFinite(mensualidad)) return null;

    return {
      avaluo: a,
      pct,
      downPct,
      cuotas,
      apr: APR,
      i,
      primaAnual: prima,
      down,
      financiado: P,
      monthlyLineal: mensualidadLineal,
      monthly: mensualidad
    };
  }

  function toCents(n){
    return Math.round(Number(n) * 100);
  }
  function fromCents(c){
    return c / 100;
  }
  function monthlyRate(aprPct){
    return Number(aprPct) / 100 / 12;
  }
  function requireIntCount(n, label){
    if(!Number.isInteger(n) || n < 0) throw new Error(label || 'count_invalido');
  }

  function expandSchedule(schedule){
    const amounts = [];
    (schedule || []).forEach(function(tr){
      const n = tr.count;
      const a = tr.amount;
      for(let i = 0; i < n; i++) amounts.push(a);
    });
    return amounts;
  }

  function aprFromCashflows(financed, amounts, times){
    const P = Number(financed);
    function pv(i){
      if(!(i > 0)) return amounts.reduce(function(s, a){ return s + a; }, 0);
      let s = 0;
      for(let j = 0; j < amounts.length; j++){
        s += amounts[j] / Math.pow(1 + i, times[j]);
      }
      return s;
    }
    const target = P;
    const sum = amounts.reduce(function(s, a){ return s + a; }, 0);
    if(sum <= target) return 0;
    let lo = 0;
    let hi = 1;
    while(pv(hi) > target) hi *= 2;
    for(let n = 0; n < 80; n++){
      const mid = (lo + hi) / 2;
      if(pv(mid) > target) lo = mid;
      else hi = mid;
    }
    return 12 * ((lo + hi) / 2) * 100;
  }

  function impliedApr(financed, flatPayments, shift){
    const sh = Number(shift);
    const amounts = Array.isArray(flatPayments) && typeof flatPayments[0] === 'number'
      ? flatPayments
      : expandSchedule(flatPayments);
    const times = amounts.map(function(_, k){ return sh + k; });
    return aprFromCashflows(financed, amounts, times);
  }

  function collectionShift(firstPaymentAt){
    return firstPaymentAt === '30days' ? 1 : 0;
  }

  function formulaShift(formula){
    return formula === 'annuity-due' ? 0 : 1;
  }

  function formulaTimes(n, formula){
    const sh = formulaShift(formula);
    const times = [];
    for(let k = 0; k < n; k++) times.push(sh + k);
    return times;
  }

  function assemblePlan(opts, schedule, financedCents, downCents){
    const formula = opts.formula === 'annuity-due' ? 'annuity-due' : 'standard';
    const firstPaymentAt = opts.firstPaymentAt === '30days' ? '30days' : 'binding';
    const aprPct = opts.aprPct == null ? 18 : Number(opts.aprPct);
    const down = fromCents(downCents);
    const financed = fromCents(financedCents);
    const installmentsTotal = fromCents(schedule.reduce(function(s, tr){
      return s + toCents(tr.amount) * tr.count;
    }, 0));
    const financeCost = fromCents(toCents(installmentsTotal) - financedCents);
    const totalPaid = fromCents(downCents + toCents(installmentsTotal));
    const firstAmt = schedule.length ? schedule[0].amount : 0;
    const dueAtBinding = firstPaymentAt === 'binding'
      ? fromCents(downCents + toCents(firstAmt))
      : down;
    const impliedAprPct = impliedApr(financed, schedule, formulaShift(formula));
    const effectiveAprPct = impliedApr(financed, schedule, collectionShift(firstPaymentAt));
    const warnings = [];
    if(effectiveAprPct - aprPct > 0.5){
      warnings.push('effective_apr');
    }
    return {
      down: down,
      financed: financed,
      schedule: schedule,
      installmentsTotal: installmentsTotal,
      financeCost: financeCost,
      totalPaid: totalPaid,
      dueAtBinding: dueAtBinding,
      impliedAprPct: impliedAprPct,
      effectiveAprPct: effectiveAprPct,
      warnings: warnings,
      aprPct: aprPct,
      formula: formula,
      firstPaymentAt: firstPaymentAt
    };
  }

  function resolveDownCents(opts){
    const premiumCents = toCents(opts.totalPremium);
    if(opts.downAmount != null && opts.downAmount !== ''){
      return toCents(opts.downAmount);
    }
    const downPct = Number(opts.downPct);
    return Math.round(premiumCents * downPct / 100);
  }

  function calcLevelPlan(opts){
    opts = opts || {};
    const formula = opts.formula === 'annuity-due' ? 'annuity-due' : 'standard';
    const n = Number(opts.payments);
    requireIntCount(n, 'count_invalido');
    if(n > 24) throw new Error('pagos_max');
    const downCents = resolveDownCents(opts);
    const financedCents = toCents(opts.totalPremium) - downCents;
    const i = monthlyRate(opts.aprPct == null ? 18 : opts.aprPct);
    let pmtCents = 0;
    if(n > 0){
      if(i > 0){
        let raw = financedCents * i / (1 - Math.pow(1 + i, -n));
        if(formula === 'annuity-due') raw = raw / (1 + i);
        pmtCents = Math.round(raw);
      } else {
        pmtCents = Math.round(financedCents / n);
      }
    }
    const schedule = n > 0 ? [{ count: n, amount: fromCents(pmtCents) }] : [];
    return assemblePlan(opts, schedule, financedCents, downCents);
  }

  function calcVariablePlan(opts){
    opts = opts || {};
    const formula = opts.formula === 'annuity-due' ? 'annuity-due' : 'standard';
    const tranches = Array.isArray(opts.tranches) ? opts.tranches : [];
    let autoIdx = -1;
    let totalCount = 0;
    tranches.forEach(function(tr, idx){
      const count = Number(tr.count);
      requireIntCount(count, 'count_invalido');
      totalCount += count;
      if(tr.amount == null){
        if(autoIdx >= 0) throw new Error('tramo_auto');
        autoIdx = idx;
      }
    });
    if(totalCount > 24) throw new Error('pagos_max');
    if(autoIdx < 0) throw new Error('tramo_auto');

    const downCents = resolveDownCents(opts);
    const financedCents = toCents(opts.totalPremium) - downCents;
    const financed = fromCents(financedCents);
    const i = monthlyRate(opts.aprPct == null ? 18 : opts.aprPct);
    const v = 1 / (1 + i);
    const times = formulaTimes(totalCount, formula);

    let cursor = 0;
    const trancheTimes = tranches.map(function(tr){
      const slice = times.slice(cursor, cursor + tr.count);
      cursor += tr.count;
      return slice;
    });

    function sumV(ks){
      return ks.reduce(function(s, k){ return s + Math.pow(v, k); }, 0);
    }

    let knownPv = 0;
    tranches.forEach(function(tr, idx){
      if(idx === autoIdx) return;
      knownPv += Number(tr.amount) * sumV(trancheTimes[idx]);
    });
    const Sauto = sumV(trancheTimes[autoIdx]);
    const aAuto = (financed - knownPv) / Sauto;
    if(!(aAuto > 0) || !Number.isFinite(aAuto)) throw new Error('saldo_excedido');
    const autoCents = Math.round(aAuto * 100);

    const schedule = tranches.map(function(tr, idx){
      const amount = idx === autoIdx ? fromCents(autoCents) : fromCents(toCents(tr.amount));
      return { count: tr.count, amount: amount };
    });
    return assemblePlan(opts, schedule, financedCents, downCents);
  }

  function buildAmortization(plan){
    const i = monthlyRate(plan.aprPct == null ? 18 : plan.aprPct);
    let balance = toCents(plan.financed);
    const rows = [];
    let n = 0;
    (plan.schedule || []).forEach(function(tr){
      for(let k = 0; k < tr.count; k++){
        n++;
        const pay = toCents(tr.amount);
        const interest = Math.round(balance * i);
        const principal = pay - interest;
        balance -= principal;
        rows.push({
          payment: n,
          amount: fromCents(pay),
          interest: fromCents(interest),
          principal: fromCents(principal),
          balance: fromCents(balance)
        });
      }
    });
    return rows;
  }

  root.nvCalcPorcentaje = nvCalcPorcentaje;
  root.calcLevelPlan = calcLevelPlan;
  root.calcVariablePlan = calcVariablePlan;
  root.impliedApr = impliedApr;
  root.buildAmortization = buildAmortization;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      nvCalcPorcentaje,
      calcLevelPlan,
      calcVariablePlan,
      impliedApr,
      buildAmortization
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
