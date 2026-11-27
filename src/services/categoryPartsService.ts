import {
  isSupabaseConfigured,
  supabase,
  SUPABASE_CONFIG_ERROR_MESSAGE,
} from '../lib/supabase';
import { createPartPlaceholder } from '../utils/partPlaceholder';
import {
  CategoryId,
  CategorySubType,
  CategoryThumbnailsMap,
  SearchResultItem,
  WarehouseStockStatus,
} from '../types/part';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  fallbackLabel: string;
}

export const CATEGORY_ITEMS: readonly CategoryMeta[] = [
  { id: 'busi', label: 'Busi', fallbackLabel: 'BUSI HONDA' },
  {
    id: 'kampas_rem',
    label: 'Kampas Rem Depan & Belakang',
    fallbackLabel: 'KAMPAS REM',
  },
  {
    id: 'oli',
    label: 'Oli Mesin & Oli Gardan',
    fallbackLabel: 'OLI AHM',
  },
] as const;

export function getCategoryLabel(category: CategoryId): string {
  return CATEGORY_ITEMS.find((c) => c.id === category)?.label ?? category;
}

interface EdgeCategoryItem {
  id: string;
  photoUrl: string | null;
  officialName: string;
  partCode: string;
  rackCode: string;
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
  subType?: CategorySubType;
}

interface EdgeCategoryResponse {
  category?: CategoryId;
  categoryLabel?: string;
  fromCache?: boolean;
  count?: number;
  results?: EdgeCategoryItem[];
  error?: string;
}

interface EdgeThumbnailsResponse {
  thumbnails?: CategoryThumbnailsMap;
  error?: string;
}

export interface CategoryPartsResult {
  category: CategoryId;
  categoryLabel: string;
  fromCache: boolean;
  results: SearchResultItem[];
}

export async function fetchCategoryThumbnails(): Promise<CategoryThumbnailsMap> {
  if (!isSupabaseConfigured || !supabase) {
    return {};
  }

  const { data, error } = await supabase.functions.invoke<EdgeThumbnailsResponse>(
    'category-parts',
    {
      body: { category: 'thumbnails' },
    }
  );

  if (error || !data?.thumbnails) {
    return {};
  }

  return data.thumbnails;
}

export async function fetchCategoryParts(category: CategoryId): Promise<CategoryPartsResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(SUPABASE_CONFIG_ERROR_MESSAGE);
  }

  const { data, error } = await supabase.functions.invoke<EdgeCategoryResponse>(
    'category-parts',
    {
      body: { category },
    }
  );

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
    throw new Error(
      'Gagal mengambil data kategori dari katalog Honda Cengkareng dan gudang Padang Panjang. Silakan coba lagi.'
    );
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const results: SearchResultItem[] = Array.isArray(data?.results)
    ? data.results.map((item) => ({
        id: item.id,
        foto: item.photoUrl || createPartPlaceholder(item.officialName),
        namaResmi: item.officialName,
        kodePart: item.partCode,
        kodeRak: item.rackCode || '-',
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
        subType: item.subType ?? null,
      }))
    : [];

  return {
    category,
    categoryLabel: data?.categoryLabel || getCategoryLabel(category),
    fromCache: Boolean(data?.fromCache),
    results,
  };
}
