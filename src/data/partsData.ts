import { PartItem } from '../types/part';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapPartName(name: string, maxChars = 16): string[] {
  const words = name.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/**
 * Placeholder foto netral bertuliskan nama resmi part.
 * Mudah diganti dengan URL foto asli dari gudang Honda Motor Padang Panjang.
 */
export function createPartPlaceholder(partName: string): string {
  const lines = wrapPartName(partName, 16);
  const startY = 82 - (lines.length - 1) * 7;
  const textSpans = lines
    .map(
      (line, idx) =>
        `<tspan x="80" y="${startY + idx * 15}">${escapeXml(line)}</tspan>`
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <rect width="160" height="160" rx="8" fill="#F4F4F5"/>
  <rect x="0.5" y="0.5" width="159" height="159" rx="7.5" fill="none" stroke="#E4E4E7"/>
  <text x="80" y="46" text-anchor="middle" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="11" font-weight="500" fill="#71717A">Foto contoh</text>
  <text text-anchor="middle" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#27272A">${textSpans}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Data contoh untuk prototype (12 part Honda).
 * 3 part sengaja disetel stok < stokMinimum untuk menguji notifikasi stok menipis.
 * Lapisan akses data dipisahkan di src/services/partsRepository.ts agar mudah diganti ke database.
 */
export const DUMMY_PARTS: PartItem[] = [
  {
    id: 'part-01',
    foto: createPartPlaceholder('PIPE COMP FR FORK'),
    namaResmi: 'PIPE COMP FR FORK',
    kodePart: '51410-KVB-901',
    kodeRak: 'A-01-03',
    harga: 125000,
    priceSource: 'warehouse',
    kategori: 'fast',
    stok: 2,
    stokMinimum: 4,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'batang padi',
      'as shock depan',
      'as sok depan',
      'pipa shock depan',
      'pipa sok depan',
      'front fork pipe',
      'fork pipe',
      'fork tube',
      'tube shock depan',
    ],
  },
  {
    id: 'part-02',
    foto: createPartPlaceholder('GASKET COMP., CYLINDER HEAD COVER (OH)'),
    namaResmi: 'GASKET COMP., CYLINDER HEAD COVER (OH)',
    kodePart: '12391-KPH-900',
    kodeRak: 'B-02-01',
    harga: 38000,
    priceSource: 'warehouse',
    kategori: 'slow',
    stok: 1,
    stokMinimum: 3,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'karet tutup deksel',
      'karet deksel',
      'paking tutup deksel',
      'paking tutup klep',
      'karet tutup klep',
      'seal head cover',
      'cylinder head cover gasket',
      'head cover gasket',
    ],
  },
  {
    id: 'part-03',
    foto: createPartPlaceholder('PAD SET, FR BRAKE'),
    namaResmi: 'PAD SET, FR BRAKE',
    kodePart: '06455-KVB-901',
    kodeRak: 'A-07-02',
    harga: 72000,
    priceSource: 'warehouse',
    kategori: 'fast',
    stok: 0,
    stokMinimum: 2,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'kampas rem depan',
      'kanvas rem depan',
      'dispad depan',
      'disc pad',
      'brake pad',
      'front brake pad',
      'kampas cakram depan',
    ],
  },
  {
    id: 'part-04',
    foto: createPartPlaceholder('ELEMENT COMP., AIR CLEANER'),
    namaResmi: 'ELEMENT COMP., AIR CLEANER',
    kodePart: '17210-KVB-900',
    kodeRak: 'A-03-02',
    harga: 54000,
    priceSource: 'warehouse',
    kategori: 'fast',
    stok: 11,
    stokMinimum: 5,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'filter udara',
      'saringan udara',
      'saringan hawa',
      'air filter',
      'air cleaner',
      'elemen filter udara',
    ],
  },
  {
    id: 'part-05',
    foto: createPartPlaceholder('SPARK PLUG (NGK CPR6EA-9)'),
    namaResmi: 'SPARK PLUG (NGK CPR6EA-9)',
    kodePart: '31916-KPH-901',
    kodeRak: 'A-04-01',
    harga: 22000,
    priceSource: 'warehouse',
    kategori: 'fast',
    stok: 18,
    stokMinimum: 8,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'busi',
      'busi motor',
      'spark plug',
      'busi beat',
      'busi matic',
    ],
  },
  {
    id: 'part-06',
    foto: createPartPlaceholder('SHOE SET, BRAKE'),
    namaResmi: 'SHOE SET, BRAKE',
    kodePart: '06430-KPH-951',
    kodeRak: 'A-05-04',
    harga: 47000,
    priceSource: 'warehouse',
    kategori: 'fast',
    stok: 6,
    stokMinimum: 4,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'kampas rem belakang',
      'kanvas rem tromol',
      'kampas tromol',
      'brake shoe',
      'rear brake shoe',
    ],
  },
  {
    id: 'part-07',
    foto: createPartPlaceholder('BELT, DRIVE'),
    namaResmi: 'BELT, DRIVE',
    kodePart: '23100-K1A-N01',
    kodeRak: 'A-02-05',
    harga: 138000,
    priceSource: 'warehouse',
    kategori: 'fast',
    stok: 9,
    stokMinimum: 4,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'vanbelt',
      'v-belt',
      'v belt',
      'fan belt',
      'tali kipas matic',
      'drive belt',
      'sabuk cvt',
    ],
  },
  {
    id: 'part-08',
    foto: createPartPlaceholder('ROLLER SET, WEIGHT'),
    namaResmi: 'ROLLER SET, WEIGHT',
    kodePart: '2212A-K44-V00',
    kodeRak: 'A-06-01',
    harga: 52000,
    priceSource: 'warehouse',
    kategori: 'fast',
    stok: 10,
    stokMinimum: 5,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'roller',
      'roler',
      'roller cvt',
      'pemberat cvt',
      'weight roller',
    ],
  },
  {
    id: 'part-09',
    foto: createPartPlaceholder('FENDER, FR'),
    namaResmi: 'FENDER, FR',
    kodePart: '61100-K1A-N00',
    kodeRak: 'C-01-02',
    harga: 165000,
    priceSource: 'warehouse',
    kategori: 'slow',
    stok: 5,
    stokMinimum: 2,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'spakbord',
      'spakbor',
      'spakbor depan',
      'spakbord depan',
      'slebor depan',
      'front fender',
      'fender depan',
    ],
  },
  {
    id: 'part-10',
    foto: createPartPlaceholder('HEADLIGHT UNIT'),
    namaResmi: 'HEADLIGHT UNIT',
    kodePart: '33100-K1A-N01',
    kodeRak: 'C-03-01',
    harga: 485000,
    priceSource: 'warehouse',
    kategori: 'slow',
    stok: 3,
    stokMinimum: 2,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'lampu depan',
      'reflektor depan',
      'batok lampu depan',
      'headlamp',
      'headlight',
    ],
  },
  {
    id: 'part-11',
    foto: createPartPlaceholder('CABLE COMP., THROTTLE'),
    namaResmi: 'CABLE COMP., THROTTLE',
    kodePart: '17910-K81-N01',
    kodeRak: 'B-04-03',
    harga: 45000,
    priceSource: 'warehouse',
    kategori: 'slow',
    stok: 7,
    stokMinimum: 3,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'kabel gas',
      'tali gas',
      'seling gas',
      'throttle cable',
    ],
  },
  {
    id: 'part-12',
    foto: createPartPlaceholder('SEAL SET, FR FORK'),
    namaResmi: 'SEAL SET, FR FORK',
    kodePart: '51490-KRM-852',
    kodeRak: 'B-01-04',
    harga: 58000,
    priceSource: 'warehouse',
    kategori: 'slow',
    stok: 6,
    stokMinimum: 3,
    stockKnown: true,
    aiEnriched: true,
    aliases: [
      'seal shock depan',
      'sil sok depan',
      'karet shock depan',
      'fork oil seal',
      'front fork seal',
    ],
  },
];
