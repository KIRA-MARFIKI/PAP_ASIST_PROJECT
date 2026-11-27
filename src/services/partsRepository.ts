import {
  isSupabaseConfigured,
  supabase,
  SUPABASE_CONFIG_ERROR_MESSAGE,
} from '../lib/supabase';
import { createPartPlaceholder } from '../utils/partPlaceholder';
import { applyWatermarkToImageFile } from '../utils/watermark';
import {
  EnrichBatchResult,
  ParsedWarehouseRow,
  PartCategory,
  PartItem,
  PriceSource,
  SearchResultItem,
  SinglePartUpdatePayload,
  StockStatus,
  UploadHistoryRecord,
  UploadRowError,
  WarehouseStockStatus,
} from '../types/part';

const UPSERT_BATCH_SIZE = 500;
const FETCH_PAGE_SIZE = 1000;

interface SupabaseWarehousePartRow {
  part_code: string;
  part_code_display: string;
  official_name: string;
  rack_code: string;
  price: number | string | null;
  price_source: PriceSource | null;
  category: PartCategory;
  stock: number | null;
  min_stock: number | null;
  stock_known: boolean | null;
  substituted_by: string | null;
  catalog_url: string | null;
  ai_enriched: boolean | null;
  photo_url: string | null;
  aliases: string[] | null;
}

interface SupabaseImportLogRow {
  id: string;
  uploaded_by_name: string;
  file_name: string;
  total_rows: number;
  success_count: number;
  failed_count: number;
  duplicate_merged_count: number | null;
  sheets_processed: string[] | null;
  status: 'success' | 'partial' | 'failed';
  errors: UploadRowError[] | null;
  created_at: string;
}

export function normalizePartCodeKey(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function getStockStatus(part: PartItem): StockStatus {
  if (!part.stockKnown || part.stok === null || part.stokMinimum === null) {
    return 'unknown';
  }
  if (part.stok <= 0) return 'unavailable';
  if (part.stok < part.stokMinimum) return 'critical';
  return 'available';
}

export function toWarehouseStockStatus(
  stok: number | null,
  stokMinimum: number | null,
  stockKnown: boolean
): WarehouseStockStatus {
  if (!stockKnown || stok === null || stokMinimum === null) {
    return 'belum_diatur';
  }
  if (stok <= 0) return 'tidak_tersedia';
  if (stok < stokMinimum) return 'kritis';
  return 'tersedia';
}

export function partItemToSearchResult(part: PartItem): SearchResultItem {
  return {
    id: part.id,
    foto: part.foto,
    namaResmi: part.namaResmi,
    kodePart: part.kodePart,
    kodeRak: part.kodeRak,
    harga: part.harga,
    priceSource: part.priceSource,
    stok: part.stok,
    stokMinimum: part.stokMinimum,
    stockKnown: part.stockKnown,
    substitutedBy: part.substitutedBy ?? null,
    inWarehouse: true,
    stockStatus: toWarehouseStockStatus(part.stok, part.stokMinimum, part.stockKnown),
    sourceUrl: part.catalogUrl ?? null,
  };
}

function mapSupabasePartRow(row: SupabaseWarehousePartRow): PartItem {
  const numericPrice =
    row.price === null || row.price === undefined || row.price === ''
      ? null
      : Number(row.price);
  const priceSource: PriceSource =
    row.price_source === 'warehouse' || row.price_source === 'cengkareng'
      ? row.price_source
      : numericPrice !== null && numericPrice > 0
        ? 'warehouse'
        : 'none';
  const stockKnown =
    typeof row.stock_known === 'boolean'
      ? row.stock_known
      : row.stock !== null && row.min_stock !== null;

  return {
    id: row.part_code,
    foto: row.photo_url || createPartPlaceholder(row.official_name),
    namaResmi: row.official_name,
    kodePart: row.part_code_display || row.part_code,
    kodeRak: row.rack_code || '-',
    harga: Number.isFinite(numericPrice) ? numericPrice : null,
    priceSource,
    kategori: row.category === 'slow' ? 'slow' : 'fast',
    stok: stockKnown && row.stock !== null ? Number(row.stock) : null,
    stokMinimum: stockKnown && row.min_stock !== null ? Number(row.min_stock) : null,
    stockKnown,
    substitutedBy: row.substituted_by ?? null,
    catalogUrl: row.catalog_url ?? null,
    aiEnriched: Boolean(row.ai_enriched),
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
  };
}

export async function fetchAllParts(): Promise<{
  parts: PartItem[];
  error?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      parts: [],
      error: SUPABASE_CONFIG_ERROR_MESSAGE,
    };
  }

  const allRows: SupabaseWarehousePartRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('warehouse_parts')
      .select(
        'part_code, part_code_display, official_name, rack_code, price, price_source, category, stock, min_stock, stock_known, substituted_by, catalog_url, ai_enriched, photo_url, aliases'
      )
      .order('official_name', { ascending: true })
      .order('part_code', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    if (error) {
      return {
        parts: [],
        error: `Gagal memuat data gudang dari Supabase (${error.message}). Periksa koneksi atau migrasi database lalu muat ulang halaman.`,
      };
    }

    const page = (data ?? []) as SupabaseWarehousePartRow[];
    allRows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) {
      break;
    }
    from += FETCH_PAGE_SIZE;
  }

  return {
    parts: allRows.map(mapSupabasePartRow),
  };
}

export function getLowStockParts(sourceParts: PartItem[]): {
  fast: PartItem[];
  slow: PartItem[];
  totalCount: number;
} {
  // Hanya sertakan part yang stoknya benar-benar diketahui agar impor parsial tidak memicu alarm palsu.
  const lowStock = sourceParts.filter(
    (part) =>
      part.stockKnown &&
      part.stok !== null &&
      part.stokMinimum !== null &&
      part.stok < part.stokMinimum
  );
  const sortByDeficitDesc = (a: PartItem, b: PartItem) =>
    (b.stokMinimum ?? 0) - (b.stok ?? 0) - ((a.stokMinimum ?? 0) - (a.stok ?? 0));

  const fast = lowStock.filter((p) => p.kategori === 'fast').sort(sortByDeficitDesc);
  const slow = lowStock.filter((p) => p.kategori === 'slow').sort(sortByDeficitDesc);

  return {
    fast,
    slow,
    totalCount: lowStock.length,
  };
}

export async function upsertWarehouseParts(
  validRows: ParsedWarehouseRow[],
  currentParts: PartItem[] = []
): Promise<{ parts: PartItem[]; storageError?: string; upsertFailed?: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      parts: currentParts,
      upsertFailed: true,
      storageError: SUPABASE_CONFIG_ERROR_MESSAGE,
    };
  }

  const dedupedMap = new Map<string, ParsedWarehouseRow>();
  for (const row of validRows) {
    dedupedMap.set(row.normalizedKey, row);
  }
  const uniqueRows = Array.from(dedupedMap.values());

  // Mulai dari snapshot lokal lalu sinkronkan dengan baris live di Supabase agar data gudang eksisting tidak tertimpa.
  const existingByKey = new Map<string, PartItem>();
  for (const part of currentParts) {
    existingByKey.set(normalizePartCodeKey(part.kodePart), part);
  }

  const incomingKeys = uniqueRows.map((row) => row.normalizedKey);
  for (let i = 0; i < incomingKeys.length; i += UPSERT_BATCH_SIZE) {
    const keyChunk = incomingKeys.slice(i, i + UPSERT_BATCH_SIZE);
    const { data: liveRows, error: liveFetchErr } = await supabase
      .from('warehouse_parts')
      .select(
        'part_code, part_code_display, official_name, rack_code, price, price_source, category, stock, min_stock, stock_known, substituted_by, catalog_url, ai_enriched, photo_url, aliases'
      )
      .in('part_code', keyChunk);

    if (!liveFetchErr && Array.isArray(liveRows)) {
      for (const liveRow of liveRows as SupabaseWarehousePartRow[]) {
        existingByKey.set(liveRow.part_code, mapSupabasePartRow(liveRow));
      }
    }
  }

  // Pertahankan harga gudang, nama resmi hasil pengayaan, kode rak, dan stok eksisting saat mengunggah file parsial.
  const payload = uniqueRows.map((row) => {
    const prev = existingByKey.get(row.normalizedKey);
    const keepPrevPrice = row.harga === null && prev && prev.harga !== null;
    const keepPrevStock = !row.stockKnown && prev && prev.stockKnown;
    const incomingIsPlaceholder = row.namaResmi.startsWith('Kode Pengganti:');
    const prevIsPlaceholder = prev?.namaResmi.startsWith('Kode Pengganti:') ?? true;
    const chosenName =
      incomingIsPlaceholder && prev && !prevIsPlaceholder ? prev.namaResmi : row.namaResmi;
    const mergedAliases = Array.from(new Set([...(prev?.aliases ?? []), ...row.aliases]));
    const nextMinStock = row.stockKnown
      ? row.stokMinimum !== null
        ? row.stokMinimum
        : (prev?.stokMinimum ?? 0)
      : keepPrevStock
        ? prev.stokMinimum
        : null;

    return {
      part_code: row.normalizedKey,
      part_code_display: row.kodePart,
      official_name: chosenName,
      rack_code: row.kodeRak !== '-' ? row.kodeRak : prev?.kodeRak || '-',
      price: keepPrevPrice ? prev.harga : row.harga,
      price_source: keepPrevPrice ? prev.priceSource : row.priceSource,
      category: row.kategori,
      stock: keepPrevStock ? prev.stok : row.stok,
      min_stock: nextMinStock,
      stock_known: keepPrevStock ? true : row.stockKnown,
      substituted_by: row.substitutedBy || prev?.substitutedBy || null,
      aliases: mergedAliases,
      ai_enriched: prev?.aiEnriched || row.aiEnriched,
    };
  });

  for (let i = 0; i < payload.length; i += UPSERT_BATCH_SIZE) {
    const chunk = payload.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from('warehouse_parts')
      .upsert(chunk, { onConflict: 'part_code' });

    if (error) {
      const partialRefresh = i > 0 ? await fetchAllParts() : null;
      return {
        parts:
          partialRefresh && !partialRefresh.error
            ? partialRefresh.parts
            : currentParts,
        upsertFailed: true,
        storageError: `Gagal menyimpan data ke database gudang (${error.message}). Pastikan akun Anda terdaftar sebagai admin gudang lalu coba lagi.`,
      };
    }
  }

  const refreshed = await fetchAllParts();
  if (refreshed.error) {
    return {
      parts: currentParts,
      storageError:
        'Data tersimpan ke database gudang, tetapi gagal memuat ulang daftar part terbaru. Muat ulang halaman untuk melihat pembaruan.',
    };
  }
  return { parts: refreshed.parts };
}

export async function getUploadHistory(): Promise<{
  records: UploadHistoryRecord[];
  error?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      records: [],
      error: SUPABASE_CONFIG_ERROR_MESSAGE,
    };
  }

  const { data, error } = await supabase
    .from('stock_import_logs')
    .select(
      'id, uploaded_by_name, file_name, total_rows, success_count, failed_count, duplicate_merged_count, sheets_processed, status, errors, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return {
      records: [],
      error: `Gagal memuat riwayat upload dari database (${error.message}). Muat ulang atau periksa sesi admin Anda.`,
    };
  }

  const mapped: UploadHistoryRecord[] = (data as SupabaseImportLogRow[]).map((row) => ({
    id: row.id,
    fileName: row.file_name,
    uploadedAt: row.created_at,
    uploadedBy: row.uploaded_by_name,
    totalRows: row.total_rows,
    successCount: row.success_count,
    failedCount: row.failed_count,
    duplicateMergedCount: Number(row.duplicate_merged_count) || 0,
    sheetsProcessed: Array.isArray(row.sheets_processed) ? row.sheets_processed : [],
    status: row.status,
    errors: Array.isArray(row.errors) ? row.errors : [],
  }));

  return { records: mapped };
}

export async function recordUploadHistory(
  record: UploadHistoryRecord,
  uploadedByUserId?: string
): Promise<{ records: UploadHistoryRecord[]; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      records: [],
      error: SUPABASE_CONFIG_ERROR_MESSAGE,
    };
  }

  const { error } = await supabase.from('stock_import_logs').insert({
    uploaded_by: uploadedByUserId || null,
    uploaded_by_name: record.uploadedBy,
    file_name: record.fileName,
    total_rows: record.totalRows,
    success_count: record.successCount,
    failed_count: record.failedCount,
    duplicate_merged_count: record.duplicateMergedCount,
    sheets_processed: record.sheetsProcessed,
    status: record.status,
    errors: record.errors,
  });

  if (error) {
    return {
      records: [],
      error: `Gagal mencatat riwayat upload ke database (${error.message}). Periksa hak akses admin Anda.`,
    };
  }

  return getUploadHistory();
}

export async function triggerEnrichPartsBatch(batchSize = 10): Promise<EnrichBatchResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(SUPABASE_CONFIG_ERROR_MESSAGE);
  }

  const { data, error } = await supabase.functions.invoke<EnrichBatchResult>('enrich-parts', {
    body: { batchSize },
  });

  if (error) {
    const errContext = (error as { context?: Response }).context;
    if (errContext) {
      try {
        const parsed = (await errContext.json()) as { error?: string };
        if (parsed?.error) throw new Error(parsed.error);
      } catch (inner) {
        if (inner instanceof Error && inner.message) throw inner;
      }
    }
    throw new Error('Gagal menjalankan pengayaan data AI dan Honda Cengkareng. Coba lagi nanti.');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return (
    data ?? {
      processed: 0,
      priceUpdated: 0,
      aliasesUpdated: 0,
      remainingPending: 0,
      details: [],
    }
  );
}

async function compressWatermarkedPhotoForStorage(file: File): Promise<Blob> {
  const watermarked = await applyWatermarkToImageFile(file);
  const objectUrl = URL.createObjectURL(watermarked);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal memproses gambar part.'));
      el.src = objectUrl;
    });

    const maxSide = 1024;
    let { width, height } = img;
    if (width > maxSide || height > maxSide) {
      const ratio = Math.min(maxSide / width, maxSide / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return watermarked;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.86)
    );
    return blob ?? watermarked;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function updateSinglePart(
  payload: SinglePartUpdatePayload,
  currentParts: PartItem[]
): Promise<PartItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(SUPABASE_CONFIG_ERROR_MESSAGE);
  }

  const normalizedKey = normalizePartCodeKey(payload.partCodeKey);
  let uploadedPhotoUrl: string | undefined;

  if (payload.photoFile) {
    const compressedBlob = await compressWatermarkedPhotoForStorage(payload.photoFile);
    const filePath = `${normalizedKey}.jpg`;
    const { error: uploadErr } = await supabase.storage
      .from('part-photos')
      .upload(filePath, compressedBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Gagal mengunggah foto part (${uploadErr.message}).`);
    }

    const { data: publicData } = supabase.storage.from('part-photos').getPublicUrl(filePath);
    uploadedPhotoUrl = `${publicData.publicUrl}?v=${Date.now()}`;
  }

  const updatePatch: Record<string, unknown> = {
    official_name: payload.namaResmi,
    rack_code: payload.kodeRak || '-',
    price: payload.harga,
    price_source: payload.priceSource,
    category: payload.kategori,
    stock: payload.stockKnown ? payload.stok : null,
    min_stock: payload.stockKnown ? payload.stokMinimum : null,
    stock_known: payload.stockKnown,
    aliases: payload.aliases,
  };

  if (uploadedPhotoUrl) {
    updatePatch.photo_url = uploadedPhotoUrl;
  }

  const { data: updatedRows, error } = await supabase
    .from('warehouse_parts')
    .update(updatePatch)
    .eq('part_code', normalizedKey)
    .select('part_code');

  if (error) {
    throw new Error(`Gagal menyimpan perubahan part (${error.message}).`);
  }

  if (!updatedRows || updatedRows.length === 0) {
    throw new Error(
      'Perubahan part tidak tersimpan. Pastikan sesi admin gudang masih aktif dan kode part masih ada di database.'
    );
  }

  const refreshed = await fetchAllParts();
  if (!refreshed.error) {
    return refreshed.parts;
  }

  return currentParts.map((part) => {
    if (normalizePartCodeKey(part.id) !== normalizedKey && part.id !== payload.partCodeKey) {
      return part;
    }
    return {
      ...part,
      namaResmi: payload.namaResmi,
      kodeRak: payload.kodeRak || '-',
      harga: payload.harga,
      priceSource: payload.priceSource,
      kategori: payload.kategori,
      stok: payload.stockKnown ? payload.stok : null,
      stokMinimum: payload.stockKnown ? payload.stokMinimum : null,
      stockKnown: payload.stockKnown,
      aliases: payload.aliases,
      foto: uploadedPhotoUrl || part.foto,
    };
  });
}

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}
