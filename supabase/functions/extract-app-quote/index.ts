import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_PDF_BYTES = 3_500_000;
const ALLOWED_DOMAIN = 'intruckscorp.com';
const GEMINI_TIMEOUT_MS = 40_000;

function corsHeaders(_req: Request) {
  const allowed = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://cris-intrucks.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const EXTRACT_PROMPT = `You extract data from an InTrucks APP QUOTE PDF.
The document has these sections: Application Information, Commodities Hauled, Request Coverage, Drivers, Vehicles, Trailers.

Return JSON only. Use null for any value that is missing, blank, illegible, or not present. NEVER invent, guess, or complete missing values.

documentType must be "APP_QUOTE" if this is that InTrucks form, otherwise "OTHER".

STRICT OMISSIONS — do not extract, copy, or allude to:
- MGA names, insurance carrier / company / aseguradora names
- Broker, producer, or agency contacts (name, email, phone, address)
- Driver license numbers
- Dates of birth
- SSN / FEIN / tax IDs

Applicant phone/email only if they belong to the insured in Application Information — never from a broker block.

Drivers: name, status, CDL class, license STATE only. No years of experience. No hire date. No license number. No DOB.
Vehicles/trailers: year, make, model, VIN, stated value, GVW/type as written.
Coverages: line of business, whether requested, limit, deductible — no market/carrier names.
Commodities: description and percent as written.

JSON shape:
{
  "documentType": "APP_QUOTE" | "OTHER",
  "applicant": {
    "legalName": string|null,
    "dba": string|null,
    "dotNumber": string|null,
    "mcNumber": string|null,
    "street": string|null,
    "city": string|null,
    "state": string|null,
    "zip": string|null,
    "yearsInBusiness": string|null,
    "entityType": string|null,
    "phone": string|null,
    "email": string|null,
    "operationType": string|null,
    "radius": string|null
  },
  "commodities": [{ "description": string|null, "percent": string|null }],
  "coverages": [{ "line": string|null, "requested": boolean|null, "limit": string|null, "deductible": string|null }],
  "drivers": [{ "name": string|null, "status": string|null, "cdlClass": string|null, "licenseState": string|null }],
  "vehicles": [{ "year": string|null, "make": string|null, "model": string|null, "vin": string|null, "statedValue": string|null, "gvw": string|null, "unitType": string|null }],
  "trailers": [{ "year": string|null, "make": string|null, "model": string|null, "vin": string|null, "statedValue": string|null, "trailerType": string|null }]
}`;

function jsonRes(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function asStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  const s = String(v).trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (low === 'null' || low === 'undefined' || low === 'n/a' || low === 'na' || low === 'unknown') return null;
  return s;
}

function asBool(v: unknown): boolean | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 'yes', 'y', 'x', 'requested', '1'].includes(s)) return true;
  if (['false', 'no', 'n', '0'].includes(s)) return false;
  return null;
}

function pickObj(src: unknown, spec: Record<string, 'str' | 'bool'>): Record<string, string | boolean | null> {
  const o = src && typeof src === 'object' ? src as Record<string, unknown> : {};
  const out: Record<string, string | boolean | null> = {};
  for (const [k, t] of Object.entries(spec)) {
    out[k] = t === 'bool' ? asBool(o[k]) : asStr(o[k]);
  }
  return out;
}

function pickArr(src: unknown, spec: Record<string, 'str' | 'bool'>): Record<string, string | boolean | null>[] {
  if (!Array.isArray(src)) return [];
  return src.map((row) => pickObj(row, spec)).filter((row) => Object.values(row).some((v) => v != null && v !== false));
}

function sanitizeExtract(raw: unknown) {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const documentType = asStr(r.documentType);
  return {
    documentType: documentType === 'APP_QUOTE' ? 'APP_QUOTE' : 'OTHER',
    applicant: pickObj(r.applicant, {
      legalName: 'str', dba: 'str', dotNumber: 'str', mcNumber: 'str',
      street: 'str', city: 'str', state: 'str', zip: 'str',
      yearsInBusiness: 'str', entityType: 'str', phone: 'str', email: 'str',
      operationType: 'str', radius: 'str',
    }),
    commodities: pickArr(r.commodities, { description: 'str', percent: 'str' }),
    coverages: pickArr(r.coverages, { line: 'str', requested: 'bool', limit: 'str', deductible: 'str' }),
    drivers: pickArr(r.drivers, {
      name: 'str', status: 'str', cdlClass: 'str', licenseState: 'str',
    }),
    vehicles: pickArr(r.vehicles, {
      year: 'str', make: 'str', model: 'str', vin: 'str', statedValue: 'str', gvw: 'str', unitType: 'str',
    }),
    trailers: pickArr(r.trailers, {
      year: 'str', make: 'str', model: 'str', vin: 'str', statedValue: 'str', trailerType: 'str',
    }),
  };
}

function parseGeminiJson(text: string): unknown {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('bad_json');
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  try {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) return JSON.parse(fence[1].trim());
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    /* fall through */
  }
  throw new Error('bad_json');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}
function isStrish(v: unknown): boolean {
  return v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}
function isBoolish(v: unknown): boolean {
  return v == null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number';
}

type PathSeg = string | number;
type ValidationError = { issues: Array<{ path: PathSeg[] }> };

function validateExtractJson(raw: unknown): { success: true } | { success: false; error: ValidationError } {
  const issues: Array<{ path: PathSeg[] }> = [];
  const add = (path: PathSeg[]) => { issues.push({ path }); };

  if (!isPlainObject(raw)) {
    add(['(root)']);
    return { success: false, error: { issues } };
  }
  if ('documentType' in raw && !isStrish(raw.documentType)) add(['documentType']);

  const applicantSpec = [
    'legalName', 'dba', 'dotNumber', 'mcNumber', 'street', 'city', 'state', 'zip',
    'yearsInBusiness', 'entityType', 'phone', 'email', 'operationType', 'radius',
  ];
  if ('applicant' in raw) {
    if (!isPlainObject(raw.applicant)) add(['applicant']);
    else {
      applicantSpec.forEach((k) => {
        if (k in raw.applicant && !isStrish(raw.applicant[k])) add(['applicant', k]);
      });
    }
  }

  function checkRows(key: string, spec: Record<string, 'str' | 'bool'>) {
    if (!(key in raw)) return;
    const arr = raw[key];
    if (arr == null) return;
    if (!Array.isArray(arr)) {
      add([key]);
      return;
    }
    arr.forEach((row, i) => {
      if (!isPlainObject(row)) {
        add([key, i]);
        return;
      }
      Object.keys(spec).forEach((field) => {
        if (!(field in row)) return;
        const ok = spec[field] === 'bool' ? isBoolish(row[field]) : isStrish(row[field]);
        if (!ok) add([key, i, field]);
      });
    });
  }

  checkRows('commodities', { description: 'str', percent: 'str' });
  checkRows('coverages', { line: 'str', requested: 'bool', limit: 'str', deductible: 'str' });
  checkRows('drivers', { name: 'str', status: 'str', cdlClass: 'str', licenseState: 'str' });
  checkRows('vehicles', { year: 'str', make: 'str', model: 'str', vin: 'str', statedValue: 'str', gvw: 'str', unitType: 'str' });
  checkRows('trailers', { year: 'str', make: 'str', model: 'str', vin: 'str', statedValue: 'str', trailerType: 'str' });

  if (issues.length) return { success: false, error: { issues } };
  return { success: true };
}

function isPdfBase64(b64: string): boolean {
  try {
    const head = atob(b64.slice(0, 48));
    return head.startsWith('%PDF');
  } catch {
    return false;
  }
}

function isModelUnavailable(status: number, err: { error?: { status?: string; code?: number } } | null) {
  if (status === 404) return true;
  const st = err?.error?.status;
  const code = err?.error?.code;
  return st === 'NOT_FOUND' || code === 404;
}

Deno.serve(async (req) => {
  try {
    return await handleExtract(req);
  } catch {
    return jsonRes(req, 502, { error: 'extract_failed' });
  }
});

async function handleExtract(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return jsonRes(req, 200, { ok: true });
  if (req.method !== 'POST') return jsonRes(req, 405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonRes(req, 401, { error: 'unauthorized' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const email = (userData?.user?.email || '').toLowerCase();
  if (userErr || !email) {
    return jsonRes(req, 401, { error: 'unauthorized' });
  }
  if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
    return jsonRes(req, 403, { error: 'forbidden' });
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
  if (!geminiKey) return jsonRes(req, 500, { error: 'missing_gemini_key' });

  let payload: { pdfBase64?: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonRes(req, 400, { error: 'invalid_pdf' });
  }

  const pdfBase64 = typeof payload.pdfBase64 === 'string' ? payload.pdfBase64.replace(/\s/g, '') : '';
  if (!pdfBase64 || pdfBase64.length < 80) return jsonRes(req, 400, { error: 'invalid_pdf' });

  const approxBytes = Math.floor(pdfBase64.length * 0.75);
  if (approxBytes > MAX_PDF_BYTES) return jsonRes(req, 413, { error: 'too_large' });
  if (!isPdfBase64(pdfBase64)) return jsonRes(req, 400, { error: 'invalid_pdf' });

  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
        { text: EXTRACT_PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  };

  // Documented 3.5 Flash ID for PDF/document extraction (no gemini-3.5-flash in Google AI models list).
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return jsonRes(req, 504, { error: 'extract_failed' });
    }
    return jsonRes(req, 502, { error: 'extract_failed' });
  }

  if (res.status === 429) return jsonRes(req, 429, { error: 'busy' });

  let gemini: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { status?: string; code?: number };
  } | null = null;
  try {
    gemini = await res.json();
  } catch {
    return jsonRes(req, 502, { error: 'extract_failed' });
  }

  if (isModelUnavailable(res.status, gemini)) {
    return jsonRes(req, 502, { error: 'model_unavailable' });
  }
  if (!res.ok) {
    console.error('extract-app-quote gemini_status', res.status);
    return jsonRes(req, 502, { error: 'extract_failed' });
  }

  const text = gemini?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) return jsonRes(req, 422, { error: 'extraction_invalid' });

  let parsed: unknown;
  try {
    parsed = parseGeminiJson(text);
  } catch {
    return jsonRes(req, 422, { error: 'extraction_invalid' });
  }

  const validated = validateExtractJson(parsed);
  if (!validated.success) {
    const paths = validated.error.issues.map((i) => i.path.join('.'));
    console.error('extract-app-quote invalid_paths', paths.join(','));
    return jsonRes(req, 422, { error: 'extraction_invalid' });
  }

  const data = sanitizeExtract(parsed);
  if (data.documentType !== 'APP_QUOTE') return jsonRes(req, 422, { error: 'not_app_quote' });

  return jsonRes(req, 200, { data });
}
