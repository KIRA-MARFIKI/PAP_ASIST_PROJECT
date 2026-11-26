import {
  FailedUploadRow,
  ParsedWarehouseRow,
  PartCategory,
  PriceSource,
  WarehouseParseResult,
} from '../types/part';
import { normalizePartCodeKey } from '../services/partsRepository';

export const WAREHOUSE_TEMPLATE_HEADERS = [
  'kode_part',
  'nama_part',
  'kode_rak',
  'harga',
  'kategori',
  'stok',
  'stok_minimum',
] as const;

const PART_CODE_HEADER_ALIASES = new Set([
  'no part',
  'no. part',
  'nopart',
  'no_part',
  'kode part',
  'kode_part',
  'kodepart',
  'part_code',
  'part code',
  'part number',
  'part_number',
  'part no',
  'part_no',
]);

const PART_NAME_HEADER_ALIASES = new Set([
  'nama part',
  'nama_part',
  'namapart',
  'nama resmi',
  'nama_resmi',
  'nama resmi part',
  'official_name',
  'official name',
  'deskripsi',
  'description',
  'part name',
  'part_name',
]);

const RACK_HEADER_ALIASES = new Set(['kode_rak', 'kode rak', 'rak', 'rack_code', 'rack code', 'lokasi']);
const PRICE_HEADER_ALIASES = new Set(['harga', 'price', 'het', 'harga_jual', 'harga jual']);
const CATEGORY_HEADER_ALIASES = new Set(['kategori', 'category', 'tipe', 'moving']);
const STOCK_HEADER_ALIASES = new Set(['stok', 'stock', 'qty', 'jumlah', 'stok_saat_ini']);
const MIN_STOCK_HEADER_ALIASES = new Set([
  'stok_minimum',
  'stok minimum',
  'stok_min',
  'stok min',
  'min_stock',
  'min stock',
  'minimum',
]);

const FAST_MOVING_KEYWORDS = [
  'TIRE',
  'BAN',
  'PAD SET',
  'SHOE SET',
  'BRAKE',
  'SPARK PLUG',
  'PLUG, SPARK',
  'BELT',
  'ROLLER',
  'WEIGHT SET',
  'FLUID',
  'OIL',
  'LUBE',
  'CLEANER',
  'GREASE',
  'FILTER',
  'ELEMENT',
  'BULB',
  'SEAL',
  'CABLE',
  'CHAIN',
  'GASKET',
  'DISK, CLUTCH',
  'CLUTCH',
];

interface HeaderColumnMap {
  partCodeIdx: number;
  partNameIdx: number;
  rackIdx: number;
  priceIdx: number;
  categoryIdx: number;
  stockIdx: number;
  minStockIdx: number;
}

interface RawExtractedRow {
  sheetName: string;
  rowNumber: number;
  normalizedKey: string;
  kodePart: string;
  rawName: string;
  kodeRak: string;
  harga: number | null;
  priceSource: PriceSource;
  explicitCategory: PartCategory | null;
  stok: number | null;
  stokMinimum: number | null;
  stockKnown: boolean;
  isSubstitutionName: boolean;
  substitutionTargetKey: string | null;
  substitutionTargetDisplay: string | null;
}

function normalizeHeaderCell(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function detectHeaderColumns(row: unknown[]): HeaderColumnMap | null {
  let partCodeIdx = -1;
  let partNameIdx = -1;
  let rackIdx = -1;
  let priceIdx = -1;
  let categoryIdx = -1;
  let stockIdx = -1;
  let minStockIdx = -1;

  row.forEach((cell, idx) => {
    const norm = normalizeHeaderCell(cell);
    if (!norm) return;
    if (partCodeIdx === -1 && PART_CODE_HEADER_ALIASES.has(norm)) partCodeIdx = idx;
    else if (partNameIdx === -1 && PART_NAME_HEADER_ALIASES.has(norm)) partNameIdx = idx;
    else if (rackIdx === -1 && RACK_HEADER_ALIASES.has(norm)) rackIdx = idx;
    else if (priceIdx === -1 && PRICE_HEADER_ALIASES.has(norm)) priceIdx = idx;
    else if (categoryIdx === -1 && CATEGORY_HEADER_ALIASES.has(norm)) categoryIdx = idx;
    else if (stockIdx === -1 && STOCK_HEADER_ALIASES.has(norm)) stockIdx = idx;
    else if (minStockIdx === -1 && MIN_STOCK_HEADER_ALIASES.has(norm)) minStockIdx = idx;
  });

  if (partCodeIdx !== -1 && partNameIdx !== -1) {
    return {
      partCodeIdx,
      partNameIdx,
      rackIdx,
      priceIdx,
      categoryIdx,
      stockIdx,
      minStockIdx,
    };
  }

  return null;
}

function isRowCompletelyBlank(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? '').trim() === '');
}

function parseOptionalNonNegativeNumber(raw: unknown): {
  empty: boolean;
  value: number | null;
} {
  if (raw === null || raw === undefined) return { empty: true, value: null };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return { empty: false, value: null };
    return { empty: false, value: raw };
  }

  const text = String(raw).trim();
  if (!text || text === '-') return { empty: true, value: null };

  const cleaned = text.replace(/^rp\s*/i, '').replace(/\s+/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    const value = Number(cleaned.replace(/\./g, ''));
    return { empty: false, value: Number.isFinite(value) && value >= 0 ? value : null };
  }

  if (!/^\d+([.,]\d+)?$/.test(cleaned)) {
    return { empty: false, value: null };
  }

  const numeric = Number(cleaned.replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { empty: false, value: null };
  }
  return { empty: false, value: numeric };
}

function parseOptionalCategory(raw: unknown): {
  empty: boolean;
  value: PartCategory | null;
} {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (!value || value === '-') return { empty: true, value: null };
  if (value === 'fast' || value === 'fast moving') return { empty: false, value: 'fast' };
  if (value === 'slow' || value === 'slow moving') return { empty: false, value: 'slow' };
  return { empty: false, value: null };
}

/**
 * Auto-classifier deterministik suku cadang Honda saat kolom kategori tidak tersedia di file Excel.
 */
export function classifyHondaPartCategory(officialName: string, _partCode?: string): PartCategory {
  const upper = officialName.toUpperCase();
  for (const keyword of FAST_MOVING_KEYWORDS) {
    if (upper.includes(keyword)) {
      return 'fast';
    }
  }
  return 'slow';
}

/**
 * Mendeteksi apakah isi kolom Nama Part sebenarnya adalah kode substitusi Honda
 * (satu token alfanumerik 9-15 karakter mengandung huruf sekaligus angka, tanpa spasi).
 */
export function isHondaSubstitutionCode(rawName: string): boolean {
  const trimmed = rawName.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) return false;
  const compact = normalizePartCodeKey(trimmed);
  return compact.length >= 9 && compact.length <= 15 && /[A-Z]/.test(compact) && /[0-9]/.test(compact);
}

export async function parseWarehouseFile(file: File): Promise<WarehouseParseResult> {
  // Muat SheetJS secara dinamis hanya saat admin benar-benar memproses file Excel/CSV.
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return {
      totalRows: 0,
      validRows: [],
      failedRows: [
        {
          rowNumber: 1,
          rawPartCode: '-',
          reason: 'Baris 1: File tidak memiliki lembar kerja yang dapat dibaca.',
        },
      ],
      sheetsProcessed: [],
      duplicateMergedCount: 0,
      substitutionResolvedCount: 0,
      missingRack: true,
      missingPrice: true,
      missingStock: true,
    };
  }

  const extractedRows: RawExtractedRow[] = [];
  const failedRows: FailedUploadRow[] = [];
  const sheetsProcessed: string[] = [];

  let anyRackColumn = false;
  let anyPriceColumn = false;
  let anyStockColumn = false;
  let totalDataRowsSeen = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
    });

    let activeHeader: HeaderColumnMap | null = null;
    let sheetValidCount = 0;

    for (let rowIdx = 0; rowIdx < matrix.length; rowIdx += 1) {
      const row = Array.isArray(matrix[rowIdx]) ? matrix[rowIdx] : [];
      const rowNumber = rowIdx + 1;

      if (isRowCompletelyBlank(row)) {
        continue;
      }

      const detectedHeader = detectHeaderColumns(row);
      if (detectedHeader) {
        activeHeader = detectedHeader;
        if (detectedHeader.rackIdx !== -1) anyRackColumn = true;
        if (detectedHeader.priceIdx !== -1) anyPriceColumn = true;
        if (detectedHeader.stockIdx !== -1) anyStockColumn = true;
        continue;
      }

      // Lewati baris judul/pengantar sebelum header pertama ditemukan pada sheet ini
      if (!activeHeader) {
        continue;
      }

      const rawKodePart = String(row[activeHeader.partCodeIdx] ?? '').trim();
      const rawNamaPart = String(row[activeHeader.partNameIdx] ?? '').trim();

      // Lewati baris pemisah atau nomor urut kosong tanpa kode & nama part
      if (!rawKodePart && !rawNamaPart) {
        continue;
      }

      totalDataRowsSeen += 1;
      const reasons: string[] = [];

      if (!rawKodePart) {
        reasons.push('Kode part kosong');
      }
      if (!rawNamaPart) {
        reasons.push('Nama part kosong');
      }

      const rawRack =
        activeHeader.rackIdx !== -1 ? String(row[activeHeader.rackIdx] ?? '').trim() : '';

      const parsedPrice =
        activeHeader.priceIdx !== -1
          ? parseOptionalNonNegativeNumber(row[activeHeader.priceIdx])
          : { empty: true, value: null };
      if (!parsedPrice.empty && parsedPrice.value === null) {
        reasons.push('Harga bukan angka valid');
      }

      const parsedCategory =
        activeHeader.categoryIdx !== -1
          ? parseOptionalCategory(row[activeHeader.categoryIdx])
          : { empty: true, value: null };
      if (!parsedCategory.empty && parsedCategory.value === null) {
        reasons.push('Kategori harus Fast Moving atau Slow Moving');
      }

      const parsedStock =
        activeHeader.stockIdx !== -1
          ? parseOptionalNonNegativeNumber(row[activeHeader.stockIdx])
          : { empty: true, value: null };
      if (!parsedStock.empty && (parsedStock.value === null || !Number.isInteger(parsedStock.value))) {
        reasons.push('Stok bukan angka bulat valid');
      }

      const parsedMinStock =
        activeHeader.minStockIdx !== -1
          ? parseOptionalNonNegativeNumber(row[activeHeader.minStockIdx])
          : { empty: true, value: null };
      if (
        !parsedMinStock.empty &&
        (parsedMinStock.value === null || !Number.isInteger(parsedMinStock.value))
      ) {
        reasons.push('Stok minimum bukan angka bulat valid');
      }

      const normalizedKey = normalizePartCodeKey(rawKodePart);
      if (rawKodePart && !normalizedKey) {
        reasons.push('Format kode part tidak valid');
      }

      if (reasons.length > 0) {
        const prefix = workbook.SheetNames.length > 1 ? `${sheetName} Baris ${rowNumber}` : `Baris ${rowNumber}`;
        failedRows.push({
          rowNumber,
          sheetName,
          rawPartCode: rawKodePart || '-',
          reason: `${prefix}: ${reasons.join('; ')}`,
        });
        continue;
      }

      const stockKnown = !parsedStock.empty && parsedStock.value !== null;
      const finalStock = stockKnown ? parsedStock.value! : null;
      const finalMinStock = stockKnown
        ? !parsedMinStock.empty && parsedMinStock.value !== null
          ? parsedMinStock.value
          : 0
        : null;

      const hasPrice = !parsedPrice.empty && parsedPrice.value !== null;
      const isSub = isHondaSubstitutionCode(rawNamaPart);

      extractedRows.push({
        sheetName,
        rowNumber,
        normalizedKey,
        kodePart: rawKodePart.toUpperCase(),
        rawName: rawNamaPart,
        kodeRak: rawRack ? rawRack.toUpperCase() : '-',
        harga: hasPrice ? Math.round(parsedPrice.value!) : null,
        priceSource: hasPrice ? 'warehouse' : 'none',
        explicitCategory: parsedCategory.value,
        stok: finalStock,
        stokMinimum: finalMinStock,
        stockKnown,
        isSubstitutionName: isSub,
        substitutionTargetKey: isSub ? normalizePartCodeKey(rawNamaPart) : null,
        substitutionTargetDisplay: isSub ? rawNamaPart.trim().toUpperCase() : null,
      });

      sheetValidCount += 1;
    }

    if (sheetValidCount > 0) {
      sheetsProcessed.push(sheetName);
    }
  }

  // Indeks nama deskriptif & rantai substitusi lintas seluruh sheet
  const descriptiveNameByKey = new Map<string, string>();
  const substitutionLinkByKey = new Map<string, { targetKey: string; targetDisplay: string }>();

  for (const row of extractedRows) {
    if (!row.isSubstitutionName) {
      if (!descriptiveNameByKey.has(row.normalizedKey)) {
        descriptiveNameByKey.set(row.normalizedKey, row.rawName.trim().toUpperCase());
      }
    } else if (row.substitutionTargetKey && row.substitutionTargetDisplay) {
      if (!substitutionLinkByKey.has(row.normalizedKey)) {
        substitutionLinkByKey.set(row.normalizedKey, {
          targetKey: row.substitutionTargetKey,
          targetDisplay: row.substitutionTargetDisplay,
        });
      }
    }
  }

  // Resolusi rantai substitusi (dengan guard siklus dan kedalaman maks 5) + deduplikasi lintas sheet
  const mergedByKey = new Map<string, ParsedWarehouseRow>();
  let duplicateMergedCount = 0;
  let substitutionResolvedCount = 0;

  for (const row of extractedRows) {
    let resolvedName = row.rawName.trim().toUpperCase();
    let substitutedBy: string | null = null;
    let aiEnriched = false;
    const aliasesSet = new Set<string>();
    aliasesSet.add(row.kodePart.toLowerCase());
    aliasesSet.add(row.normalizedKey.toLowerCase());

    if (row.isSubstitutionName && row.substitutionTargetKey) {
      let currentKey = row.substitutionTargetKey;
      let finalTargetKey = currentKey;
      let finalTargetDisplay = row.substitutionTargetDisplay || currentKey;
      const visited = new Set<string>([row.normalizedKey]);
      let foundRealName: string | null = null;

      for (let depth = 0; depth < 5; depth += 1) {
        aliasesSet.add(currentKey.toLowerCase());
        const directName = descriptiveNameByKey.get(currentKey);
        if (directName) {
          foundRealName = directName;
          finalTargetKey = currentKey;
          break;
        }
        if (visited.has(currentKey)) {
          break;
        }
        visited.add(currentKey);
        const nextLink = substitutionLinkByKey.get(currentKey);
        if (!nextLink) {
          break;
        }
        finalTargetKey = nextLink.targetKey;
        finalTargetDisplay = nextLink.targetDisplay;
        currentKey = nextLink.targetKey;
      }

      substitutedBy = finalTargetKey;
      aliasesSet.add(finalTargetKey.toLowerCase());
      aliasesSet.add(finalTargetDisplay.toLowerCase());

      if (foundRealName) {
        resolvedName = foundRealName;
        substitutionResolvedCount += 1;
      } else {
        resolvedName = `Kode Pengganti: ${finalTargetDisplay}`;
        aiEnriched = false;
      }
    }

    const kategori =
      row.explicitCategory ?? classifyHondaPartCategory(resolvedName, row.kodePart);

    const existing = mergedByKey.get(row.normalizedKey);
    if (existing) {
      duplicateMergedCount += 1;

      const existingIsPlaceholder = existing.namaResmi.startsWith('Kode Pengganti:');
      const incomingIsPlaceholder = resolvedName.startsWith('Kode Pengganti:');

      const chosenName =
        existingIsPlaceholder && !incomingIsPlaceholder ? resolvedName : existing.namaResmi;
      const chosenCategory =
        row.explicitCategory ??
        (existingIsPlaceholder && !incomingIsPlaceholder
          ? classifyHondaPartCategory(chosenName, existing.kodePart)
          : existing.kategori);

      const mergedAliases = Array.from(new Set([...existing.aliases, ...aliasesSet]));

      mergedByKey.set(row.normalizedKey, {
        ...existing,
        namaResmi: chosenName,
        kodeRak: existing.kodeRak !== '-' ? existing.kodeRak : row.kodeRak,
        harga: existing.harga !== null ? existing.harga : row.harga,
        priceSource: existing.harga !== null ? existing.priceSource : row.priceSource,
        kategori: chosenCategory,
        stok: existing.stockKnown ? existing.stok : row.stok,
        stokMinimum: existing.stockKnown ? existing.stokMinimum : row.stokMinimum,
        stockKnown: existing.stockKnown || row.stockKnown,
        substitutedBy: existing.substitutedBy || substitutedBy,
        aliases: mergedAliases,
        aiEnriched: existing.aiEnriched || aiEnriched,
      });
    } else {
      mergedByKey.set(row.normalizedKey, {
        normalizedKey: row.normalizedKey,
        kodePart: row.kodePart,
        namaResmi: resolvedName,
        kodeRak: row.kodeRak,
        harga: row.harga,
        priceSource: row.priceSource,
        kategori,
        stok: row.stok,
        stokMinimum: row.stokMinimum,
        stockKnown: row.stockKnown,
        substitutedBy,
        aliases: Array.from(aliasesSet),
        aiEnriched,
      });
    }
  }

  return {
    totalRows: totalDataRowsSeen,
    validRows: Array.from(mergedByKey.values()),
    failedRows,
    sheetsProcessed,
    duplicateMergedCount,
    substitutionResolvedCount,
    missingRack: !anyRackColumn,
    missingPrice: !anyPriceColumn,
    missingStock: !anyStockColumn,
  };
}

/**
 * Mengunduh template CSV standar untuk impor data gudang PaP Asist.
 * Catatan: Untuk ekspor gambar/PDF di masa depan, gunakan utilitas watermark terpusat di `src/utils/watermark.ts`.
 */
export function downloadWarehouseTemplateCsv(): void {
  const sampleRows = [
    WAREHOUSE_TEMPLATE_HEADERS.join(','),
    '51410-KVB-901,PIPE COMP FR FORK,A-01-03,125000,fast,8,4',
    '06455-KVB-901,"PAD SET, FR BRAKE",A-07-02,72000,fast moving,5,2',
    '12391-KPH-900,"GASKET COMP., CYLINDER HEAD COVER (OH)",B-02-01,38000,slow moving,4,3',
  ];

  const csvContent = `${sampleRows.join('\r\n')}\r\n`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'template-gudang-pap-asist.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
