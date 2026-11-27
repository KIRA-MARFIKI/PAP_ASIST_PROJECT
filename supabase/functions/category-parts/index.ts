import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  buildCatalogSearchUrl,
  CengkarengCandidate,
  formatHondaHyphenCode,
  isHttpUrl,
  normalizePartCode,
  searchCengkarengCatalogTerm,
} from '../_shared/cengkarengCatalog.ts';

const CACHE_TTL_HOURS = 24;
const MAX_PRODUCTS_PER_CATEGORY = 12;

type CategoryId = 'busi' | 'kampas_rem' | 'oli';
type SubCategoryTag = 'depan' | 'belakang' | 'oli_mesin' | 'oli_gardan' | null;

interface CachedCategoryProduct {
  title: string;
  partCode: string;
  normalizedCode: string;
  photoUrl: string | null;
  priceIdr: number | null;
  url: string;
  subType: SubCategoryTag;
}

interface WarehouseRow {
  part_code: string;
  part_code_display: string;
  official_name: string;
  rack_code: string;
  price: number | null;
  price_source: 'warehouse' | 'cengkareng' | 'none';
  category: 'fast' | 'slow';
  stock: number | null;
  min_stock: number | null;
  stock_known: boolean;
  substituted_by: string | null;
  catalog_url: string | null;
  photo_url: string | null;
}

interface CategoryPartResult {
  id: string;
  photoUrl: string | null;
  officialName: string;
  partCode: string;
  rackCode: string;
  price: number | null;
  priceSource: 'warehouse' | 'cengkareng' | 'none';
  stock: number | null;
  minStock: number | null;
  stockKnown: boolean;
  substitutedBy: string | null;
  inWarehouse: boolean;
  stockStatus: 'tersedia' | 'kritis' | 'tidak_tersedia' | 'belum_diatur' | 'belum_di_gudang';
  statusLabel: string | null;
  sourceUrl: string | null;
  subType: SubCategoryTag;
}

const CATEGORY_LABELS: Record<CategoryId, string> = {
  busi: 'Busi',
  kampas_rem: 'Kampas Rem Depan & Belakang',
  oli: 'Oli Mesin & Oli Gardan',
};

const VALID_CATEGORIES: readonly CategoryId[] = ['busi', 'kampas_rem', 'oli'];

function isCategoryId(value: string): value is CategoryId {
  return value === 'busi' || value === 'kampas_rem' || value === 'oli';
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

function isRelevantBusi(title: string): boolean {
  const hasSparkPlug = /\bspark\s*plug\b/i.test(title) || /^busi\b/i.test(title.trim());
  if (!hasSparkPlug) return false;
  const isAccessory =
    /\b(cover|kepala|pengecekan|lid|cap|tutup|kop|cangklong|kunci|wrench|socket|kabel|coil|koil|seal|packing|gasket|karet|rubber|bracket|holder|insulator)\b/i.test(
      title
    );
  return !isAccessory;
}

function classifyKampasRem(title: string, hint: 'depan' | 'belakang'): SubCategoryTag | null {
  const isBrakePadOrShoe =
    /\b(kampas\s*rem|kanvas\s*rem|pad\s*set|shoe\s*set|brake\s*pad|brake\s*shoe|dispad|disc\s*pad)\b/i.test(
      title
    );
  if (!isBrakePadOrShoe) return null;

  const isUnrelated =
    /\b(minyak\s*rem|brake\s*fluid|handle|handel|tuas|master\s*rem|selang\s*rem|kabel\s*rem|kaliper|caliper|piringan|pedal\s*rem|paha\s*rem|per\s*kampas|spring|piston|seal\s*kaliper)\b/i.test(
      title
    );
  if (isUnrelated) return null;

  const mentionsRear = /\b(belakang|rr\.?|rear|tromol|shoe\s*set)\b/i.test(title);
  const mentionsFront = /\b(depan|fr\.?|front)\b/i.test(title);

  if (mentionsRear && !mentionsFront) return 'belakang';
  if (mentionsFront && !mentionsRear) return 'depan';
  return hint;
}

function classifyOli(title: string, hint: 'oli_mesin' | 'oli_gardan'): SubCategoryTag | null {
  const isUnrelated =
    /\b(filter|saringan|tutup\s*oli|baut|drain|seal|sil|pompa|pump|selang|cooler|gasket|paking|rantai|chain\s*lube|minyak\s*rem|brake\s*fluid|coolant|air\s*radiator|shock|sok|bearing|laher|gigi)\b/i.test(
      title
    );
  if (isUnrelated) return null;

  const isGearOil = /\b(oli\s*gardan|gear\s*oil|transmission\s*gear\s*oil|transmisi)\b/i.test(title);
  if (isGearOil) return 'oli_gardan';

  const isEngineOil = /\b(oli\s*mesin|ahm\s*oil|mpx\s*[123]?|spx\s*[12]?|engine\s*oil|oli\s*ahm)\b/i.test(
    title
  );
  if (isEngineOil) return 'oli_mesin';

  if (/\boli\b/i.test(title)) {
    return hint;
  }
  return null;
}

function candidateToProduct(
  item: CengkarengCandidate,
  subType: SubCategoryTag
): CachedCategoryProduct | null {
  const title = item.title.trim();
  const url = isHttpUrl(item.url) ? item.url.trim() : '';
  if (!title) return null;

  const rawCode = item.partCodes[0] || '';
  const normalizedCode = normalizePartCode(rawCode);
  const displayCode = normalizedCode ? formatHondaHyphenCode(normalizedCode) : '-';

  return {
    title: title.toUpperCase(),
    partCode: displayCode,
    normalizedCode,
    photoUrl: isHttpUrl(item.photoUrl) ? item.photoUrl.trim() : null,
    priceIdr: item.priceIdr,
    url,
    subType,
  };
}

function dedupeKey(item: CachedCategoryProduct): string {
  if (item.normalizedCode.length >= 6) {
    return `code:${item.normalizedCode}`;
  }
  if (item.url) {
    return `url:${item.url.toLowerCase()}`;
  }
  return `title:${item.title.toLowerCase()}`;
}

async function scrapeCategoryFresh(category: CategoryId): Promise<{
  products: CachedCategoryProduct[];
  tierUsed: string;
}> {
  let tierUsed = 'none';

  if (category === 'busi') {
    const collected: CachedCategoryProduct[] = [];
    const seen = new Set<string>();

    for (const term of ['spark plug', 'busi ngk', 'busi denso']) {
      if (collected.length >= MAX_PRODUCTS_PER_CATEGORY) break;
      const res = await searchCengkarengCatalogTerm(term, 14);
      if (res.tierUsed !== 'none' && tierUsed === 'none') tierUsed = res.tierUsed;
      for (const c of res.candidates) {
        if (!isRelevantBusi(c.title)) continue;
        const prod = candidateToProduct(c, null);
        if (!prod) continue;
        const key = dedupeKey(prod);
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(prod);
        if (collected.length >= MAX_PRODUCTS_PER_CATEGORY) break;
      }
    }

    return { products: collected.slice(0, MAX_PRODUCTS_PER_CATEGORY), tierUsed };
  }

  if (category === 'kampas_rem') {
    const frontItems: CachedCategoryProduct[] = [];
    const rearItems: CachedCategoryProduct[] = [];
    const seen = new Set<string>();

    const frontQueries = ['kampas rem depan', 'pad set fr'];
    const rearQueries = ['kampas rem belakang', 'shoe set brake'];

    const [frontResults, rearResults] = await Promise.all([
      Promise.all(frontQueries.map((q) => searchCengkarengCatalogTerm(q, 10))),
      Promise.all(rearQueries.map((q) => searchCengkarengCatalogTerm(q, 10))),
    ]);

    for (const res of frontResults) {
      if (res.tierUsed !== 'none' && tierUsed === 'none') tierUsed = res.tierUsed;
      for (const c of res.candidates) {
        const subType = classifyKampasRem(c.title, 'depan');
        if (!subType) continue;
        const prod = candidateToProduct(c, subType);
        if (!prod) continue;
        const key = dedupeKey(prod);
        if (seen.has(key)) continue;
        seen.add(key);
        if (subType === 'belakang') rearItems.push(prod);
        else frontItems.push(prod);
      }
    }

    for (const res of rearResults) {
      if (res.tierUsed !== 'none' && tierUsed === 'none') tierUsed = res.tierUsed;
      for (const c of res.candidates) {
        const subType = classifyKampasRem(c.title, 'belakang');
        if (!subType) continue;
        const prod = candidateToProduct(c, subType);
        if (!prod) continue;
        const key = dedupeKey(prod);
        if (seen.has(key)) continue;
        seen.add(key);
        if (subType === 'depan') frontItems.push(prod);
        else rearItems.push(prod);
      }
    }

    const merged: CachedCategoryProduct[] = [];
    const frontSlice = frontItems.slice(0, 6);
    const rearSlice = rearItems.slice(0, 6);
    merged.push(...frontSlice, ...rearSlice);

    if (merged.length < MAX_PRODUCTS_PER_CATEGORY) {
      const extras = [...frontItems.slice(6), ...rearItems.slice(6)];
      for (const extra of extras) {
        if (merged.length >= MAX_PRODUCTS_PER_CATEGORY) break;
        merged.push(extra);
      }
    }

    return { products: merged.slice(0, MAX_PRODUCTS_PER_CATEGORY), tierUsed };
  }

  // category === 'oli' (Oli Mesin & Oli Gardan)
  const engineItems: CachedCategoryProduct[] = [];
  const gearItems: CachedCategoryProduct[] = [];
  const seen = new Set<string>();

  const [engineResults, gearResults] = await Promise.all([
    Promise.all(['ahm oil mpx', 'ahm oil spx', 'oli mesin ahm'].map((q) => searchCengkarengCatalogTerm(q, 10))),
    Promise.all(['oli gardan', 'transmission gear oil'].map((q) => searchCengkarengCatalogTerm(q, 10))),
  ]);

  for (const res of engineResults) {
    if (res.tierUsed !== 'none' && tierUsed === 'none') tierUsed = res.tierUsed;
    for (const c of res.candidates) {
      const subType = classifyOli(c.title, 'oli_mesin');
      if (!subType) continue;
      const prod = candidateToProduct(c, subType);
      if (!prod) continue;
      const key = dedupeKey(prod);
      if (seen.has(key)) continue;
      seen.add(key);
      if (subType === 'oli_gardan') gearItems.push(prod);
      else engineItems.push(prod);
    }
  }

  for (const res of gearResults) {
    if (res.tierUsed !== 'none' && tierUsed === 'none') tierUsed = res.tierUsed;
    for (const c of res.candidates) {
      const subType = classifyOli(c.title, 'oli_gardan');
      if (!subType) continue;
      const prod = candidateToProduct(c, subType);
      if (!prod) continue;
      const key = dedupeKey(prod);
      if (seen.has(key)) continue;
      seen.add(key);
      if (subType === 'oli_mesin') engineItems.push(prod);
      else gearItems.push(prod);
    }
  }

  const merged: CachedCategoryProduct[] = [];
  const engineSlice = engineItems.slice(0, 8);
  const gearSlice = gearItems.slice(0, 4);
  merged.push(...engineSlice, ...gearSlice);

  if (merged.length < MAX_PRODUCTS_PER_CATEGORY) {
    const extras = [...engineItems.slice(8), ...gearItems.slice(4)];
    for (const extra of extras) {
      if (merged.length >= MAX_PRODUCTS_PER_CATEGORY) break;
      merged.push(extra);
    }
  }

  return { products: merged.slice(0, MAX_PRODUCTS_PER_CATEGORY), tierUsed };
}

function parseCachedProducts(raw: unknown): CachedCategoryProduct[] {
  if (!Array.isArray(raw)) return [];
  const parsed: CachedCategoryProduct[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    if (!title) continue;
    const partCode = typeof obj.partCode === 'string' ? obj.partCode.trim() : '-';
    const normalizedCode =
      typeof obj.normalizedCode === 'string'
        ? obj.normalizedCode.trim()
        : normalizePartCode(partCode);
    const photoUrl = isHttpUrl(obj.photoUrl) ? obj.photoUrl.trim() : null;
    const priceIdr =
      typeof obj.priceIdr === 'number' && Number.isFinite(obj.priceIdr) && obj.priceIdr > 0
        ? obj.priceIdr
        : null;
    const url = isHttpUrl(obj.url) ? obj.url.trim() : '';
    const subType: SubCategoryTag =
      obj.subType === 'depan' ||
      obj.subType === 'belakang' ||
      obj.subType === 'oli_mesin' ||
      obj.subType === 'oli_gardan'
        ? obj.subType
        : null;

    parsed.push({
      title,
      partCode,
      normalizedCode,
      photoUrl,
      priceIdr,
      url,
      subType,
    });
  }
  return parsed;
}

async function getOrScrapeCategoryProducts(
  supabase: SupabaseClient,
  category: CategoryId
): Promise<{
  products: CachedCategoryProduct[];
  fromCache: boolean;
  tierUsed: string;
}> {
  const cacheKey = `category:${category}`;
  const cutoffIso = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const { data: cached } = await supabase
    .from('catalog_cache')
    .select('citations, cached_at')
    .eq('query_normalized', cacheKey)
    .gte('cached_at', cutoffIso)
    .maybeSingle();

  if (cached) {
    const parsedProducts = parseCachedProducts(cached.citations);
    const allValid =
      parsedProducts.length > 0 &&
      (category !== 'busi' || parsedProducts.every((p) => isRelevantBusi(p.title)));
    if (allValid) {
      return { products: parsedProducts, fromCache: true, tierUsed: 'catalog-cache' };
    }
  }

  const scraped = await scrapeCategoryFresh(category);
  if (scraped.products.length > 0) {
    const firstPhoto = scraped.products.find((p) => p.photoUrl)?.photoUrl ?? null;
    const firstUrl =
      scraped.products.find((p) => p.url)?.url ??
      buildCatalogSearchUrl(CATEGORY_LABELS[category]);
    const partCodes = scraped.products.map((p) => p.partCode).filter((c) => c !== '-');

    await supabase.from('catalog_cache').upsert(
      {
        query_normalized: cacheKey,
        official_name: CATEGORY_LABELS[category],
        part_codes: partCodes,
        catalog_photo_url: firstPhoto,
        source_url: firstUrl,
        citations: scraped.products,
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'query_normalized' }
    );
  }

  return {
    products: scraped.products,
    fromCache: false,
    tierUsed: scraped.tierUsed,
  };
}

async function crossCheckWithWarehouse(
  supabase: SupabaseClient,
  products: CachedCategoryProduct[]
): Promise<CategoryPartResult[]> {
  const normCodes = Array.from(
    new Set(products.map((p) => p.normalizedCode).filter((c) => c.length >= 5))
  );

  const warehouseByCode = new Map<string, WarehouseRow>();

  if (normCodes.length > 0) {
    const [directRes, subRes] = await Promise.all([
      supabase
        .from('warehouse_parts')
        .select(
          'part_code, part_code_display, official_name, rack_code, price, price_source, category, stock, min_stock, stock_known, substituted_by, catalog_url, photo_url'
        )
        .in('part_code', normCodes),
      supabase
        .from('warehouse_parts')
        .select(
          'part_code, part_code_display, official_name, rack_code, price, price_source, category, stock, min_stock, stock_known, substituted_by, catalog_url, photo_url'
        )
        .in('substituted_by', normCodes),
    ]);

    for (const row of (directRes.data ?? []) as WarehouseRow[]) {
      warehouseByCode.set(row.part_code, row);
    }
    for (const row of (subRes.data ?? []) as WarehouseRow[]) {
      if (row.substituted_by && !warehouseByCode.has(row.substituted_by)) {
        warehouseByCode.set(row.substituted_by, row);
      }
    }
  }

  return products.map((item, idx) => {
    const warehouse = item.normalizedCode ? warehouseByCode.get(item.normalizedCode) : undefined;

    if (warehouse) {
      const dbPrice =
        warehouse.price !== null && warehouse.price !== undefined ? Number(warehouse.price) : null;
      const hasWarehousePrice =
        dbPrice !== null && dbPrice > 0 && warehouse.price_source === 'warehouse';

      const finalPrice = hasWarehousePrice
        ? dbPrice
        : item.priceIdr !== null
          ? item.priceIdr
          : dbPrice !== null && dbPrice > 0
            ? dbPrice
            : null;

      const finalPriceSource: 'warehouse' | 'cengkareng' | 'none' = hasWarehousePrice
        ? 'warehouse'
        : finalPrice !== null
          ? 'cengkareng'
          : 'none';

      const stockKnown = Boolean(warehouse.stock_known);

      return {
        id: `cat-${warehouse.part_code}-${idx}`,
        photoUrl: warehouse.photo_url || item.photoUrl,
        officialName: warehouse.official_name || item.title,
        partCode: warehouse.part_code_display || item.partCode,
        rackCode: warehouse.rack_code || '-',
        price: finalPrice,
        priceSource: finalPriceSource,
        stock: stockKnown ? warehouse.stock : null,
        minStock: stockKnown ? warehouse.min_stock : null,
        stockKnown,
        substitutedBy: warehouse.substituted_by ?? null,
        inWarehouse: true,
        stockStatus: computeStockStatus(warehouse.stock, warehouse.min_stock, stockKnown),
        statusLabel: null,
        sourceUrl: warehouse.catalog_url || item.url || null,
        subType: item.subType,
      };
    }

    return {
      id: `cat-${item.normalizedCode || 'item'}-${idx}`,
      photoUrl: item.photoUrl,
      officialName: item.title,
      partCode: item.partCode,
      rackCode: '-',
      price: item.priceIdr,
      priceSource: item.priceIdr !== null ? 'cengkareng' : 'none',
      stock: null,
      minStock: null,
      stockKnown: false,
      substitutedBy: null,
      inWarehouse: false,
      stockStatus: 'belum_di_gudang',
      statusLabel: 'Belum ada di Honda Menara Agung Padang Panjang',
      sourceUrl: item.url || buildCatalogSearchUrl(item.partCode !== '-' ? item.partCode : item.title),
      subType: item.subType,
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse(req, { error: 'Metode tidak didukung. Gunakan GET atau POST.' }, 405);
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
  const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse(req, { error: 'Konfigurasi server database belum lengkap.' }, 500);
  }

  let requestedCategory = '';
  if (req.method === 'GET') {
    const url = new URL(req.url);
    requestedCategory = (url.searchParams.get('category') || '').trim().toLowerCase();
  } else {
    try {
      const body = (await req.json()) as { category?: unknown };
      requestedCategory =
        typeof body?.category === 'string' ? body.category.trim().toLowerCase() : '';
    } catch {
      return jsonResponse(req, { error: 'Format data JSON tidak valid.' }, 400);
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  if (requestedCategory === 'thumbnails') {
    try {
      const entries = await Promise.all(
        VALID_CATEGORIES.map(async (cat) => {
          const { products } = await getOrScrapeCategoryProducts(supabase, cat);
          const photoUrl = products.find((p) => p.photoUrl)?.photoUrl ?? null;
          return [cat, { photoUrl, count: products.length }] as const;
        })
      );

      return jsonResponse(req, {
        thumbnails: Object.fromEntries(entries),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat thumbnail kategori.';
      return jsonResponse(req, { error: msg }, 502);
    }
  }

  if (!isCategoryId(requestedCategory)) {
    return jsonResponse(
      req,
      {
        error:
          'Kategori tidak tersedia. Hanya Busi, Kampas Rem Depan & Belakang, serta Oli Mesin & Oli Gardan yang didukung.',
      },
      400
    );
  }

  try {
    const { products, fromCache, tierUsed } = await getOrScrapeCategoryProducts(
      supabase,
      requestedCategory
    );
    const results = await crossCheckWithWarehouse(supabase, products);

    return jsonResponse(req, {
      category: requestedCategory,
      categoryLabel: CATEGORY_LABELS[requestedCategory],
      fromCache,
      catalogTier: tierUsed,
      count: results.length,
      results,
    });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Gagal mengambil data kategori dari katalog Honda Cengkareng.';
    return jsonResponse(req, { error: msg }, 502);
  }
});
