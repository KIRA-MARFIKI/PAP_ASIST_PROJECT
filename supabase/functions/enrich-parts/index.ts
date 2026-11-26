import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  isStrongPartCodeMatch,
  lookupHondaCengkarengCatalog,
} from '../_shared/cengkarengCatalog.ts';

const MAX_BATCH_SIZE = 10;
const GEMINI_TIMEOUT_MS = 20_000;
const FALLBACK_FREE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
] as const;

interface PendingPartRow {
  part_code: string;
  part_code_display: string;
  official_name: string;
  price: number | null;
  price_source: 'warehouse' | 'cengkareng' | 'none';
  category: 'fast' | 'slow';
  substituted_by: string | null;
  photo_url: string | null;
  catalog_url: string | null;
  aliases: string[] | null;
  ai_enriched: boolean;
}

interface GeminiBatchItem {
  part_code: string;
  official_name?: string;
  category?: 'fast' | 'slow';
  aliases?: string[];
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

async function enrichBatchWithGemini(
  apiKey: string,
  preferredModel: string,
  rows: PendingPartRow[]
): Promise<{ items: Map<string, GeminiBatchItem>; failed: boolean; rateLimited: boolean }> {
  const resultMap = new Map<string, GeminiBatchItem>();
  if (!apiKey || rows.length === 0) {
    return { items: resultMap, failed: false, rateLimited: false };
  }

  const modelChain = Array.from(new Set([preferredModel, ...FALLBACK_FREE_MODELS]));
  let sawRateLimit = false;

  const inputItems = rows.map((r) => ({
    part_code: r.part_code,
    part_code_display: r.part_code_display,
    official_name: r.official_name,
    substituted_by: r.substituted_by,
  }));

  const systemPrompt = `Anda adalah spesialis suku cadang resmi motor Honda Indonesia (AHM) untuk gudang Honda Motor Padang Panjang.
Untuk setiap item dalam array input, berikan:
1. "official_name": nama resmi Honda dalam HURUF KAPITAL (jika input diawali "Kode Pengganti:", ubah ke nama resmi Honda yang tepat berdasarkan kode part / substituted_by).
2. "category": "fast" (fast moving seperti ban, kampas rem, busi, oli, filter, belt, roller, seal, gasket, rantai, kabel) atau "slow" (body, cover, knalpot, speedometer, fuel pump, lampu, rangka, kelistrikan khusus).
3. "aliases": 3 sampai 5 istilah sehari-hari bengkel Indonesia huruf kecil (contoh: "ban belakang beat", "kampas rem depan", "batang padi").

Balas HANYA JSON valid:
{
  "items": [
    {
      "part_code": "KODE_SAMA_PERSIS_INPUT",
      "official_name": "NAMA RESMI HONDA",
      "category": "fast" | "slow",
      "aliases": ["alias 1", "alias 2", "alias 3"]
    }
  ]
}`;

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
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              role: 'user',
              parts: [{ text: `Lengkapi batch suku cadang Honda berikut:\n${JSON.stringify(inputItems)}` }],
            },
          ],
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
        continue;
      }
      if (!res.ok) continue;

      const data = await res.json();
      const rawText =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => (typeof p?.text === 'string' ? p.text : ''))
          .join('\n') || '';

      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      if (start === -1 || end === -1) continue;

      const parsed = JSON.parse(rawText.slice(start, end + 1));
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      for (const item of items) {
        if (typeof item?.part_code === 'string') {
          resultMap.set(item.part_code.trim().toUpperCase(), {
            part_code: item.part_code.trim().toUpperCase(),
            official_name:
              typeof item.official_name === 'string'
                ? item.official_name.trim().toUpperCase()
                : undefined,
            category: item.category === 'fast' || item.category === 'slow' ? item.category : undefined,
            aliases: Array.isArray(item.aliases)
              ? item.aliases
                  .filter((a: unknown): a is string => typeof a === 'string' && a.trim().length >= 2)
                  .map((a: string) => a.trim().toLowerCase())
                  .slice(0, 6)
              : [],
          });
        }
      }
      return { items: resultMap, failed: false, rateLimited: false };
    } catch {
      // Coba model fallback berikutnya
    }
  }

  return { items: resultMap, failed: true, rateLimited: sawRateLimit };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Metode tidak didukung. Gunakan permintaan POST.' }, 405);
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
  const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const geminiApiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  const preferredModel = (Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite').trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse(req, { error: 'Konfigurasi server belum lengkap.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const accessToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  if (!accessToken) {
    return jsonResponse(req, { error: 'Sesi login admin tidak ditemukan.' }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return jsonResponse(req, { error: 'Sesi admin tidak valid atau sudah berakhir.' }, 401);
  }

  const { data: adminProfile } = await supabase
    .from('admin_profiles')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!adminProfile) {
    return jsonResponse(req, { error: 'Akses ditolak. Fitur ini khusus admin gudang.' }, 403);
  }

  let requestedBatch = MAX_BATCH_SIZE;
  try {
    const body = (await req.json()) as { batchSize?: number };
    if (typeof body?.batchSize === 'number' && Number.isFinite(body.batchSize)) {
      requestedBatch = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(body.batchSize)));
    }
  } catch {
    // Gunakan batchSize default 10
  }

  const { data: pendingRows, error: fetchErr } = await supabase
    .from('warehouse_parts')
    .select(
      'part_code, part_code_display, official_name, price, price_source, category, substituted_by, photo_url, catalog_url, aliases, ai_enriched'
    )
    .eq('ai_enriched', false)
    .order('updated_at', { ascending: true })
    .limit(requestedBatch);

  if (fetchErr) {
    return jsonResponse(
      req,
      { error: `Gagal membaca daftar part yang perlu dilengkapi (${fetchErr.message}).` },
      500
    );
  }

  const batch = (pendingRows || []) as PendingPartRow[];
  if (batch.length === 0) {
    return jsonResponse(req, {
      processed: 0,
      priceUpdated: 0,
      aliasesUpdated: 0,
      remainingPending: 0,
      details: [],
    });
  }

  // a. 1 panggilan batch Gemini Free Tier untuk seluruh batch sekaligus
  const aiResult = await enrichBatchWithGemini(geminiApiKey, preferredModel, batch);
  if (geminiApiKey && aiResult.failed) {
    return jsonResponse(
      req,
      {
        error: aiResult.rateLimited
          ? 'Layanan AI sedang mencapai batas kuota sementara. Coba lagi beberapa saat tanpa kehilangan antrean pengayaan.'
          : 'Layanan AI sedang mengalami gangguan sementara. Antrean pengayaan dipertahankan agar dapat dicoba ulang.',
      },
      aiResult.rateLimited ? 429 : 502
    );
  }

  const aiMap = aiResult.items;

  let priceUpdated = 0;
  let aliasesUpdated = 0;
  const details: Array<{
    partCode: string;
    officialName: string;
    priceUpdated: boolean;
    aliasesCount: number;
  }> = [];

  // b. Lookup Honda Cengkareng via modul bersama (Store API + HTML/JSON-LD) tanpa menimpa data gudang asli
  for (const row of batch) {
    const aiInfo = aiMap.get(row.part_code);
    const needsName = row.official_name.startsWith('Kode Pengganti:');
    const targetCodes = [row.substituted_by || '', row.part_code_display, row.part_code].filter(Boolean);
    const lookupRes = await lookupHondaCengkarengCatalog({
      partCodes: targetCodes,
      officialName: needsName ? aiInfo?.official_name : row.official_name,
      keywords: aiInfo?.aliases ?? [],
      maxResults: 2,
    });
    const best = lookupRes.candidates[0] || null;
    const codeVerified = best ? isStrongPartCodeMatch(best, targetCodes) : false;

    const existingAliases = Array.isArray(row.aliases) ? row.aliases : [];
    const newAliases = aiInfo?.aliases ?? [];
    const mergedAliases = Array.from(new Set([...existingAliases, ...newAliases]));

    const patch: Record<string, unknown> = {
      ai_enriched: true,
      aliases: mergedAliases,
    };

    let resolvedName = row.official_name;
    if (needsName) {
      if (aiInfo?.official_name && !aiInfo.official_name.startsWith('KODE PENGGANTI')) {
        resolvedName = aiInfo.official_name;
        patch.official_name = resolvedName;
      } else if (codeVerified && best?.title && best.title.length >= 4) {
        resolvedName = best.title.toUpperCase();
        patch.official_name = resolvedName;
      }
    }

    if (aiInfo?.category) {
      patch.category = aiInfo.category;
    }

    let didUpdatePrice = false;
    if (
      codeVerified &&
      (row.price === null || row.price_source === 'none') &&
      row.price_source !== 'warehouse' &&
      best &&
      best.priceIdr !== null
    ) {
      patch.price = best.priceIdr;
      patch.price_source = 'cengkareng';
      didUpdatePrice = true;
      priceUpdated += 1;
    }

    if (codeVerified && !row.photo_url && best?.photoUrl) {
      patch.photo_url = best.photoUrl;
    }
    if (!row.catalog_url && ((codeVerified && best?.url) || lookupRes.catalogSearchUrl)) {
      patch.catalog_url = (codeVerified && best?.url) || lookupRes.catalogSearchUrl;
    }

    if (mergedAliases.length > existingAliases.length) {
      aliasesUpdated += 1;
    }

    const { error: updateErr } = await supabase
      .from('warehouse_parts')
      .update(patch)
      .eq('part_code', row.part_code);

    if (updateErr) {
      continue;
    }

    details.push({
      partCode: row.part_code_display,
      officialName: resolvedName,
      priceUpdated: didUpdatePrice,
      aliasesCount: mergedAliases.length,
    });
  }

  const { count: remainingCount } = await supabase
    .from('warehouse_parts')
    .select('part_code', { count: 'exact', head: true })
    .eq('ai_enriched', false);

  return jsonResponse(req, {
    processed: details.length,
    priceUpdated,
    aliasesUpdated,
    remainingPending: remainingCount ?? 0,
    details,
  });
});
