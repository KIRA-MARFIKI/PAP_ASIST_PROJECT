import {
  isSupabaseConfigured,
  supabase,
  SUPABASE_CONFIG_ERROR_MESSAGE,
} from '../lib/supabase';
import { createPartPlaceholder } from '../utils/partPlaceholder';
import {
  PartItem,
  SearchPartResponse,
  SearchResultItem,
  WarehouseStockStatus,
} from '../types/part';
import {
  normalizePartCodeKey,
  partItemToSearchResult,
} from './partsRepository';

export class AiSearchError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds = 30) {
    super(message);
    this.name = 'AiSearchError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface EdgeMergedResult {
  id: string;
  photoUrl: string | null;
  officialName: string;
  partCode: string;
  rackCode: string;
  isDummyRack?: boolean;
  rackZoneLabel?: string | null;
  itemGroup?: 'sparepart' | 'aksesoris' | 'apparel';
  price: number | null;
  priceSource?: 'warehouse' | 'cengkareng' | 'none';
  stock: number | null;
  minStock: number | null;
  stockKnown?: boolean;
  substitutedBy?: string | null;
  inWarehouse: boolean;
  stockStatus: WarehouseStockStatus;
  statusLabel?: string | null;
  sourceUrl?: string | null;
}

interface EdgeSearchResponse {
  isHondaPart?: boolean;
  rejectionTitle?: string;
  rejectionMessage?: string;
  translatedQuery?: string;
  source?: 'warehouse-direct' | 'gemini-free' | 'catalog-cache';
  confidence?: 'high' | 'medium' | 'low';
  visualNotes?: string | null;
  results?: EdgeMergedResult[];
  errorType?: string;
  message?: string;
  retryAfterSeconds?: number;
  error?: string;
}

// Kompres foto ke maksimum 1024px JPEG sebelum encoding base64 agar unggahan cepat di jaringan gudang.
async function compressImageToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak dapat diproses.'));
      img.onload = () => {
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
        if (!ctx) {
          reject(new Error('Gagal menyiapkan kanvas kompresi gambar.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const base64 = dataUrl.split(',')[1] ?? '';
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function mapEdgeResponse(data: EdgeSearchResponse, fallbackQuery: string): SearchPartResponse {
  if (data.isHondaPart === false) {
    return {
      isHondaPart: false,
      rejectionTitle: data.rejectionTitle || 'Bukan Sparepart Motor Honda',
      rejectionMessage:
        data.rejectionMessage ||
        'PaP Asist hanya melayani pencarian suku cadang motor Honda berdasarkan data gudang Menara Agung Padang Panjang dan katalog Honda Cengkareng.',
      translatedQuery: '',
      source: 'gemini-free',
      results: [],
    };
  }

  const results: SearchResultItem[] = Array.isArray(data.results)
    ? data.results.map((item) => ({
        id: item.id,
        foto: item.photoUrl || createPartPlaceholder(item.officialName),
        namaResmi: item.officialName,
        kodePart: item.partCode,
        kodeRak: item.rackCode || '-',
        isDummyRack: Boolean(item.isDummyRack),
        rackZoneLabel: item.rackZoneLabel ?? null,
        itemGroup: item.itemGroup ?? 'sparepart',
        harga: item.price,
        priceSource:
          item.priceSource ??
          (item.price !== null ? (item.inWarehouse ? 'warehouse' : 'cengkareng') : 'none'),
        stok: item.stock ?? null,
        stokMinimum: item.minStock ?? null,
        stockKnown: Boolean(item.stockKnown),
        substitutedBy: item.substitutedBy ?? null,
        inWarehouse: item.inWarehouse,
        stockStatus: item.stockStatus,
        statusLabel: item.statusLabel ?? null,
        sourceUrl: item.sourceUrl ?? null,
      }))
    : [];

  return {
    isHondaPart: true,
    translatedQuery: data.translatedQuery || fallbackQuery.trim().toUpperCase(),
    source: data.source || 'gemini-free',
    confidence: data.confidence,
    visualNotes: data.visualNotes ?? null,
    results,
  };
}

/**
 * Semua panggilan Gemini API dan katalog dijalankan secara eksklusif melalui Supabase Edge Function `search-part`.
 */
async function invokeEdgeSearch(payload: {
  query?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<EdgeSearchResponse> {
  if (!isSupabaseConfigured || !supabase) {
    throw new AiSearchError(SUPABASE_CONFIG_ERROR_MESSAGE, 0);
  }

  const { data, error } = await supabase.functions.invoke<EdgeSearchResponse>('search-part', {
    body: payload,
  });

  if (error) {
    const errContext = (error as { context?: Response }).context;
    if (errContext && typeof errContext.status === 'number') {
      const status = errContext.status;
      if (status === 404) {
        throw new AiSearchError(
          'Layanan pencarian AI (Edge Function search-part) belum terpasang di Supabase. Jalankan deploy function lalu coba lagi.',
          30
        );
      }
      try {
        const parsedErr = (await errContext.json()) as {
          errorType?: string;
          message?: string;
          error?: string;
          retryAfterSeconds?: number;
        };
        const msg =
          parsedErr?.message ||
          parsedErr?.error ||
          'Layanan AI sedang mengalami gangguan sementara.';
        const retry =
          typeof parsedErr?.retryAfterSeconds === 'number'
            ? parsedErr.retryAfterSeconds
            : status === 429
              ? 120
              : 30;
        throw new AiSearchError(msg, retry);
      } catch (inner) {
        if (inner instanceof AiSearchError) {
          throw inner;
        }
        throw new AiSearchError(
          'Layanan AI tidak dapat merespons saat ini. Silakan coba beberapa saat lagi.',
          status === 429 ? 120 : 30
        );
      }
    }

    throw new AiSearchError(
      'Gagal terhubung ke server pencarian AI. Periksa koneksi internet Anda lalu coba lagi.',
      30
    );
  }

  if (data?.errorType === 'ai_error' || data?.error) {
    throw new AiSearchError(
      data.message || data.error || 'Layanan AI sedang sibuk.',
      data.retryAfterSeconds ?? 30
    );
  }

  if (!data) {
    throw new AiSearchError(
      'Server pencarian AI mengembalikan respons kosong. Silakan coba beberapa saat lagi.',
      30
    );
  }

  return data;
}

export async function searchPartWithText(
  query: string,
  activeParts: PartItem[] = []
): Promise<SearchPartResponse> {
  const trimmed = query.trim();

  // Hemat kuota Edge Function bila user memasukkan kode part persis dari data gudang Supabase asli yang sudah memiliki harga
  const normalizedTrimmedKey = normalizePartCodeKey(trimmed);
  const exactCodeMatch =
    normalizedTrimmedKey.length >= 5 && activeParts.length > 0
      ? activeParts.find(
          (part) =>
            normalizePartCodeKey(part.kodePart) === normalizedTrimmedKey &&
            part.harga !== null
        )
      : undefined;
  if (exactCodeMatch) {
    return {
      isHondaPart: true,
      translatedQuery: exactCodeMatch.namaResmi,
      source: 'warehouse-direct',
      results: [partItemToSearchResult(exactCodeMatch)],
    };
  }

  const edgeData = await invokeEdgeSearch({ query: trimmed });
  return mapEdgeResponse(edgeData, trimmed);
}

export async function searchPartWithImage(
  file: File,
  optionalHint?: string
): Promise<SearchPartResponse> {
  const { base64, mimeType } = await compressImageToBase64(file);

  const edgeData = await invokeEdgeSearch({
    query: optionalHint?.trim() || undefined,
    imageBase64: base64,
    mimeType,
  });

  return mapEdgeResponse(edgeData, optionalHint || 'HASIL FOTO PART');
}
