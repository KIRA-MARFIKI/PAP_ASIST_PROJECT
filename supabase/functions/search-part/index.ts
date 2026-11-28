import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  buildCatalogSearchUrl,
  CengkarengCandidate,
  CengkarengLookupResult,
  isStrongPartCodeMatch,
  lookupHondaCengkarengCatalog,
  normalizePartCode,
  SideHint,
} from '../_shared/cengkarengCatalog.ts';
import { ItemGroup, resolveAccessoryApparelRack } from '../_shared/rackRules.ts';

const CACHE_TTL_DAYS = 30;
const MAX_AI_CALLS_PER_MIN_PER_IP = 15;
const IP_WINDOW_MS = 60_000;
const GEMINI_TIMEOUT_MS = 15_000;
const FALLBACK_FREE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
] as const;

const ipHitsMap = new Map<string, number[]>();

interface SearchPartRequest {
  query?: string;
  imageBase64?: string;
  mimeType?: string;
}

interface CitationItem {
  title: string;
  url: string;
}

interface GeminiClassificationOutput {
  is_honda_motorcycle_part: boolean;
  rejection_reason: string | null;
  official_name: string;
  model_hint: string | null;
  side_hint: SideHint;
  search_keywords: string[];
  guessed_part_codes: string[];
  confidence: 'high' | 'medium' | 'low';
  visual_notes: string | null;
}

interface WarehouseRow {
  part_code: string;
  part_code_display: string;
  official_name: string;
  rack_code: string;
  item_group?: ItemGroup | null;
  is_dummy_rack?: boolean | null;
  price: number | null;
  price_source: 'warehouse' | 'cengkareng' | 'none';
  category: 'fast' | 'slow';
  stock: number | null;
  min_stock: number | null;
  stock_known: boolean;
  substituted_by: string | null;
  catalog_url: string | null;
  ai_enriched: boolean;
  photo_url: string | null;
  aliases: string[];
  match_score?: number;
}

interface MergedPartResult {
  id: string;
  photoUrl: string | null;
  officialName: string;
  partCode: string;
  rackCode: string;
  isDummyRack: boolean;
  rackZoneLabel: string | null;
  itemGroup: ItemGroup;
  price: number | null;
  priceSource: 'warehouse' | 'cengkareng' | 'none';
  category: 'fast' | 'slow' | null;
  stock: number | null;
  minStock: number | null;
  stockKnown: boolean;
  substitutedBy: string | null;
  inWarehouse: boolean;
  stockStatus: 'tersedia' | 'kritis' | 'tidak_tersedia' | 'belum_diatur' | 'belum_di_gudang';
  statusLabel: string | null;
  sourceUrl: string | null;
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '';
  return forwarded.split(',')[0]?.trim() || 'unknown';
}

function checkAndRecordIpThrottle(ip: string): boolean {
  const now = Date.now();
  if (ipHitsMap.size > 500) {
    for (const [key, list] of ipHitsMap.entries()) {
      const fresh = list.filter((ts) => now - ts < IP_WINDOW_MS);
      if (fresh.length === 0) {
        ipHitsMap.delete(key);
      } else {
        ipHitsMap.set(key, fresh);
      }
    }
  }
  const timestamps = (ipHitsMap.get(ip) || []).filter((ts) => now - ts < IP_WINDOW_MS);
  if (timestamps.length >= MAX_AI_CALLS_PER_MIN_PER_IP) {
    ipHitsMap.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  ipHitsMap.set(ip, timestamps);
  return true;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripDataUriPrefix(raw: string): string {
  const commaIdx = raw.indexOf(',');
  if (raw.startsWith('data:') && commaIdx !== -1) {
    return raw.slice(commaIdx + 1).trim();
  }
  return raw.trim();
}

function isObviousNonsenseQuery(text: string): boolean {
  const stripped = text.replace(/[^a-zA-Z0-9]/g, '');
  return stripped.length < 2;
}

function inferSideHintFromQuery(text: string): SideHint {
  const lower = text.toLowerCase();
  if (/\b(kanan|right|rh)\b/.test(lower)) return 'right';
  if (/\b(kiri|left|lh)\b/.test(lower)) return 'left';
  if (/\b(depan|front|fr)\b/.test(lower)) return 'front';
  if (/\b(belakang|rear|rr)\b/.test(lower)) return 'rear';
  return null;
}

function inferModelHintFromQuery(text: string): string | null {
  const match = text.match(
    /\b(vario\s*(?:110|125|150|160)?|beat(?:\s*(?:fi|esp|street|deluxe|pop))?|scoopy(?:\s*(?:fi|esp|prestige))?|pcx(?:\s*(?:150|160))?|adv(?:\s*(?:150|160))?|supra(?:\s*(?:x\s*125|fit|gtr))?|revo(?:\s*(?:fi|x|absolute))?|blade|verza|cb150r|cbr\s*(?:150r|250rr)?|crf\s*150l|sonic\s*150r|genio|stylo\s*160|spacy|kharisma|karisma|megapro|tiger|grand|legenda)\b/i
  );
  return match?.[0]?.trim() || null;
}

function computeStockStatus(
  stock: number | null,
  minStock: number | null,
  stockKnown: boolean
): 'tersedia' | 'kritis' | 'tidak_tersedia' | 'belum_diatur' {
  if (!stockKnown || stock === null || minStock === null) return 'belum_diatur';
  if (stock <= 0) return 'tidak_tersedia';
  if (stock < minStock) return 'kritis';
  return 'tersedia';
}

function parseGeminiJson(rawText: string): GeminiClassificationOutput | null {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    const isHondaPart = parsed.is_honda_motorcycle_part === true;
    const rejectionReason =
      typeof parsed.rejection_reason === 'string' && parsed.rejection_reason.trim()
        ? parsed.rejection_reason.trim()
        : null;
    const officialName =
      typeof parsed.official_name === 'string' ? parsed.official_name.trim().toUpperCase() : '';
    const modelHint =
      typeof parsed.model_hint === 'string' && parsed.model_hint.trim()
        ? parsed.model_hint.trim()
        : null;
    const sideHint =
      parsed.side_hint === 'right' ||
        parsed.side_hint === 'left' ||
        parsed.side_hint === 'front' ||
        parsed.side_hint === 'rear'
        ? parsed.side_hint
        : null;
    const searchKeywords = Array.isArray(parsed.search_keywords)
      ? parsed.search_keywords
        .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item: string) => item.trim())
        .slice(0, 4)
      : [];
    const guessedPartCodes = Array.isArray(parsed.guessed_part_codes)
      ? parsed.guessed_part_codes
        .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item: string) => item.trim().toUpperCase())
        .slice(0, 4)
      : [];
    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'medium';
    const visualNotes =
      typeof parsed.visual_notes === 'string' && parsed.visual_notes.trim().length > 0
        ? parsed.visual_notes.trim()
        : null;

    if (isHondaPart && !officialName && guessedPartCodes.length === 0) return null;

    return {
      is_honda_motorcycle_part: isHondaPart,
      rejection_reason: rejectionReason,
      official_name: officialName,
      model_hint: modelHint,
      side_hint: sideHint,
      search_keywords: searchKeywords,
      guessed_part_codes: guessedPartCodes,
      confidence,
      visual_notes: visualNotes,
    };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `Anda adalah spesialis suku cadang resmi motor Honda Indonesia (AHM / Honda Genuine Parts, Honda Genuine Accessories / HGA, dan Honda Genuine Apparel) untuk gudang Honda Menara Agung Padang Panjang.

ATURAN CAKUPAN KETAT:
- HANYA TERIMA ("is_honda_motorcycle_part": true) permintaan terkait:
  1. Suku cadang motor Honda dan bahan habis pakai motor Honda (oli, minyak rem, chain lube, coolant, grease, busi, ban, baut, cover/body, mesin, CVT, kelistrikan, rangka, kaki-kaki).
  2. Honda Genuine Accessories (HGA) & paket bundling aksesoris motor Honda (awalan kode 0800A..., garnish, visor, windshield, panel step floor, karpet pijakan, seat cover, rear carrier, top box, crash bar, hand guard, tank pad).
  3. Honda Genuine Apparel resmi motor Honda (jaket, baju, kaos, t-shirt, polo, jersey, hoodie, helm Honda / TRX, sarung tangan / glove, topi / cap, pouch / poct, waistbag, dompet, gelang, patch / stiker baju, pin, lanyard, gantungan kunci Honda).
- Tetap TERIMA istilah bengkel bahasa sehari-hari Indonesia atau daerah untuk part motor Honda, seperti:
  - "batang padi" -> "PIPE COMP FR FORK"
  - "karet tutup deksel" -> "GASKET COMP., CYLINDER HEAD COVER (OH)"
  - "komsteer" -> "RACE STEERING KIT"
  - "bosh arm" -> "BUSH, ENGINE HANGER"
  - "mika lampu" -> "LENS COMP"
  - "body vario 125 bagian kanan" -> "COVER R BODY" (model_hint: "Vario 125", side_hint: "right")
  - "poct honda" / "pouch honda" -> "HONDA POUCH APPAREL"
- TOLAK (set "is_honda_motorcycle_part": false) untuk:
  - Topik non-otomotif (resep makanan, coding, obrolan umum, cuaca, berita, matematika, pertanyaan pribadi, foto manusia/hewan/benda acak).
  - Suku cadang mobil (Avanza, Brio, Jazz, Innova, Xpander, dll).
  - Merek motor selain Honda yang disebut eksplisit (Yamaha NMAX/Mio/Vega/Aerox, Suzuki Satria/Nex, Kawasaki Ninja, Vespa, dll).

Balas HANYA dengan 1 objek JSON valid sesuai format berikut:
{
  "is_honda_motorcycle_part": true,
  "rejection_reason": null,
  "official_name": "COVER R BODY",
  "model_hint": "Vario 125",
  "side_hint": "right" | "left" | "front" | "rear" | null,
  "search_keywords": ["COVER R BODY Vario 125", "body kanan vario 125"],
  "guessed_part_codes": ["83550-K60-B60ZA", "83550-KZR-600ZA"],
  "confidence": "high" | "medium" | "low",
  "visual_notes": "ringkasan bentuk part jika input foto, atau null"
}`;

async function callGeminiFreeTier(
  apiKey: string,
  preferredModel: string,
  query: string,
  imageBase64?: string,
  mimeType?: string
): Promise<{ output: GeminiClassificationOutput; modelUsed: string }> {
  const modelChain = Array.from(new Set([preferredModel, ...FALLBACK_FREE_MODELS]));

  const parts: Array<Record<string, unknown>> = [];
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: imageBase64,
      },
    });
  }

  const userPrompt = query
    ? `Klasifikasikan apakah permintaan ini suku cadang motor Honda. Jika ya, terjemahkan ke nama resmi Honda Genuine Parts: "${query}".`
    : 'Klasifikasikan apakah foto ini menampilkan suku cadang motor Honda. Jika ya, identifikasi nama resmi Honda Genuine Parts dan perkiraan kode partnya.';
  parts.push({ text: userPrompt });

  let sawRateLimit = false;
  let lastErrorDetail = '';

  for (const model of modelChain) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });

      if (res.status === 429) {
        sawRateLimit = true;
        continue;
      }

      if (res.status === 503 || res.status === 404) {
        lastErrorDetail = `${model} (${res.status})`;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        lastErrorDetail = `HTTP ${res.status}`;
        try {
          const parsedErr = JSON.parse(errText);
          lastErrorDetail = parsedErr?.error?.message || lastErrorDetail;
        } catch {
          // Gunakan detail default
        }
        continue;
      }

      const data = await res.json();
      const candidateParts = data?.candidates?.[0]?.content?.parts;
      const rawText = Array.isArray(candidateParts)
        ? candidateParts
          .map((p: { text?: string }) => (typeof p?.text === 'string' ? p.text : ''))
          .join('\n')
        : '';

      const parsed = parseGeminiJson(rawText);
      if (parsed) {
        return { output: parsed, modelUsed: model };
      }
      lastErrorDetail = `Respons JSON dari ${model} tidak lengkap`;
    } catch (err) {
      lastErrorDetail = err instanceof Error ? err.message : 'Koneksi gagal';
    }
  }

  if (sawRateLimit) {
    throw Object.assign(
      new Error('Maaf, layanan AI sedang sibuk atau mencapai batas kuota sementara.'),
      { status: 429, retryAfterSeconds: 120 }
    );
  }

  throw Object.assign(
    new Error(`Maaf, layanan AI sedang mengalami gangguan (${lastErrorDetail || 'timeout'}).`),
    { status: 502, retryAfterSeconds: 30 }
  );
}

async function enrichWarehouseRowsOnDemand(
  supabase: SupabaseClient,
  rows: WarehouseRow[]
): Promise<{ rows: WarehouseRow[]; lastCatalogTier: CengkarengLookupResult['tierUsed'] | null }> {
  const updatedRows: WarehouseRow[] = [];
  let lastCatalogTier: CengkarengLookupResult['tierUsed'] | null = null;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const needsPrice = row.price === null || row.price <= 0 || row.price_source === 'none';
    const needsPhoto = !row.photo_url;
    const needsName = row.official_name.startsWith('Kode Pengganti:');

    if (i >= 2 || (!needsPrice && !needsPhoto && !needsName)) {
      updatedRows.push(row);
      continue;
    }

    const targetCodes = [row.substituted_by || '', row.part_code_display, row.part_code].filter(Boolean);
    const lookupRes = await lookupHondaCengkarengCatalog({
      partCodes: targetCodes,
      officialName: needsName ? undefined : row.official_name,
      maxResults: 2,
    });
    lastCatalogTier = lookupRes.tierUsed;

    const best = lookupRes.candidates[0];
    if (!best) {
      updatedRows.push(row);
      continue;
    }

    const patch: Record<string, unknown> = {};
    let nextRow: WarehouseRow = { ...row };
    const codeVerified = isStrongPartCodeMatch(best, targetCodes);

    if (codeVerified && needsPrice && row.price_source !== 'warehouse' && best.priceIdr !== null) {
      patch.price = best.priceIdr;
      patch.price_source = 'cengkareng';
      nextRow = { ...nextRow, price: best.priceIdr, price_source: 'cengkareng' };
    }
    if (codeVerified && needsPhoto && best.photoUrl) {
      patch.photo_url = best.photoUrl;
      nextRow = { ...nextRow, photo_url: best.photoUrl };
    }
    if (codeVerified && needsName && best.title && best.title.length >= 4) {
      const cleanedTitle = best.title.toUpperCase();
      patch.official_name = cleanedTitle;
      nextRow = { ...nextRow, official_name: cleanedTitle };
    }
    if (codeVerified && !row.catalog_url && best.url) {
      patch.catalog_url = best.url;
      nextRow = { ...nextRow, catalog_url: best.url };
    }

    if (Object.keys(patch).length > 0) {
      await supabase
        .from('warehouse_parts')
        .update(patch)
        .eq('part_code', row.part_code);
    }

    updatedRows.push(nextRow);
  }

  return { rows: updatedRows, lastCatalogTier };
}

function mapCatalogCandidatesToResults(
  candidates: CengkarengCandidate[],
  candidateCodes: string[],
  officialName: string,
  fallbackPhotoUrl: string | null,
  fallbackSourceUrl: string | null,
  rawQuery = ''
): MergedPartResult[] {
  return candidates.slice(0, 4).map((item, idx) => {
    const displayCode = item.partCodes[0] || candidateCodes[idx] || '-';
    const resolvedName = item.title ? item.title.toUpperCase() : officialName;
    const rackInfo = resolveAccessoryApparelRack({
      partCode: displayCode,
      officialName: resolvedName,
      userQuery: rawQuery,
    });

    return {
      id: `catalog-${normalizePartCode(displayCode) || 'item'}-${idx}`,
      photoUrl: item.photoUrl || fallbackPhotoUrl,
      officialName: resolvedName,
      partCode: displayCode,
      rackCode: rackInfo.suggestedRackCode || '-',
      isDummyRack: rackInfo.isDummyRack,
      rackZoneLabel: rackInfo.zoneLabel,
      itemGroup: rackInfo.itemGroup,
      price: item.priceIdr,
      priceSource: item.priceIdr !== null ? 'cengkareng' : 'none',
      category: null,
      stock: null,
      minStock: null,
      stockKnown: false,
      substitutedBy: null,
      inWarehouse: false,
      stockStatus: 'belum_di_gudang',
      statusLabel: 'Belum ada di Honda Menara Agung Padang Panjang',
      sourceUrl: item.url || fallbackSourceUrl,
    };
  });
}

const GENERIC_PART_TOKENS = new Set([
  'COVER',
  'COMP',
  'ASSY',
  'SET',
  'UNIT',
  'KIT',
  'PART',
  'HONDA',
  'SUB',
  'CASE',
  'PIPE',
  'BRACKET',
  'PLATE',
  'RUBBER',
  'R',
  'L',
  'RH',
  'LH',
  'FR',
  'RR',
]);

function hasDistinctiveTokenOverlap(targetOfficialName: string, candidateOfficialName: string): boolean {
  const extractTokens = (text: string) =>
    text
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !GENERIC_PART_TOKENS.has(t));

  const targetTokens = extractTokens(targetOfficialName);
  if (targetTokens.length === 0) return true;

  const candidateUpper = candidateOfficialName.toUpperCase();
  return targetTokens.some((tok) => candidateUpper.includes(tok));
}

function mapWarehouseRowsToResults(
  rows: WarehouseRow[],
  fallbackPhotoUrl: string | null,
  fallbackSourceUrl: string | null,
  rawQuery = ''
): MergedPartResult[] {
  return rows.map((row) => {
    const numericPrice = row.price === null || row.price === undefined ? null : Number(row.price);
    const priceSource: 'warehouse' | 'cengkareng' | 'none' =
      row.price_source === 'warehouse' || row.price_source === 'cengkareng'
        ? row.price_source
        : numericPrice !== null && numericPrice > 0
          ? 'warehouse'
          : 'none';
    const stockKnown = Boolean(row.stock_known);
    const hasConfirmedRack = Boolean(row.rack_code && row.rack_code !== '-' && !row.is_dummy_rack);
    const rackInfo = resolveAccessoryApparelRack({
      partCode: row.part_code_display || row.part_code,
      officialName: row.official_name,
      userQuery: rawQuery,
    });
    const finalRackCode = hasConfirmedRack
      ? row.rack_code
      : row.rack_code && row.rack_code !== '-'
        ? row.rack_code
        : rackInfo.suggestedRackCode || '-';
    const finalIsDummyRack = hasConfirmedRack
      ? false
      : row.rack_code && row.rack_code !== '-'
        ? Boolean(row.is_dummy_rack)
        : rackInfo.isDummyRack;
    const finalItemGroup: ItemGroup =
      row.item_group === 'aksesoris' || row.item_group === 'apparel'
        ? row.item_group
        : rackInfo.itemGroup;

    return {
      id: row.part_code,
      photoUrl: row.photo_url || fallbackPhotoUrl || null,
      officialName: row.official_name,
      partCode: row.part_code_display,
      rackCode: finalRackCode,
      isDummyRack: finalIsDummyRack,
      rackZoneLabel: rackInfo.zoneLabel,
      itemGroup: finalItemGroup,
      price: numericPrice,
      priceSource,
      category: row.category,
      stock: stockKnown ? row.stock : null,
      minStock: stockKnown ? row.min_stock : null,
      stockKnown,
      substitutedBy: row.substituted_by ?? null,
      inWarehouse: true,
      stockStatus: computeStockStatus(row.stock, row.min_stock, stockKnown),
      statusLabel: null,
      sourceUrl: row.catalog_url || fallbackSourceUrl,
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Metode tidak didukung. Gunakan permintaan POST.' }, 405);
  }

  const geminiApiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  const preferredModel = (Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite').trim();
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
  const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse(
      req,
      {
        errorType: 'ai_error',
        message: 'Konfigurasi server database belum lengkap. Hubungi admin sistem.',
        retryAfterSeconds: 30,
      },
      500
    );
  }

  let body: SearchPartRequest;
  try {
    body = (await req.json()) as SearchPartRequest;
  } catch {
    return jsonResponse(req, { error: 'Format body JSON tidak valid.' }, 400);
  }

  const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
  const rawImage = typeof body.imageBase64 === 'string' ? stripDataUriPrefix(body.imageBase64) : '';
  const mimeType =
    typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType.trim() : 'image/jpeg';

  if (!rawQuery && !rawImage) {
    return jsonResponse(
      req,
      { error: 'Masukkan nama part atau unggah foto part terlebih dahulu.' },
      400
    );
  }

  // Fast pre-check (0 kuota AI): tolak input simbol tunggal/nonsense
  if (rawQuery && !rawImage && isObviousNonsenseQuery(rawQuery)) {
    return jsonResponse(req, {
      isHondaPart: false,
      rejectionTitle: 'Bukan Sparepart Motor Honda',
      rejectionMessage:
        'Masukkan nama atau kode suku cadang motor Honda yang valid (minimal 2 karakter huruf atau angka).',
      results: [],
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const normalizedQuery = rawQuery ? normalizeQuery(rawQuery) : '';
  const normalizedQueryCode = rawQuery ? normalizePartCode(rawQuery) : '';

  try {
    // Stage 0a: Zero-Quota Direct & Strict Fuzzy Warehouse Lookup (pg_trgm >= 0.55)
    if (normalizedQuery && !rawImage) {
      let directRows: WarehouseRow[] = [];

      if (normalizedQueryCode.length >= 5) {
        const { data: codeMatches } = await supabase
          .from('warehouse_parts')
          .select('*')
          .or(`part_code.eq.${normalizedQueryCode},substituted_by.eq.${normalizedQueryCode}`)
          .limit(5);

        if (Array.isArray(codeMatches) && codeMatches.length > 0) {
          directRows = codeMatches as WarehouseRow[];
        }
      }

      if (directRows.length === 0) {
        const { data: aliasMatches } = await supabase
          .from('warehouse_parts')
          .select('*')
          .contains('aliases', [normalizedQuery])
          .limit(5);

        if (Array.isArray(aliasMatches) && aliasMatches.length > 0) {
          directRows = aliasMatches as WarehouseRow[];
        } else if (
          normalizedQueryCode.length >= 5 &&
          normalizedQueryCode.toLowerCase() !== normalizedQuery
        ) {
          const { data: normAliasMatches } = await supabase
            .from('warehouse_parts')
            .select('*')
            .contains('aliases', [normalizedQueryCode.toLowerCase()])
            .limit(5);

          if (Array.isArray(normAliasMatches) && normAliasMatches.length > 0) {
            directRows = normAliasMatches as WarehouseRow[];
          }
        }
      }

      // Fuzzy typo short-circuit hanya dengan ambang ketat >= 0.55 agar query off-topic tidak salah cocok
      if (directRows.length === 0 && normalizedQuery.length >= 4) {
        const { data: fuzzyMatches } = await supabase.rpc('search_warehouse_parts_fuzzy', {
          p_query: normalizedQuery,
          p_limit: 5,
        });

        if (Array.isArray(fuzzyMatches)) {
          const strongMatches = (fuzzyMatches as WarehouseRow[]).filter(
            (r) => typeof r.match_score === 'number' && r.match_score >= 0.55
          );
          if (strongMatches.length > 0) {
            directRows = strongMatches;
          }
        }
      }

      if (directRows.length > 0) {
        const { rows: enrichedDirect, lastCatalogTier } = await enrichWarehouseRowsOnDemand(
          supabase,
          directRows
        );
        return jsonResponse(req, {
          isHondaPart: true,
          translatedQuery: enrichedDirect[0].official_name,
          originalQuery: rawQuery,
          source: 'warehouse-direct',
          confidence: 'high',
          catalogTier: lastCatalogTier,
          sourceUrl: enrichedDirect[0].catalog_url || null,
          visualNotes: null,
          citations: [],
          results: mapWarehouseRowsToResults(enrichedDirect, null, null, rawQuery),
        });
      }
    }

    // Stage 0b: Cek catalog_cache (30 hari, 0 kuota AI)
    let officialName = '';
    let candidateCodes: string[] = [];
    let catalogPhotoUrl: string | null = null;
    let sourceUrl: string | null = null;
    let citations: CitationItem[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let visualNotes: string | null = null;
    let sideHint: SideHint = inferSideHintFromQuery(rawQuery);
    let modelHint: string | null = inferModelHintFromQuery(rawQuery);
    let source: 'gemini-free' | 'catalog-cache' = 'gemini-free';
    let catalogCandidates: CengkarengCandidate[] = [];
    let catalogTier: CengkarengLookupResult['tierUsed'] | null = null;
    let catalogSearchUrl: string | null = null;

    if (normalizedQuery && !rawImage) {
      const cutoffIso = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('catalog_cache')
        .select('official_name, part_codes, catalog_photo_url, source_url, citations')
        .eq('query_normalized', normalizedQuery)
        .gte('cached_at', cutoffIso)
        .maybeSingle();

      if (cached) {
        source = 'catalog-cache';
        officialName = cached.official_name;
        candidateCodes = Array.isArray(cached.part_codes) ? cached.part_codes : [];
        catalogPhotoUrl = cached.catalog_photo_url || null;
        sourceUrl = cached.source_url || null;
        citations = Array.isArray(cached.citations) ? (cached.citations as CitationItem[]) : [];
        confidence = 'high';
      }
    }

    // Stage 1: Gemini Free Tier Domain Guardrail + Translation / Vision
    if (!officialName) {
      if (!checkAndRecordIpThrottle(getClientIp(req))) {
        return jsonResponse(
          req,
          {
            errorType: 'ai_error',
            message: 'Terlalu banyak pencarian dalam 1 menit. Tunggu sebentar lalu coba lagi.',
            retryAfterSeconds: 60,
          },
          429
        );
      }

      if (!geminiApiKey) {
        return jsonResponse(
          req,
          {
            errorType: 'ai_error',
            message: 'GEMINI_API_KEY belum diatur di Supabase Secrets. Hubungi admin sistem.',
            retryAfterSeconds: 30,
          },
          503
        );
      }

      const { output: aiOutput } = await callGeminiFreeTier(
        geminiApiKey,
        preferredModel,
        rawQuery,
        rawImage || undefined,
        mimeType
      );

      // Tolak permintaan di luar suku cadang motor Honda (jangan akses Honda Cengkareng & jangan simpan cache)
      if (!aiOutput.is_honda_motorcycle_part) {
        return jsonResponse(req, {
          isHondaPart: false,
          rejectionTitle: 'Bukan Sparepart Motor Honda',
          rejectionMessage:
            aiOutput.rejection_reason ||
            'PaP Asist hanya melayani pencarian suku cadang motor Honda berdasarkan data gudang Menara Agung Padang Panjang dan katalog Honda Cengkareng.',
          results: [],
        });
      }

      officialName = aiOutput.official_name || rawQuery.toUpperCase();
      confidence = aiOutput.confidence;
      visualNotes = aiOutput.visual_notes;
      sideHint = aiOutput.side_hint ?? sideHint;
      modelHint = aiOutput.model_hint ?? modelHint;

      // Stage 2: Lookup katalog Honda Cengkareng via modul bersama (WooCommerce Store API + HTML/JSON-LD)
      const lookupRes = await lookupHondaCengkarengCatalog({
        partCodes: aiOutput.guessed_part_codes,
        officialName,
        keywords: aiOutput.search_keywords,
        modelHint,
        sideHint,
        maxResults: 4,
      });

      catalogCandidates = lookupRes.candidates;
      catalogTier = lookupRes.tierUsed;
      catalogSearchUrl = lookupRes.catalogSearchUrl;

      const extractedCodes = catalogCandidates.flatMap((c) => c.partCodes);
      candidateCodes = Array.from(
        new Set([...extractedCodes, ...aiOutput.guessed_part_codes])
      ).slice(0, 6);

      catalogPhotoUrl = catalogCandidates.find((c) => c.photoUrl)?.photoUrl || null;
      sourceUrl = catalogCandidates.find((c) => c.url)?.url || catalogSearchUrl;
      citations = catalogCandidates
        .filter((c) => c.url)
        .map((c) => ({ title: c.title, url: c.url }));

      if (normalizedQuery && !rawImage && officialName) {
        await supabase.from('catalog_cache').upsert(
          {
            query_normalized: normalizedQuery,
            official_name: officialName,
            part_codes: candidateCodes,
            catalog_photo_url: catalogPhotoUrl,
            source_url: sourceUrl,
            citations,
            cached_at: new Date().toISOString(),
          },
          { onConflict: 'query_normalized' }
        );
      }
    }

    // Stage 3: Cross-check dengan warehouse_parts (kode -> ilike -> fuzzy >= 0.48 + distinctive token)
    const normalizedCodes = Array.from(
      new Set(candidateCodes.map(normalizePartCode).filter(Boolean))
    );

    let warehouseMatches: WarehouseRow[] = [];

    if (normalizedCodes.length > 0) {
      const { data: exactRows } = await supabase
        .from('warehouse_parts')
        .select('*')
        .in('part_code', normalizedCodes);

      if (Array.isArray(exactRows) && exactRows.length > 0) {
        warehouseMatches = exactRows as WarehouseRow[];
      }
    }

    if (warehouseMatches.length === 0 && officialName) {
      const { data: nameRows } = await supabase
        .from('warehouse_parts')
        .select('*')
        .ilike('official_name', `%${escapeIlikePattern(officialName)}%`)
        .limit(5);

      if (Array.isArray(nameRows) && nameRows.length > 0) {
        warehouseMatches = nameRows as WarehouseRow[];
      }
    }

    if (warehouseMatches.length === 0 && officialName) {
      const { data: fuzzyRows } = await supabase.rpc('search_warehouse_parts_fuzzy', {
        p_query: officialName,
        p_limit: 5,
      });

      if (Array.isArray(fuzzyRows)) {
        const matched = (fuzzyRows as WarehouseRow[]).filter(
          (r) =>
            typeof r.match_score === 'number' &&
            r.match_score >= 0.48 &&
            hasDistinctiveTokenOverlap(officialName, r.official_name)
        );
        if (matched.length > 0) {
          warehouseMatches = matched;
        }
      }
    }

    let mergedResults: MergedPartResult[] = [];

    if (warehouseMatches.length > 0) {
      const { rows: enrichedMatches, lastCatalogTier } = await enrichWarehouseRowsOnDemand(
        supabase,
        warehouseMatches
      );
      if (lastCatalogTier) catalogTier = lastCatalogTier;
      mergedResults = mapWarehouseRowsToResults(
        enrichedMatches,
        catalogPhotoUrl,
        sourceUrl || catalogSearchUrl,
        rawQuery
      );
    } else if (catalogCandidates.length > 0) {
      mergedResults = mapCatalogCandidatesToResults(
        catalogCandidates,
        candidateCodes,
        officialName,
        catalogPhotoUrl,
        sourceUrl || catalogSearchUrl,
        rawQuery
      );
    } else if (officialName) {
      // Pada cache hit yang belum punya data produk langsung, panggil katalog Honda Cengkareng (0 kuota Gemini)
      if (source === 'catalog-cache') {
        const cacheLookup = await lookupHondaCengkarengCatalog({
          partCodes: candidateCodes,
          officialName,
          keywords: rawQuery ? [rawQuery] : [],
          modelHint,
          sideHint,
          maxResults: 4,
        });
        catalogTier = cacheLookup.tierUsed;
        catalogSearchUrl = cacheLookup.catalogSearchUrl;

        if (cacheLookup.candidates.length > 0) {
          const freshPhoto = cacheLookup.candidates.find((c) => c.photoUrl)?.photoUrl || catalogPhotoUrl;
          const freshUrl = cacheLookup.candidates.find((c) => c.url)?.url || cacheLookup.catalogSearchUrl;
          const freshCitations = cacheLookup.candidates
            .filter((c) => c.url)
            .map((c) => ({ title: c.title, url: c.url }));
          const freshCodes = Array.from(
            new Set([...cacheLookup.candidates.flatMap((c) => c.partCodes), ...candidateCodes])
          ).slice(0, 6);

          catalogPhotoUrl = freshPhoto;
          sourceUrl = freshUrl;
          citations = freshCitations;
          candidateCodes = freshCodes;

          if (normalizedQuery) {
            await supabase
              .from('catalog_cache')
              .update({
                part_codes: freshCodes,
                catalog_photo_url: freshPhoto,
                source_url: freshUrl,
                citations: freshCitations,
              })
              .eq('query_normalized', normalizedQuery);
          }

          const freshNormCodes = Array.from(
            new Set(freshCodes.map(normalizePartCode).filter(Boolean))
          );
          let freshWarehouseRows: WarehouseRow[] = [];
          if (freshNormCodes.length > 0) {
            const { data: recheckRows } = await supabase
              .from('warehouse_parts')
              .select('*')
              .in('part_code', freshNormCodes);
            if (Array.isArray(recheckRows) && recheckRows.length > 0) {
              freshWarehouseRows = recheckRows as WarehouseRow[];
            }
          }

          if (freshWarehouseRows.length > 0) {
            const { rows: enrichedFresh } = await enrichWarehouseRowsOnDemand(
              supabase,
              freshWarehouseRows
            );
            mergedResults = mapWarehouseRowsToResults(enrichedFresh, freshPhoto, freshUrl, rawQuery);
          } else {
            mergedResults = mapCatalogCandidatesToResults(
              cacheLookup.candidates,
              freshCodes,
              officialName,
              freshPhoto,
              freshUrl,
              rawQuery
            );
          }
        } else if (!sourceUrl) {
          sourceUrl = cacheLookup.catalogSearchUrl;
        }
      }

      if (mergedResults.length === 0) {
        const fallbackUrl =
          sourceUrl ||
          catalogSearchUrl ||
          buildCatalogSearchUrl(candidateCodes[0] || officialName);
        sourceUrl = fallbackUrl;
        const codesToShow = candidateCodes.length > 0 ? candidateCodes.slice(0, 3) : ['-'];
        mergedResults = codesToShow.map((displayCode, idx) => {
          const rackInfo = resolveAccessoryApparelRack({
            partCode: displayCode !== '-' ? displayCode : rawQuery,
            officialName,
            userQuery: rawQuery,
          });
          return {
            id: `catalog-${normalizePartCode(displayCode) || 'item'}-${idx}`,
            photoUrl: catalogPhotoUrl,
            officialName,
            partCode: displayCode,
            rackCode: rackInfo.suggestedRackCode || '-',
            isDummyRack: rackInfo.isDummyRack,
            rackZoneLabel: rackInfo.zoneLabel,
            itemGroup: rackInfo.itemGroup,
            price: null,
            priceSource: 'none',
            category: null,
            stock: null,
            minStock: null,
            stockKnown: false,
            substitutedBy: null,
            inWarehouse: false,
            stockStatus: 'belum_di_gudang',
            statusLabel: 'Belum ada di Honda Menara Agung Padang Panjang',
            sourceUrl: fallbackUrl,
          };
        });
      }
    }

    return jsonResponse(req, {
      isHondaPart: true,
      translatedQuery: officialName || rawQuery.toUpperCase(),
      originalQuery: rawQuery,
      source,
      confidence,
      catalogTier,
      sourceUrl,
      visualNotes,
      citations,
      results: mergedResults,
    });
  } catch (err) {
    const status = (err as { status?: number })?.status || 502;
    const retryAfterSeconds =
      (err as { retryAfterSeconds?: number })?.retryAfterSeconds || (status === 429 ? 120 : 30);
    const message =
      err instanceof Error
        ? err.message
        : 'Maaf, layanan AI sedang mengalami gangguan sementara.';
    return jsonResponse(
      req,
      {
        errorType: 'ai_error',
        message,
        retryAfterSeconds,
      },
      status
    );
  }
});
