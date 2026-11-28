export type PartCategory = 'fast' | 'slow';

export type ItemGroup = 'sparepart' | 'aksesoris' | 'apparel';

export type PriceSource = 'warehouse' | 'cengkareng' | 'none';

export type StockStatus = 'available' | 'critical' | 'unavailable' | 'unknown';

export type WarehouseStockStatus =
  | 'tersedia'
  | 'kritis'
  | 'tidak_tersedia'
  | 'belum_diatur'
  | 'belum_di_gudang';

export interface PartItem {
  id: string;
  foto: string;
  namaResmi: string;
  kodePart: string;
  kodeRak: string;
  itemGroup: ItemGroup;
  isDummyRack: boolean;
  harga: number | null;
  priceSource: PriceSource;
  kategori: PartCategory;
  stok: number | null;
  stokMinimum: number | null;
  stockKnown: boolean;
  substitutedBy?: string | null;
  catalogUrl?: string | null;
  aiEnriched?: boolean;
  aliases: string[];
}

export type CategoryId = 'busi' | 'kampas_rem' | 'oli';

export type CategorySubType = 'depan' | 'belakang' | 'oli_mesin' | 'oli_gardan' | null;

export interface CategoryThumbnailInfo {
  photoUrl: string | null;
  count: number;
}

export type CategoryThumbnailsMap = Partial<Record<CategoryId, CategoryThumbnailInfo>>;

export interface SearchResultItem {
  id: string;
  foto: string;
  namaResmi: string;
  kodePart: string;
  kodeRak: string;
  isDummyRack?: boolean;
  rackZoneLabel?: string | null;
  itemGroup?: ItemGroup;
  harga: number | null;
  priceSource: PriceSource;
  stok: number | null;
  stokMinimum: number | null;
  stockKnown: boolean;
  substitutedBy?: string | null;
  inWarehouse: boolean;
  stockStatus: WarehouseStockStatus;
  statusLabel?: string | null;
  sourceUrl?: string | null;
  subType?: CategorySubType;
}

export interface SearchPartResponse {
  isHondaPart: boolean;
  rejectionTitle?: string;
  rejectionMessage?: string;
  translatedQuery: string;
  source: 'warehouse-direct' | 'gemini-free' | 'catalog-cache';
  confidence?: 'high' | 'medium' | 'low';
  visualNotes?: string | null;
  results: SearchResultItem[];
}

export interface SinglePartUpdatePayload {
  partCodeKey: string;
  namaResmi: string;
  kodeRak: string;
  itemGroup: ItemGroup;
  isDummyRack: boolean;
  harga: number | null;
  priceSource: PriceSource;
  kategori: PartCategory;
  stok: number | null;
  stokMinimum: number | null;
  stockKnown: boolean;
  aliases: string[];
  photoFile?: File | null;
}

export type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface ParsedWarehouseRow {
  normalizedKey: string;
  kodePart: string;
  namaResmi: string;
  kodeRak: string;
  itemGroup: ItemGroup;
  isDummyRack: boolean;
  harga: number | null;
  priceSource: PriceSource;
  kategori: PartCategory;
  stok: number | null;
  stokMinimum: number | null;
  stockKnown: boolean;
  substitutedBy: string | null;
  aliases: string[];
  aiEnriched: boolean;
}

export interface FailedUploadRow {
  rowNumber: number;
  sheetName?: string;
  rawPartCode: string;
  reason: string;
}

export interface WarehouseParseResult {
  totalRows: number;
  validRows: ParsedWarehouseRow[];
  failedRows: FailedUploadRow[];
  sheetsProcessed: string[];
  duplicateMergedCount: number;
  substitutionResolvedCount: number;
  missingRack: boolean;
  missingPrice: boolean;
  missingStock: boolean;
}

export interface UploadRowError {
  rowNumber: number;
  partCode: string;
  reason: string;
}

export interface UploadHistoryRecord {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  duplicateMergedCount: number;
  sheetsProcessed: string[];
  status: 'success' | 'partial' | 'failed';
  errors: UploadRowError[];
}

export interface EnrichBatchResult {
  processed: number;
  priceUpdated: number;
  aliasesUpdated: number;
  remainingPending: number;
  details: Array<{
    partCode: string;
    officialName: string;
    priceUpdated: boolean;
    aliasesCount: number;
  }>;
  error?: string;
}
