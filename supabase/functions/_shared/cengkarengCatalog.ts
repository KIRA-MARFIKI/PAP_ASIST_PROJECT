/**
 * Shared fault-tolerant catalog lookup module for hondacengkareng.com.
 * Used by both `search-part` and `enrich-parts` Edge Functions.
 *
 * Extraction pipeline:
 * - Tier 1: Official public WooCommerce Store API (`/wp-json/wc/store/v1/products`, fallback `/wp-json/wc/store/products`)
 * - Tier 2: Direct HTML product search + JSON-LD & entity-cleaned WooCommerce price parser (with optional 1 detail page fetch)
 * - Honesty rule: Never fabricates or guesses a Rupiah price. Always returns `catalogSearchUrl` for 1-click user verification.
 */

const FETCH_TIMEOUT_MS = 8000;
const DETAIL_TIMEOUT_MS = 5000;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

export type SideHint = 'right' | 'left' | 'front' | 'rear' | null;

export interface CengkarengCandidate {
  title: string;
  partCodes: string[];
  url: string;
  photoUrl: string | null;
  priceIdr: number | null;
}

export interface CengkarengLookupResult {
  candidates: CengkarengCandidate[];
  tierUsed: 'wc-store-v1' | 'wc-store-legacy' | 'html-jsonld' | 'none';
  httpStatus: number;
  catalogSearchUrl: string;
  queryUsed: string;
}

export interface CengkarengLookupOptions {
  partCodes?: string[];
  officialName?: string;
  keywords?: string[];
  modelHint?: string | null;
  sideHint?: SideHint;
  maxResults?: number;
}

export function normalizePartCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatHondaHyphenCode(code: string): string {
  const norm = normalizePartCode(code);
  const match = norm.match(/^([A-Z0-9]{5})([A-Z0-9]{3})([A-Z0-9]{2,})$/);
  if (!match) return norm;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function buildCatalogSearchUrl(term: string): string {
  const clean = term.trim() || 'honda';
  return `https://www.hondacengkareng.com/?s=${encodeURIComponent(clean)}&post_type=product`;
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#82;&#112;/gi, 'Rp')
    .replace(/&#160;|&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/gi, '-')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const cp = Number.parseInt(dec, 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHttpUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed);
}

export function isStrongPartCodeMatch(
  candidate: CengkarengCandidate,
  targetCodes: string[]
): boolean {
  const normalizedTargets = targetCodes.map(normalizePartCode).filter((c) => c.length >= 8);
  if (normalizedTargets.length === 0) return false;

  const candidateCodes = candidate.partCodes.map(normalizePartCode).filter(Boolean);
  for (const target of normalizedTargets) {
    if (candidateCodes.includes(target)) return true;
    const modelPrefix = target.slice(0, 8);
    if (candidateCodes.some((code) => code.length >= 8 && code.startsWith(modelPrefix))) {
      return true;
    }
  }
  return false;
}

export function extractHondaPartCodes(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const hyphenMatches = text.match(/\b[0-9A-Z]{5}-[0-9A-Z]{3}-[0-9A-Z]{2,5}\b/gi) || [];
  for (const m of hyphenMatches) {
    const clean = m.toUpperCase();
    const norm = normalizePartCode(clean);
    if (norm.length >= 10 && !seen.has(norm)) {
      seen.add(norm);
      found.push(clean);
    }
  }

  const compactMatches = text.match(/\b[0-9]{4,5}[A-Z0-9]{5,10}\b/gi) || [];
  for (const m of compactMatches) {
    const clean = m.toUpperCase();
    const norm = normalizePartCode(clean);
    if (norm.length >= 10 && /[A-Z]/.test(norm) && /[0-9]/.test(norm) && !seen.has(norm)) {
      seen.add(norm);
      found.push(formatHondaHyphenCode(norm));
    }
  }

  return found.slice(0, 4);
}

function parsePriceAmount(raw: unknown, minorUnit = 0): number | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const divisor = minorUnit > 0 ? Math.pow(10, minorUnit) : 1;
    const adjusted = Math.round(raw / divisor);
    return adjusted >= 500 && adjusted <= 50_000_000 ? adjusted : null;
  }

  let text = String(raw).trim();
  if (!text) return null;

  // Saat minorUnit = 0 (mis. JSON-LD "125000.00" atau HTML "125.000,00"), buang 1-2 digit desimal di akhir agar tidak dikali 100.
  if (minorUnit === 0) {
    text = text.replace(/[.,]\d{1,2}$/, '');
  }

  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const rawNum = Number(digits);
  if (!Number.isFinite(rawNum) || rawNum <= 0) return null;

  const divisor = minorUnit > 0 ? Math.pow(10, minorUnit) : 1;
  const adjusted = Math.round(rawNum / divisor);
  if (adjusted >= 500 && adjusted <= 50_000_000) {
    return adjusted;
  }
  return null;
}

function extractIdrPriceFromHtml(html: string): number | null {
  // Prioritaskan harga diskon aktif (<ins>) bila ada
  const insMatch = html.match(/<ins[^>]*>([\s\S]*?)<\/ins>/i);
  if (insMatch?.[1]) {
    const insText = decodeHtmlEntities(insMatch[1]);
    const insPrice = insText.match(/Rp\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,8})/i);
    if (insPrice?.[1]) {
      const parsed = parsePriceAmount(insPrice[1], 0);
      if (parsed !== null) return parsed;
    }
  }

  // Buang harga coret (<del>) agar tidak terbaca sebagai harga aktif
  const htmlWithoutDel = html.replace(/<del[^>]*>[\s\S]*?<\/del>/gi, ' ');

  // WooCommerce modern membungkus angka harga di dalam <bdi><span class="woocommerce-Price-currencySymbol">Rp</span>&nbsp;125.000</bdi>
  const wooBdiMatch = htmlWithoutDel.match(
    /woocommerce-Price-amount[^>]*>\s*<bdi[^>]*>([\s\S]{0,220}?)<\/bdi>/i
  );
  if (wooBdiMatch?.[1]) {
    const wooText = decodeHtmlEntities(wooBdiMatch[1]);
    const wooPrice = wooText.match(/Rp\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,8})/i);
    if (wooPrice?.[1]) {
      const parsed = parsePriceAmount(wooPrice[1], 0);
      if (parsed !== null) return parsed;
    }
  }

  const wooMatch = htmlWithoutDel.match(/woocommerce-Price-amount[^>]*>([\s\S]{0,180}?)<\/span>/i);
  if (wooMatch?.[1]) {
    const wooText = decodeHtmlEntities(wooMatch[1]);
    const wooPrice = wooText.match(/Rp\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,8})/i);
    if (wooPrice?.[1]) {
      const parsed = parsePriceAmount(wooPrice[1], 0);
      if (parsed !== null) return parsed;
    }
  }

  const plain = decodeHtmlEntities(htmlWithoutDel);
  const genericMatches = plain.match(/Rp\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,8})/gi);
  if (genericMatches) {
    for (const raw of genericMatches) {
      const parsed = parsePriceAmount(raw, 0);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function isChallengeHtml(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes('just a moment') ||
    lower.includes('cf-browser-verification') ||
    lower.includes('attention required') ||
    lower.includes('error 403 forbidden')
  );
}

function scoreCandidateRelevance(
  candidate: CengkarengCandidate,
  modelHint: string | null,
  sideHint: SideHint,
  targetCodes: string[]
): number {
  let score = 0;
  const upperTitle = candidate.title.toUpperCase();
  const candidateNormCodes = candidate.partCodes.map(normalizePartCode);

  for (const target of targetCodes) {
    const normTarget = normalizePartCode(target);
    if (!normTarget) continue;
    if (candidateNormCodes.includes(normTarget)) {
      score += 20;
    } else if (
      normTarget.length >= 8 &&
      candidateNormCodes.some((c) => c.startsWith(normTarget.slice(0, 8)))
    ) {
      score += 8;
    }
  }

  if (modelHint) {
    const modelTokens = modelHint
      .toUpperCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    for (const tok of modelTokens) {
      if (upperTitle.includes(tok)) score += 3;
    }
  }

  if (sideHint === 'right') {
    if (/\b(R\.?|RH|KANAN|RIGHT)\b/.test(upperTitle)) score += 5;
    if (/\b(L\.?|LH|KIRI|LEFT)\b/.test(upperTitle)) score -= 3;
  } else if (sideHint === 'left') {
    if (/\b(L\.?|LH|KIRI|LEFT)\b/.test(upperTitle)) score += 5;
    if (/\b(R\.?|RH|KANAN|RIGHT)\b/.test(upperTitle)) score -= 3;
  } else if (sideHint === 'front') {
    if (/\b(FR\.?|FRONT|DEPAN)\b/.test(upperTitle)) score += 4;
    if (/\b(RR\.?|REAR|BELAKANG)\b/.test(upperTitle)) score -= 2;
  } else if (sideHint === 'rear') {
    if (/\b(RR\.?|REAR|BELAKANG)\b/.test(upperTitle)) score += 4;
    if (/\b(FR\.?|FRONT|DEPAN)\b/.test(upperTitle)) score -= 2;
  }

  if (candidate.priceIdr !== null) score += 2;
  if (candidate.photoUrl) score += 1;

  return score;
}

function cleanOfficialNameForSearch(name: string): string {
  return name
    .replace(/[.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchTerms(options: CengkarengLookupOptions): {
  exactSkus: string[];
  terms: string[];
} {
  const exactSkus: string[] = [];
  const seenSku = new Set<string>();
  const terms: string[] = [];
  const seenTerm = new Set<string>();

  const pushTerm = (value: string) => {
    const clean = value.trim().replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    if (clean.length >= 2 && !seenTerm.has(key)) {
      seenTerm.add(key);
      terms.push(clean);
    }
  };

  for (const rawCode of options.partCodes ?? []) {
    const norm = normalizePartCode(rawCode);
    if (norm.length >= 9 && !seenSku.has(norm)) {
      seenSku.add(norm);
      exactSkus.push(norm);
    }
  }

  // 1. Prefix 8-karakter keluarga motor Honda dari SKU utama (mis. 83550K60, 51410K1A)
  const firstSku = exactSkus[0];
  const secondSku = exactSkus[1];
  if (firstSku && firstSku.length >= 8) {
    pushTerm(firstSku.slice(0, 8));
  }

  // 2. Nama resmi bersih tanpa tanda baca (mis. PIPE COMP FR FORK)
  if (options.officialName) {
    const cleanedOfficial = cleanOfficialNameForSearch(options.officialName);
    if (options.modelHint) {
      pushTerm(`${cleanedOfficial} ${options.modelHint}`);
    }
    pushTerm(cleanedOfficial);
  }

  // 3. Keyword bahasa Indonesia + model hint (maks 2 keyword)
  for (const kw of (options.keywords ?? []).slice(0, 2)) {
    pushTerm(kw);
  }

  // 4. Prefix 8-karakter SKU kedua bila berbeda
  if (secondSku && secondSku.length >= 8) {
    pushTerm(secondSku.slice(0, 8));
  }

  // 5. Prefix 5-karakter grup part Honda sebagai fallback terakhir bila semua kosong
  if (firstSku && firstSku.length >= 5) {
    pushTerm(firstSku.slice(0, 5));
  }

  return {
    exactSkus: exactSkus.slice(0, 2),
    terms: terms.slice(0, 6),
  };
}

interface WcStoreProduct {
  name?: string;
  sku?: string;
  permalink?: string;
  prices?: {
    price?: string | number;
    sale_price?: string | number;
    regular_price?: string | number;
    currency_minor_unit?: number;
  };
  images?: Array<{ src?: string }>;
}

function mapWcStoreProducts(items: WcStoreProduct[]): CengkarengCandidate[] {
  const candidates: CengkarengCandidate[] = [];
  for (const item of items) {
    const title = decodeHtmlEntities(String(item?.name || ''));
    const url = typeof item?.permalink === 'string' ? item.permalink.trim() : '';
    if (!title && !url) continue;

    const minorUnit =
      typeof item?.prices?.currency_minor_unit === 'number'
        ? item.prices.currency_minor_unit
        : 0;
    const priceIdr =
      parsePriceAmount(item?.prices?.price, minorUnit) ??
      parsePriceAmount(item?.prices?.sale_price, minorUnit) ??
      parsePriceAmount(item?.prices?.regular_price, minorUnit);

    const rawSku = typeof item?.sku === 'string' ? item.sku.trim() : '';
    const extracted = extractHondaPartCodes(`${rawSku} ${title} ${url}`);
    const partCodes = rawSku
      ? Array.from(new Set([formatHondaHyphenCode(rawSku), ...extracted]))
      : extracted;

    const imgSrc = item?.images?.[0]?.src;
    const photoUrl = typeof imgSrc === 'string' && imgSrc.startsWith('http') ? imgSrc.trim() : null;

    candidates.push({
      title: title || rawSku,
      partCodes: partCodes.slice(0, 3),
      url,
      photoUrl,
      priceIdr,
    });
  }
  return candidates;
}

async function queryWcStoreApi(
  paramKey: 'sku' | 'search',
  value: string,
  perPage = 5
): Promise<{
  candidates: CengkarengCandidate[];
  tier: 'wc-store-v1' | 'wc-store-legacy' | null;
  status: number;
}> {
  const safePerPage = Math.max(1, Math.min(20, Math.floor(perPage)));
  const endpoints: Array<{ url: string; tier: 'wc-store-v1' | 'wc-store-legacy' }> = [
    {
      url: `https://www.hondacengkareng.com/wp-json/wc/store/v1/products?${paramKey}=${encodeURIComponent(
        value
      )}&per_page=${safePerPage}`,
      tier: 'wc-store-v1',
    },
    {
      url: `https://www.hondacengkareng.com/wp-json/wc/store/products?${paramKey}=${encodeURIComponent(
        value
      )}&per_page=${safePerPage}`,
      tier: 'wc-store-legacy',
    },
  ];

  let lastStatus = 0;

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: 'GET',
        headers: {
          ...BROWSER_HEADERS,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      lastStatus = res.status;
      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data)) continue;

      const mapped = mapWcStoreProducts(data as WcStoreProduct[]);
      if (mapped.length > 0) {
        return { candidates: mapped, tier: ep.tier, status: res.status };
      }
      // Endpoint v1 merespons 200 dengan array kosong -> tidak perlu ulang ke legacy
      return { candidates: [], tier: ep.tier, status: res.status };
    } catch {
      lastStatus = 0;
    }
  }

  return { candidates: [], tier: null, status: lastStatus };
}

function extractCandidatesFromJsonLd(html: string): CengkarengCandidate[] {
  const candidates: CengkarengCandidate[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  const processNode = (node: Record<string, unknown>) => {
    const typeVal = node['@type'];
    const types = Array.isArray(typeVal) ? typeVal : [typeVal];

    if (types.includes('Product')) {
      const title = decodeHtmlEntities(String(node.name || ''));
      const url = isHttpUrl(node.url) ? node.url.trim() : '';
      const sku = typeof node.sku === 'string' ? node.sku.trim() : '';
      const imageVal = node.image;
      const extractImageUrl = (val: unknown): string | null => {
        if (isHttpUrl(val)) return val.trim();
        if (val && typeof val === 'object' && 'url' in val) {
          const objUrl = (val as { url?: unknown }).url;
          if (isHttpUrl(objUrl)) return objUrl.trim();
        }
        return null;
      };
      const photoUrl = Array.isArray(imageVal)
        ? extractImageUrl(imageVal[0])
        : extractImageUrl(imageVal);
      const offers = node.offers as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
      const firstOffer = Array.isArray(offers) ? offers[0] : offers;
      const priceIdr =
        parsePriceAmount(firstOffer?.price, 0) ??
        parsePriceAmount(firstOffer?.lowPrice, 0);

      if (title || url) {
        const codes = extractHondaPartCodes(`${sku} ${title} ${url}`);
        candidates.push({
          title: title || sku,
          partCodes: sku ? Array.from(new Set([formatHondaHyphenCode(sku), ...codes])) : codes,
          url,
          photoUrl,
          priceIdr,
        });
      }
      return;
    }

    if (types.includes('ItemList') && Array.isArray(node.itemListElement)) {
      for (const el of node.itemListElement as Array<Record<string, unknown>>) {
        const inner = (el.item as Record<string, unknown>) || el;
        if (inner && typeof inner === 'object') {
          processNode(inner);
        }
      }
    }

    if (Array.isArray(node['@graph'])) {
      for (const g of node['@graph'] as Array<Record<string, unknown>>) {
        if (g && typeof g === 'object') processNode(g);
      }
    }
  };

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') processNode(item as Record<string, unknown>);
        }
      } else if (parsed && typeof parsed === 'object') {
        processNode(parsed as Record<string, unknown>);
      }
    } catch {
      // Abaikan JSON-LD yang tidak valid
    }
  }

  return candidates;
}

async function fetchDetailPageMeta(url: string): Promise<{
  priceIdr: number | null;
  photoUrl: string | null;
  partCodes: string[];
}> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...BROWSER_HEADERS, Accept: 'text/html' },
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    });
    if (!res.ok) return { priceIdr: null, photoUrl: null, partCodes: [] };
    const html = await res.text();
    if (isChallengeHtml(html)) return { priceIdr: null, photoUrl: null, partCodes: [] };

    const jsonLd = extractCandidatesFromJsonLd(html)[0];
    const ogImg =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
      null;

    return {
      priceIdr: jsonLd?.priceIdr ?? extractIdrPriceFromHtml(html),
      photoUrl: jsonLd?.photoUrl ?? (ogImg && ogImg.startsWith('http') ? ogImg.trim() : null),
      partCodes: jsonLd?.partCodes ?? extractHondaPartCodes(decodeHtmlEntities(html)),
    };
  } catch {
    return { priceIdr: null, photoUrl: null, partCodes: [] };
  }
}

async function queryHtmlSearchFallback(term: string, maxItems = 5): Promise<{
  candidates: CengkarengCandidate[];
  status: number;
}> {
  const url = buildCatalogSearchUrl(term);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...BROWSER_HEADERS, Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { candidates: [], status: res.status };
    }

    const html = await res.text();
    if (isChallengeHtml(html)) {
      return { candidates: [], status: 403 };
    }

    // a. JSON-LD terstruktur terlebih dahulu
    let candidates = extractCandidatesFromJsonLd(html);

    // b. Parsing kartu produk WooCommerce (<li class="product ...">)
    if (candidates.length === 0) {
      const seenUrls = new Set<string>();
      const productBlockRegex = /<li[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
      let blockMatch: RegExpExecArray | null;

      while ((blockMatch = productBlockRegex.exec(html)) !== null && candidates.length < maxItems) {
        const block = blockMatch[1];
        const linkMatch = block.match(
          /href=["'](https?:\/\/(?:www\.)?hondacengkareng\.com\/(?:produk|product)\/[^"'#?]+)["']/i
        );
        const prodUrl = linkMatch?.[1]?.trim() || '';
        if (!prodUrl || seenUrls.has(prodUrl)) continue;

        const titleRaw =
          block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ||
          block.match(/title=["']([^"']+)["']/i)?.[1] ||
          '';
        const title = decodeHtmlEntities(titleRaw);
        if (!title) continue;

        const imgMatch =
          block.match(/data-src=["'](https?:\/\/[^"']+)["']/i)?.[1] ||
          block.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i)?.[1] ||
          null;
        const priceIdr = extractIdrPriceFromHtml(block);

        seenUrls.add(prodUrl);
        candidates.push({
          title,
          partCodes: extractHondaPartCodes(`${title} ${decodeHtmlEntities(block)} ${prodUrl}`),
          url: prodUrl,
          photoUrl: imgMatch,
          priceIdr,
        });
      }
    }

    // 1 follow-up halaman detail produk teratas bila harga atau foto belum ada di listing
    if (candidates.length > 0 && candidates[0].url && (candidates[0].priceIdr === null || !candidates[0].photoUrl)) {
      const detail = await fetchDetailPageMeta(candidates[0].url);
      if (candidates[0].priceIdr === null) candidates[0].priceIdr = detail.priceIdr;
      if (!candidates[0].photoUrl) candidates[0].photoUrl = detail.photoUrl;
      if (candidates[0].partCodes.length === 0 && detail.partCodes.length > 0) {
        candidates[0].partCodes = detail.partCodes;
      }
    }

    return { candidates, status: res.status };
  } catch {
    return { candidates: [], status: 0 };
  }
}

export async function lookupHondaCengkarengCatalog(
  options: CengkarengLookupOptions
): Promise<CengkarengLookupResult> {
  const maxResults = options.maxResults ?? 4;
  const { exactSkus, terms } = buildSearchTerms(options);
  const primarySearchTerm =
    terms[0] || options.officialName || exactSkus[0] || 'honda';
  const catalogSearchUrl = buildCatalogSearchUrl(primarySearchTerm);

  let lastStatus = 0;
  let lastQuery = primarySearchTerm;
  const targetCodes = [...(options.partCodes ?? []), ...exactSkus];

  // Tier 1a: Exact SKU query pada WooCommerce Store API
  for (const sku of exactSkus) {
    lastQuery = sku;
    const res = await queryWcStoreApi('sku', sku);
    lastStatus = res.status;
    if (res.candidates.length > 0 && res.tier) {
      const ranked = [...res.candidates]
        .sort(
          (a, b) =>
            scoreCandidateRelevance(b, options.modelHint ?? null, options.sideHint ?? null, targetCodes) -
            scoreCandidateRelevance(a, options.modelHint ?? null, options.sideHint ?? null, targetCodes)
        )
        .slice(0, maxResults);

      const pricesFound = ranked.filter((c) => c.priceIdr !== null).length;
      console.log(
        '[cengkarengCatalog]',
        JSON.stringify({
          query: sku,
          tierUsed: res.tier,
          httpStatus: res.status,
          productsFound: ranked.length,
          pricesFound,
        })
      );
      return {
        candidates: ranked,
        tierUsed: res.tier,
        httpStatus: res.status,
        catalogSearchUrl: buildCatalogSearchUrl(sku),
        queryUsed: sku,
      };
    }
  }

  // Tier 1b: Multi-term search pada WooCommerce Store API
  for (const term of terms) {
    lastQuery = term;
    const res = await queryWcStoreApi('search', term);
    lastStatus = res.status;
    if (res.candidates.length > 0 && res.tier) {
      const ranked = [...res.candidates]
        .sort(
          (a, b) =>
            scoreCandidateRelevance(b, options.modelHint ?? null, options.sideHint ?? null, targetCodes) -
            scoreCandidateRelevance(a, options.modelHint ?? null, options.sideHint ?? null, targetCodes)
        )
        .slice(0, maxResults);

      const pricesFound = ranked.filter((c) => c.priceIdr !== null).length;
      console.log(
        '[cengkarengCatalog]',
        JSON.stringify({
          query: term,
          tierUsed: res.tier,
          httpStatus: res.status,
          productsFound: ranked.length,
          pricesFound,
        })
      );
      return {
        candidates: ranked,
        tierUsed: res.tier,
        httpStatus: res.status,
        catalogSearchUrl: buildCatalogSearchUrl(term),
        queryUsed: term,
      };
    }
  }

  // Tier 2: Direct HTML search + JSON-LD parser (maks 1 term utama bila Store API non-200 / kosong)
  if (terms[0]) {
    lastQuery = terms[0];
    const htmlRes = await queryHtmlSearchFallback(terms[0]);
    lastStatus = htmlRes.status;
    if (htmlRes.candidates.length > 0) {
      const ranked = [...htmlRes.candidates]
        .sort(
          (a, b) =>
            scoreCandidateRelevance(b, options.modelHint ?? null, options.sideHint ?? null, targetCodes) -
            scoreCandidateRelevance(a, options.modelHint ?? null, options.sideHint ?? null, targetCodes)
        )
        .slice(0, maxResults);

      const pricesFound = ranked.filter((c) => c.priceIdr !== null).length;
      console.log(
        '[cengkarengCatalog]',
        JSON.stringify({
          query: terms[0],
          tierUsed: 'html-jsonld',
          httpStatus: htmlRes.status,
          productsFound: ranked.length,
          pricesFound,
        })
      );
      return {
        candidates: ranked,
        tierUsed: 'html-jsonld',
        httpStatus: htmlRes.status,
        catalogSearchUrl: buildCatalogSearchUrl(terms[0]),
        queryUsed: terms[0],
      };
    }
  }

  console.log(
    '[cengkarengCatalog]',
    JSON.stringify({
      query: lastQuery,
      tierUsed: 'none',
      httpStatus: lastStatus,
      productsFound: 0,
      pricesFound: 0,
    })
  );

  return {
    candidates: [],
    tierUsed: 'none',
    httpStatus: lastStatus,
    catalogSearchUrl,
    queryUsed: lastQuery,
  };
}

async function queryJinaMarkdownFallback(term: string, maxItems = 12): Promise<{
  candidates: CengkarengCandidate[];
  status: number;
}> {
  const targetUrl = buildCatalogSearchUrl(term);
  const jinaUrl = `https://r.jina.ai/${targetUrl}`;
  try {
    const res = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'markdown',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { candidates: [], status: res.status };
    }

    const markdown = await res.text();
    const candidates: CengkarengCandidate[] = [];
    const seenUrls = new Set<string>();
    const linkRegex = /\[([^\]]{4,160})\]\((https?:\/\/(?:www\.)?hondacengkareng\.com\/(?:produk|product)\/[^)\s#?]+)\)/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(markdown)) !== null && candidates.length < maxItems) {
      const rawTitle = match[1].replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim();
      const prodUrl = match[2].trim();
      if (!rawTitle || seenUrls.has(prodUrl)) continue;
      seenUrls.add(prodUrl);

      const windowSlice = markdown.slice(Math.max(0, match.index - 220), match.index + 320);
      const imgMatch = windowSlice.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i)?.[1] ?? null;
      const priceMatch = windowSlice.match(/Rp\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,8})/i);
      const priceIdr = priceMatch?.[1] ? parsePriceAmount(priceMatch[1], 0) : null;

      candidates.push({
        title: decodeHtmlEntities(rawTitle),
        partCodes: extractHondaPartCodes(`${rawTitle} ${prodUrl}`),
        url: prodUrl,
        photoUrl: isHttpUrl(imgMatch) ? imgMatch.trim() : null,
        priceIdr,
      });
    }

    return { candidates, status: res.status };
  } catch {
    return { candidates: [], status: 0 };
  }
}

export async function searchCengkarengCatalogTerm(
  term: string,
  perPage = 12
): Promise<{
  candidates: CengkarengCandidate[];
  tierUsed: 'wc-store-v1' | 'wc-store-legacy' | 'html-jsonld' | 'jina-markdown' | 'none';
  httpStatus: number;
}> {
  const cleanTerm = term.trim();
  if (!cleanTerm) {
    return { candidates: [], tierUsed: 'none', httpStatus: 0 };
  }

  // Tier 1: WooCommerce Store API (v1 -> legacy)
  const storeRes = await queryWcStoreApi('search', cleanTerm, perPage);
  if (storeRes.candidates.length > 0 && storeRes.tier) {
    return {
      candidates: storeRes.candidates.slice(0, perPage),
      tierUsed: storeRes.tier,
      httpStatus: storeRes.status,
    };
  }

  // Tier 2: Direct HTML search + JSON-LD / WooCommerce card parser
  const htmlRes = await queryHtmlSearchFallback(cleanTerm, perPage);
  if (htmlRes.candidates.length > 0) {
    return {
      candidates: htmlRes.candidates.slice(0, perPage),
      tierUsed: 'html-jsonld',
      httpStatus: htmlRes.status,
    };
  }

  // Tier 3: Jina Reader markdown fallback
  const jinaRes = await queryJinaMarkdownFallback(cleanTerm, perPage);
  if (jinaRes.candidates.length > 0) {
    return {
      candidates: jinaRes.candidates.slice(0, perPage),
      tierUsed: 'jina-markdown',
      httpStatus: jinaRes.status,
    };
  }

  return {
    candidates: [],
    tierUsed: 'none',
    httpStatus: jinaRes.status || htmlRes.status || storeRes.status,
  };
}
