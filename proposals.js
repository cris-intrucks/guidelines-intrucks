/* Propuestas — v1 sin persistencia. Extrae APP QUOTE vía Edge Function y arma PDF. */
(function () {
  const PROP_LANG = 'en';
  const MAX_PDF_BYTES = 3_500_000;
  const EXTRACT_FN = 'extract-app-quote';

  const PROPOSAL_COPY = {
    en: {
      docTitle: 'Insurance Proposal',
      brand: 'InTrucks Corp',
      confidential: 'Confidential. Prepared solely for the named applicant.',
      preparedBy: 'Prepared by',
      quoteDate: 'Date',
      applicant: 'Applicant',
      legalName: 'Legal name',
      dba: 'DBA',
      dotNumber: 'USDOT',
      mcNumber: 'MC',
      street: 'Address',
      city: 'City',
      state: 'State',
      zip: 'ZIP',
      yearsInBusiness: 'Years in business',
      entityType: 'Entity type',
      phone: 'Phone',
      email: 'Email',
      operationType: 'Operation',
      radius: 'Radius',
      commodities: 'Commodities hauled',
      commodity: 'Commodity',
      percent: 'Percent',
      requestedCoverage: 'Requested coverage',
      line: 'Line',
      requested: 'Requested',
      limit: 'Limit',
      deductible: 'Deductible',
      yes: 'Yes',
      no: 'No',
      drivers: 'Drivers',
      driverName: 'Name',
      status: 'Status',
      cdlClass: 'CDL class',
      licenseState: 'License state',
      vehicles: 'Power units',
      trailers: 'Trailers',
      year: 'Year',
      make: 'Make',
      model: 'Model',
      vin: 'VIN',
      statedValue: 'Stated value',
      gvw: 'GVW',
      unitType: 'Type',
      trailerType: 'Type',
      premiums: 'Quoted premiums',
      autoLiability: 'Auto liability',
      physicalDamage: 'Physical damage',
      motorTruckCargo: 'Motor truck cargo',
      generalLiability: 'General liability',
      trailerInterchange: 'Trailer interchange',
      other: 'Other',
      downPayment: 'Down payment',
      paymentPlan: 'Payment plan',
      notes: 'Notes',
      missing: 'To be confirmed',
      empty: '—',
      notABinder:
        'This document is a proposal only. It is not a binder, policy, or confirmation of coverage. All terms are subject to underwriting review, eligibility, and issuance of a policy by the market. Premiums shown are estimates provided by the producing agent and may change.',
      footer: 'InTrucks Corp · For the named applicant · Not a binder of insurance',
    },
  };

  const APPLICANT_FIELDS = [
    ['legalName', 'Razón social'],
    ['dba', 'DBA'],
    ['dotNumber', 'USDOT'],
    ['mcNumber', 'MC'],
    ['street', 'Dirección'],
    ['city', 'Ciudad'],
    ['state', 'Estado'],
    ['zip', 'ZIP'],
    ['yearsInBusiness', 'Años en el negocio'],
    ['entityType', 'Tipo de entidad'],
    ['phone', 'Teléfono del asegurado'],
    ['email', 'Email del asegurado'],
    ['operationType', 'Tipo de operación'],
    ['radius', 'Radio de operación'],
  ];

  const PREMIUM_FIELDS = [
    ['autoLiability', 'Auto liability'],
    ['physicalDamage', 'Physical damage'],
    ['motorTruckCargo', 'Motor truck cargo'],
    ['generalLiability', 'General liability'],
    ['trailerInterchange', 'Trailer interchange'],
    ['other', 'Otra prima'],
    ['downPayment', 'Down payment'],
    ['paymentPlan', 'Plan de pago'],
  ];

  const ERROR_COPY = {
    unauthorized: 'Tu sesión expiró. Cierra sesión y vuelve a entrar.',
    invalid_pdf: 'El archivo no es un PDF válido.',
    too_large: 'El PDF supera 3.5 MB. Reduce el archivo e inténtalo de nuevo.',
    not_app_quote: 'El PDF no parece un APP QUOTE de InTrucks. Sube el formato Application Information / Commodities / Coverage / Drivers / Vehicles / Trailers.',
    missing_gemini_key: 'Falta configurar GEMINI_API_KEY en la Edge Function. Avisa a tu líder.',
    model_unavailable: 'El modelo de extracción no está disponible. Avisa a tu líder.',
    forbidden: 'Tu correo no está autorizado para extraer APP QUOTE.',
    busy: 'El extractor está ocupado. Espera un minuto e inténtalo de nuevo.',
    extract_failed: 'No se pudieron leer los datos del PDF. Revisa el archivo o captura los datos a mano.',
    extraction_invalid: 'La extracción no trajo un JSON válido. Revisa el APP QUOTE o captura los datos a mano.',
    method_not_allowed: 'No se pudo llamar al extractor. Recarga la página.',
  };

  let propFile = null;
  let propBusy = false;

  function copy() {
    return PROPOSAL_COPY[PROP_LANG] || PROPOSAL_COPY.en;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setHidden(el, hide) {
    if (!el) return;
    el.hidden = hide;
    el.style.display = hide ? 'none' : '';
  }

  function isEmptyVal(v) {
    return v == null || String(v).trim() === '';
  }

  function markField(el, empty) {
    if (!el) return;
    el.classList.toggle('prop-missing', !!empty);
  }

  function bindMark(el) {
    if (!el || el.dataset.propBound) return;
    el.dataset.propBound = '1';
    el.addEventListener('input', function () {
      markField(el, isEmptyVal(el.type === 'checkbox' ? '' : el.value) && el.type !== 'checkbox');
    });
  }

  function emptyApplicant() {
    const o = {};
    APPLICANT_FIELDS.forEach(function (pair) { o[pair[0]] = null; });
    return o;
  }

  function setStep(n) {
    [1, 2, 3].forEach(function (i) {
      const btn = document.querySelector('.prop-step[data-step="' + i + '"]');
      if (btn) btn.classList.toggle('active', i === n);
      if (btn) btn.classList.toggle('done', i < n);
    });
    setHidden($('propStepUpload'), n !== 1);
    setHidden($('propStepReview'), n !== 2);
    setHidden($('propStepPremiums'), n !== 3);
    const status = $('propExtractStatus');
    if (status && n !== 1) status.innerHTML = '';
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const s = String(reader.result || '');
        const i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  function showExtractStatus(kind, msgHtml) {
    const box = $('propExtractStatus');
    if (!box) return;
    if (kind === 'loader') {
      box.innerHTML = loaderHtml(msgHtml);
      return;
    }
    box.innerHTML = emptyStateHtml(kind, msgHtml);
  }

  async function readFnError(error) {
    let status = 0;
    let code = 'extract_failed';
    try {
      if (error && error.context) {
        status = Number(error.context.status) || 0;
        if (typeof error.context.json === 'function') {
          const body = await error.context.json();
          if (body && typeof body.error === 'string') code = body.error;
        }
      }
    } catch (_) { /* no PII — no body text */ }
    if (!/^[a-z0-9_]{1,64}$/.test(code)) code = 'extract_failed';
    return { status: status, code: code };
  }

  function userMsg(code) {
    return ERROR_COPY[code] || ERROR_COPY.extract_failed;
  }

  function fnErrorHtml(status, code) {
    const safe = /^[a-z0-9_]{1,64}$/.test(code) ? code : 'extract_failed';
    const tag = status ? ('Error ' + status + ' ' + safe) : ('Error ' + safe);
    return escapeHtml(tag) + '<br>' + escapeHtml(userMsg(safe));
  }

  function addRow(kind, data) {
    const tbody = $('prop-' + kind + '-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    const cols = rowCols(kind);
    cols.forEach(function (col) {
      const td = document.createElement('td');
      if (col === 'requested') {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = data && data.requested === true;
        td.appendChild(cb);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = data && !isEmptyVal(data[col]) ? String(data[col]) : '';
        markField(input, isEmptyVal(input.value));
        bindMark(input);
        td.appendChild(input);
      }
      tr.appendChild(td);
    });
    const tdAct = document.createElement('td');
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'prop-row-del';
    rm.textContent = 'Quitar';
    rm.addEventListener('click', function () {
      tr.remove();
      if (!tbody.children.length) addRow(kind, {});
    });
    tdAct.appendChild(rm);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  }

  function rowCols(kind) {
    if (kind === 'commodities') return ['description', 'percent'];
    if (kind === 'coverages') return ['line', 'requested', 'limit', 'deductible'];
    if (kind === 'drivers') return ['name', 'status', 'cdlClass', 'licenseState'];
    if (kind === 'vehicles') return ['year', 'make', 'model', 'vin', 'statedValue', 'gvw', 'unitType'];
    if (kind === 'trailers') return ['year', 'make', 'model', 'vin', 'statedValue', 'trailerType'];
    return [];
  }

  function readRows(kind) {
    const tbody = $('prop-' + kind + '-body');
    if (!tbody) return [];
    const cols = rowCols(kind);
    return Array.prototype.map.call(tbody.querySelectorAll('tr'), function (tr) {
      const inputs = tr.querySelectorAll('input');
      const row = {};
      cols.forEach(function (col, i) {
        const el = inputs[i];
        if (!el) return;
        if (el.type === 'checkbox') row[col] = el.checked;
        else row[col] = isEmptyVal(el.value) ? null : String(el.value).trim();
      });
      return row;
    });
  }

  function fillApplicant(applicant) {
    const src = applicant || {};
    APPLICANT_FIELDS.forEach(function (pair) {
      const el = $('prop-a-' + pair[0]);
      if (!el) return;
      const v = src[pair[0]];
      el.value = isEmptyVal(v) ? '' : String(v);
      markField(el, isEmptyVal(el.value));
      bindMark(el);
    });
  }

  function fillTable(kind, rows) {
    const tbody = $('prop-' + kind + '-body');
    if (!tbody) return;
    tbody.textContent = '';
    const list = Array.isArray(rows) && rows.length ? rows : [{}];
    list.forEach(function (row) { addRow(kind, row || {}); });
  }

  function applyExtracted(data) {
    fillApplicant(data && data.applicant);
    fillTable('commodities', data && data.commodities);
    fillTable('coverages', data && data.coverages);
    fillTable('drivers', data && data.drivers);
    fillTable('vehicles', data && data.vehicles);
    fillTable('trailers', data && data.trailers);
    updateMissingBanner();
  }

  function collectProposal() {
    const applicant = {};
    APPLICANT_FIELDS.forEach(function (pair) {
      const el = $('prop-a-' + pair[0]);
      applicant[pair[0]] = el && !isEmptyVal(el.value) ? String(el.value).trim() : null;
    });
    const premiums = {};
    PREMIUM_FIELDS.forEach(function (pair) {
      const el = $('prop-p-' + pair[0]);
      premiums[pair[0]] = el && !isEmptyVal(el.value) ? String(el.value).trim() : null;
    });
    const notesEl = $('prop-p-notes');
    const preparedEl = $('prop-preparedBy');
    return {
      applicant: applicant,
      commodities: readRows('commodities'),
      coverages: readRows('coverages'),
      drivers: readRows('drivers'),
      vehicles: readRows('vehicles'),
      trailers: readRows('trailers'),
      premiums: premiums,
      notes: notesEl && !isEmptyVal(notesEl.value) ? String(notesEl.value).trim() : null,
      preparedBy: preparedEl && !isEmptyVal(preparedEl.value) ? String(preparedEl.value).trim() : null,
    };
  }

  function countMissing() {
    let n = 0;
    APPLICANT_FIELDS.forEach(function (pair) {
      const el = $('prop-a-' + pair[0]);
      if (el && isEmptyVal(el.value)) n++;
    });
    ['commodities', 'coverages', 'drivers', 'vehicles', 'trailers'].forEach(function (kind) {
      const tbody = $('prop-' + kind + '-body');
      if (!tbody) return;
      tbody.querySelectorAll('input[type="text"]').forEach(function (input) {
        if (isEmptyVal(input.value)) n++;
      });
    });
    return n;
  }

  function updateMissingBanner() {
    const n = countMissing();
    const el = $('propMissingBanner');
    if (!el) return;
    if (!n) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = n + ' campo(s) vacío(s) — resaltados en ámbar. Complétalos o déjalos para confirmar después.';
  }

  function displayVal(v) {
    const c = copy();
    if (isEmptyVal(v) && v !== false) return c.missing;
    if (v === true) return c.yes;
    if (v === false) return c.no;
    return String(v);
  }

  function cell(v) {
    return '<td>' + escapeHtml(displayVal(v)) + '</td>';
  }

  function sectionTable(title, headers, rowsHtml) {
    if (!rowsHtml) return '';
    return (
      '<h2>' + escapeHtml(title) + '</h2>' +
      '<table><thead><tr>' +
      headers.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>'
    );
  }

  function proposalPrintHtml(model) {
    const c = copy();
    const a = model.applicant || {};
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const fileHint = [
      'InTrucks_Proposal',
      (a.legalName || 'Applicant').replace(/[^\w]+/g, '_').slice(0, 40),
      new Date().toISOString().slice(0, 10),
    ].join('_');

    const appRows = [
      [c.legalName, a.legalName], [c.dba, a.dba], [c.dotNumber, a.dotNumber], [c.mcNumber, a.mcNumber],
      [c.street, a.street], [c.city, a.city], [c.state, a.state], [c.zip, a.zip],
      [c.yearsInBusiness, a.yearsInBusiness], [c.entityType, a.entityType],
      [c.phone, a.phone], [c.email, a.email],
      [c.operationType, a.operationType], [c.radius, a.radius],
    ].map(function (pair) {
      return '<tr><th>' + escapeHtml(pair[0]) + '</th>' + cell(pair[1]) + '</tr>';
    }).join('');

    function meaningful(rows) {
      return (rows || []).filter(function (r) {
        return Object.keys(r).some(function (k) {
          if (typeof r[k] === 'boolean') return r[k] === true;
          return !isEmptyVal(r[k]);
        });
      });
    }

    const commHtml = meaningful(model.commodities).map(function (r) {
      return '<tr>' + cell(r.description) + cell(r.percent) + '</tr>';
    }).join('');

    const covHtml = meaningful(model.coverages).map(function (r) {
      return '<tr>' + cell(r.line) + cell(r.requested) + cell(r.limit) + cell(r.deductible) + '</tr>';
    }).join('');

    const drvHtml = meaningful(model.drivers).map(function (r) {
      return '<tr>' + cell(r.name) + cell(r.status) + cell(r.cdlClass) + cell(r.licenseState) + '</tr>';
    }).join('');

    const vehHtml = meaningful(model.vehicles).map(function (r) {
      return '<tr>' + cell(r.year) + cell(r.make) + cell(r.model) + cell(r.vin) + cell(r.statedValue) + cell(r.gvw) + cell(r.unitType) + '</tr>';
    }).join('');

    const trlHtml = meaningful(model.trailers).map(function (r) {
      return '<tr>' + cell(r.year) + cell(r.make) + cell(r.model) + cell(r.vin) + cell(r.statedValue) + cell(r.trailerType) + '</tr>';
    }).join('');

    const p = model.premiums || {};
    const premRows = [
      [c.autoLiability, p.autoLiability],
      [c.physicalDamage, p.physicalDamage],
      [c.motorTruckCargo, p.motorTruckCargo],
      [c.generalLiability, p.generalLiability],
      [c.trailerInterchange, p.trailerInterchange],
      [c.other, p.other],
      [c.downPayment, p.downPayment],
      [c.paymentPlan, p.paymentPlan],
    ].map(function (pair) {
      return '<tr><th>' + escapeHtml(pair[0]) + '</th>' + cell(pair[1]) + '</tr>';
    }).join('');

    const notesBlock = model.notes
      ? '<h2>' + escapeHtml(c.notes) + '</h2><p>' + escapeHtml(model.notes).replace(/\n/g, '<br>') + '</p>'
      : '';

    const logoTag = model.logoDataUrl
      ? '<img id="prop-logo" src="' + model.logoDataUrl + '" alt="InTrucks">'
      : '';

    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<title>' + escapeHtml(fileHint) + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link href="https://fonts.googleapis.com/css2?family=Montserrat+Alternates:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>' +
      ':root{--navy:#00347c;--teal:#399b80;--ink:#12203a;--muted:#5b6b85;--line:#dde3ee;}' +
      '*{box-sizing:border-box;}body{margin:0;color:var(--ink);font-family:Inter,sans-serif;font-size:12px;line-height:1.45;}' +
      'h1,h2{font-family:"Montserrat Alternates",sans-serif;}' +
      '.bar{background:linear-gradient(120deg,#00347c 0%,#2C7A65 100%);color:#fff;padding:22px 28px;display:flex;align-items:center;gap:16px;}' +
      '.bar img{height:42px;width:auto;background:#fff;border-radius:8px;padding:4px;}' +
      '.bar .brand{font-weight:800;letter-spacing:.04em;font-size:13px;opacity:.9;}' +
      '.bar h1{margin:6px 0 4px;font-size:22px;}' +
      '.bar .sub{opacity:.88;font-size:12px;}' +
      '.wrap{padding:22px 28px 36px;}' +
      'h2{font-size:13px;color:var(--navy);margin:22px 0 8px;border-bottom:2px solid var(--teal);padding-bottom:4px;}' +
      'table{width:100%;border-collapse:collapse;margin:0 0 8px;}' +
      'th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;}' +
      'th{background:#e8edf7;color:var(--navy);font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;font-weight:700;}' +
      '.meta{display:flex;gap:24px;margin:0 0 8px;color:var(--muted);}' +
      '.disc{font-size:10.5px;color:var(--muted);margin-top:18px;line-height:1.5;}' +
      '.foot{margin-top:16px;font-size:10px;color:#9aa6bd;text-align:center;}' +
      '@page{size:letter;margin:14mm;}' +
      '@media print{.bar{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}' +
      '</style></head><body>' +
      '<div class="bar">' + logoTag + '<div><div class="brand">' + escapeHtml(c.brand) + '</div>' +
      '<h1>' + escapeHtml(c.docTitle) + '</h1>' +
      '<div class="sub">' + escapeHtml(c.confidential) + '</div></div></div>' +
      '<div class="wrap">' +
      '<div class="meta"><div><b>' + escapeHtml(c.preparedBy) + ':</b> ' + escapeHtml(displayVal(model.preparedBy)) + '</div>' +
      '<div><b>' + escapeHtml(c.quoteDate) + ':</b> ' + escapeHtml(today) + '</div></div>' +
      '<h2>' + escapeHtml(c.applicant) + '</h2>' +
      '<table>' + appRows + '</table>' +
      sectionTable(c.commodities, [c.commodity, c.percent], commHtml) +
      sectionTable(c.requestedCoverage, [c.line, c.requested, c.limit, c.deductible], covHtml) +
      sectionTable(c.drivers, [c.driverName, c.status, c.cdlClass, c.licenseState], drvHtml) +
      sectionTable(c.vehicles, [c.year, c.make, c.model, c.vin, c.statedValue, c.gvw, c.unitType], vehHtml) +
      sectionTable(c.trailers, [c.year, c.make, c.model, c.vin, c.statedValue, c.trailerType], trlHtml) +
      '<h2>' + escapeHtml(c.premiums) + '</h2><table>' + premRows + '</table>' +
      notesBlock +
      '<p class="disc">' + escapeHtml(c.notABinder) + '</p>' +
      '<p class="foot">' + escapeHtml(c.footer) + '</p>' +
      '</div>' +
      '<script>(function(){function go(){window.print();}function waitLogo(){var img=document.getElementById("prop-logo");if(!img){go();return;}if(img.complete){go();return;}img.addEventListener("load",go);img.addEventListener("error",go);}if(document.readyState==="complete") waitLogo();else window.addEventListener("load",waitLogo);})();<\/script>' +
      '</body></html>';
  }

  function setFile(file) {
    propFile = file || null;
    const name = $('propFileName');
    const btn = $('propExtractBtn');
    if (!file) {
      if (name) name.textContent = 'Ningún archivo seleccionado';
      if (btn) btn.disabled = true;
      return;
    }
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) {
      propFile = null;
      if (name) name.textContent = 'Solo se acepta PDF';
      if (btn) btn.disabled = true;
      showExtractStatus('warn', 'Sube un APP QUOTE en PDF.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      propFile = null;
      if (name) name.textContent = file.name + ' (demasiado grande)';
      if (btn) btn.disabled = true;
      showExtractStatus('warn', userMsg('too_large'));
      return;
    }
    if (name) name.textContent = file.name + ' · ' + Math.round(file.size / 1024) + ' KB';
    if (btn) btn.disabled = false;
    const status = $('propExtractStatus');
    if (status) status.innerHTML = '';
  }

  async function runExtract() {
    if (propBusy || !propFile) return;
    if (!sb) {
      showExtractStatus('warn', 'No se pudo cargar el servicio de datos.');
      return;
    }
    propBusy = true;
    const btn = $('propExtractBtn');
    if (btn) btn.disabled = true;
    showExtractStatus('loader', 'Leyendo el APP QUOTE… esto puede tardar unos segundos.');
    try {
      const pdfBase64 = await fileToBase64(propFile);
      const { data, error } = await sb.functions.invoke(EXTRACT_FN, {
        body: { pdfBase64: pdfBase64 },
      });
      if (error) {
        const fnErr = await readFnError(error);
        showExtractStatus('warn', fnErrorHtml(fnErr.status, fnErr.code));
        return;
      }
      const extracted = data && data.data ? data.data : data;
      if (!extracted || (extracted.documentType && extracted.documentType !== 'APP_QUOTE')) {
        showExtractStatus('warn', fnErrorHtml(422, 'not_app_quote'));
        return;
      }
      applyExtracted(extracted);
      const prepared = $('prop-preparedBy');
      if (prepared && isEmptyVal(prepared.value) && typeof sessionEmail === 'string') {
        prepared.value = sessionEmail.replace(/@intruckscorp\.com$/i, '');
        markField(prepared, false);
      }
      setStep(2);
      if (typeof track === 'function') track('proposal_extract', 'proposals', { ok: true });
    } catch (_) {
      showExtractStatus('warn', userMsg('extract_failed'));
    } finally {
      propBusy = false;
      if (btn) btn.disabled = !propFile;
    }
  }

  function loadLogoDataUrl() {
    return fetch('intrucks-logo.png').then(function (res) {
      if (!res.ok) return '';
      return res.blob();
    }).then(function (blob) {
      if (!blob) return '';
      return new Promise(function (resolve) {
        const reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = function () { resolve(''); };
        reader.readAsDataURL(blob);
      });
    }).catch(function () { return ''; });
  }

  async function generatePdf() {
    const model = collectProposal();
    model.logoDataUrl = await loadLogoDataUrl();
    const html = proposalPrintHtml(model);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    if (typeof track === 'function') track('proposal_pdf', 'proposals', { ok: true });
  }

  function resetAll() {
    propFile = null;
    const input = $('propPdfInput');
    if (input) input.value = '';
    setFile(null);
    applyExtracted({
      applicant: emptyApplicant(),
      commodities: [],
      coverages: [],
      drivers: [],
      vehicles: [],
      trailers: [],
    });
    PREMIUM_FIELDS.forEach(function (pair) {
      const el = $('prop-p-' + pair[0]);
      if (el) el.value = '';
    });
    const notes = $('prop-p-notes');
    if (notes) notes.value = '';
    const prepared = $('prop-preparedBy');
    if (prepared) prepared.value = '';
    setStep(1);
  }

  function onDrop(e) {
    e.preventDefault();
    const zone = $('propDrop');
    if (zone) zone.classList.remove('drag');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setFile(file);
  }

  window.initProposals = function () {
    const input = $('propPdfInput');
    const drop = $('propDrop');
    const extractBtn = $('propExtractBtn');
    const toPrem = $('propToPremiumsBtn');
    const backReview = $('propBackReviewBtn');
    const pdfBtn = $('propPdfBtn');
    const resetBtn = $('propResetBtn');
    const resetBtn2 = $('propResetBtn2');
    if (!input || input.dataset.propReady) return;
    input.dataset.propReady = '1';

    input.addEventListener('change', function () {
      setFile(input.files && input.files[0]);
    });
    if (drop) {
      drop.addEventListener('dragover', function (e) {
        e.preventDefault();
        drop.classList.add('drag');
      });
      drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
      drop.addEventListener('drop', onDrop);
      drop.addEventListener('click', function () { input.click(); });
      drop.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
      });
    }
    if (extractBtn) extractBtn.addEventListener('click', runExtract);
    if (toPrem) toPrem.addEventListener('click', function () {
      updateMissingBanner();
      setStep(3);
    });
    if (backReview) backReview.addEventListener('click', function () { setStep(2); });
    if (pdfBtn) pdfBtn.addEventListener('click', generatePdf);
    if (resetBtn) resetBtn.addEventListener('click', resetAll);
    if (resetBtn2) resetBtn2.addEventListener('click', resetAll);

    document.querySelectorAll('[data-prop-add]').forEach(function (btn) {
      btn.addEventListener('click', function () { addRow(btn.getAttribute('data-prop-add'), {}); });
    });

    const review = $('propStepReview');
    if (review) review.addEventListener('input', updateMissingBanner);

    APPLICANT_FIELDS.forEach(function (pair) { bindMark($('prop-a-' + pair[0])); });
    bindMark($('prop-preparedBy'));
    applyExtracted({ applicant: emptyApplicant(), commodities: [], coverages: [], drivers: [], vehicles: [], trailers: [] });
    setStep(1);
  };

  window.PROPOSAL_COPY = PROPOSAL_COPY;
  if (document.getElementById('view-proposals')) window.initProposals();
})();
