export type RackZone = 'wall_display' | 'etalase' | 'aquarium' | 'ruang_b';
export type ItemGroup = 'sparepart' | 'aksesoris' | 'apparel';

export interface WarehouseRackDefinition {
  rackCode: string;
  zone: RackZone;
  zoneLabel: 'Wall Display' | 'Etalase Pajangan' | 'Aquarium Part' | 'Ruang B';
  aisle: 'B-01' | 'B-02' | null;
  slotNumber: number;
  scope: 'aksesoris_apparel';
  allowedItemsSummary: string;
  sortOrder: number;
}

export interface RackResolutionResult {
  isAccessoryOrApparel: boolean;
  itemGroup: ItemGroup;
  suggestedRackCode: string | null;
  zoneLabel: WarehouseRackDefinition['zoneLabel'] | null;
  matchedRule: string | null;
  isDummyRack: boolean;
}

export const ACCESSORY_APPAREL_RACKS: readonly WarehouseRackDefinition[] = [
  {
    rackCode: 'Wall Display Baju',
    zone: 'wall_display',
    zoneLabel: 'Wall Display',
    aisle: null,
    slotNumber: 1,
    scope: 'aksesoris_apparel',
    allowedItemsSummary:
      'Semua pakaian dan atasan apparel Honda (baju, kaos, t-shirt, polo, jaket, jersey, hoodie, kemeja, rompi, vest).',
    sortOrder: 1,
  },
  {
    rackCode: 'Wall Display Helm',
    zone: 'wall_display',
    zoneLabel: 'Wall Display',
    aisle: null,
    slotNumber: 2,
    scope: 'aksesoris_apparel',
    allowedItemsSummary: 'Semua helm resmi Honda (half face, full face, TRX).',
    sortOrder: 2,
  },
  {
    rackCode: 'Etalase 1',
    zone: 'etalase',
    zoneLabel: 'Etalase Pajangan',
    aisle: null,
    slotNumber: 1,
    scope: 'aksesoris_apparel',
    allowedItemsSummary:
      'Sarung tangan (gloves), serta pouch/tas kecil dan topi (dapat ditukar dengan Etalase 2).',
    sortOrder: 3,
  },
  {
    rackCode: 'Etalase 2',
    zone: 'etalase',
    zoneLabel: 'Etalase Pajangan',
    aisle: null,
    slotNumber: 2,
    scope: 'aksesoris_apparel',
    allowedItemsSummary:
      'Pouch/poct, waistbag, sling bag, tas kecil, dan topi/cap (dapat ditukar dengan Etalase 1).',
    sortOrder: 4,
  },
  {
    rackCode: 'Etalase 3',
    zone: 'etalase',
    zoneLabel: 'Etalase Pajangan',
    aisle: null,
    slotNumber: 3,
    scope: 'aksesoris_apparel',
    allowedItemsSummary:
      'Khusus aksesoris kecil: dompet, gelang, patch, stiker baju, emblem kain, pin, lanyard, gantungan kunci.',
    sortOrder: 5,
  },
  {
    rackCode: 'Aquarium Part',
    zone: 'aquarium',
    zoneLabel: 'Aquarium Part',
    aisle: null,
    slotNumber: 1,
    scope: 'aksesoris_apparel',
    allowedItemsSummary:
      'Khusus paket bundling aksesoris motor Honda dengan awalan kode part 0800A.',
    sortOrder: 6,
  },
  ...Array.from({ length: 8 }, (_, idx): WarehouseRackDefinition => {
    const slot = idx + 1;
    const code = `B-01-${String(slot).padStart(3, '0')}`;
    return {
      rackCode: code,
      zone: 'ruang_b',
      zoneLabel: 'Ruang B',
      aisle: 'B-01',
      slotNumber: slot,
      scope: 'aksesoris_apparel',
      allowedItemsSummary: `Aksesoris motor besar dan aksesoris bodi/garnish/visor non-0800A (Baris B-01 Slot ${slot}).`,
      sortOrder: 6 + slot,
    };
  }),
  ...Array.from({ length: 8 }, (_, idx): WarehouseRackDefinition => {
    const slot = idx + 1;
    const code = `B-02-${String(slot).padStart(3, '0')}`;
    return {
      rackCode: code,
      zone: 'ruang_b',
      zoneLabel: 'Ruang B',
      aisle: 'B-02',
      slotNumber: slot,
      scope: 'aksesoris_apparel',
      allowedItemsSummary: `Aksesoris motor besar seperti step floor, karpet, seat cover, rear carrier, top box, crash bar (Baris B-02 Slot ${slot}).`,
      sortOrder: 14 + slot,
    };
  }),
] as const;

const NON_ACCESSORY_08_PREFIXES = [
  '08232',
  '08234',
  '08203',
  '08294',
  '08226',
  '08CLN',
  '08CLA',
  '08798',
  '08880',
];

function normalizeCode(raw?: string): string {
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function stableHash(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const MECHANICAL_CAP_CONTEXT =
  /\b(comp|assy|oil|fuel|filler|noise|suppressor|spark|plug|radiator|valve|bleeder|tappet|hole|master|cylinder|fork|handle|wheel|battery|tank|reserve|socket|rubber|dust|steering|swingarm|crankcase|gear|hub|nut|bolt|lock|fuse|relay|mirror|brake|clutch|drain|air|cleaner|filter|exhaust|muffler|caliper|shock|grip)\b/i;

const RUANG_B_AISLE_B2_KEYWORDS =
  /\b(step\s*floor|panel\s*step|karpet|rubber\s*step|seat\s*cover|cover\s*jok|rear\s*carrier|rak\s*belakang|bracket\s*box|top\s*box|crash\s*bar|hand\s*guard|handguard|frame\s*slider)\b/i;

const RUANG_B_GENERAL_ACCESSORY_KEYWORDS =
  /\b(garnish|visor|windshield|step\s*floor|karpet|rubber\s*step|seat\s*cover|cover\s*jok|rear\s*carrier|rak\s*belakang|bracket\s*box|top\s*box|crash\s*bar|hand\s*guard|handguard|tank\s*pad|side\s*pad|panel\s*step|aksesoris\s*motor|cover\s*knalpot\s*aksesoris|mud\s*flap|frame\s*slider)\b/i;

export function resolveAccessoryApparelRack(input: {
  partCode?: string;
  officialName?: string;
  userQuery?: string;
}): RackResolutionResult {
  const normCode = normalizeCode(input.partCode);
  const combinedText = [input.officialName || '', input.userQuery || '']
    .join(' ')
    .trim()
    .replace(/\s+/g, ' ');

  if (
    normCode.startsWith('0800A') ||
    /\b(bundling|paket\s+aksesoris)\b/i.test(combinedText)
  ) {
    return {
      isAccessoryOrApparel: true,
      itemGroup: 'aksesoris',
      suggestedRackCode: 'Aquarium Part',
      zoneLabel: 'Aquarium Part',
      matchedRule: 'Aturan 5: Bundling aksesoris motor awalan kode 0800A',
      isDummyRack: true,
    };
  }

  if (
    /\b(dompet|wallet|gelang|bracelet|wristband|patch|stiker\s*baju|sticker\s*baju|emblem\s*(?:baju|kain)|gantungan\s*kunci|key\s*chain|lanyard|pin\s*apparel)\b/i.test(
      combinedText
    )
  ) {
    return {
      isAccessoryOrApparel: true,
      itemGroup: 'apparel',
      suggestedRackCode: 'Etalase 3',
      zoneLabel: 'Etalase Pajangan',
      matchedRule: 'Aturan 4: Aksesoris kecil (dompet, gelang, patch, stiker baju, pin, lanyard)',
      isDummyRack: true,
    };
  }

  if (
    /\b(baju|kaos|t-?shirt|polo|jaket|jacket|jersey|hoodie|kemeja|rompi|vest|sweater|apparel\s+shirt)\b/i.test(
      combinedText
    )
  ) {
    return {
      isAccessoryOrApparel: true,
      itemGroup: 'apparel',
      suggestedRackCode: 'Wall Display Baju',
      zoneLabel: 'Wall Display',
      matchedRule: 'Aturan 1: Semua baju, kaos, jaket, dan apparel atasan',
      isDummyRack: true,
    };
  }

  if (
    /\b(helm|helmet|trx-?\s*3|half\s*face|full\s*face)\b/i.test(combinedText) &&
    !/\b(hook\s*helm|kunci\s*helm|holder\s*helm|helmet\s*holder|helmet\s*lock|kaitan\s*helm|box\s*helm|bagasi\s*helm)\b/i.test(
      combinedText
    )
  ) {
    return {
      isAccessoryOrApparel: true,
      itemGroup: 'apparel',
      suggestedRackCode: 'Wall Display Helm',
      zoneLabel: 'Wall Display',
      matchedRule: 'Aturan 2: Semua helm resmi Honda',
      isDummyRack: true,
    };
  }

  if (/\b(sarung\s*tangan|gloves?)\b/i.test(combinedText)) {
    return {
      isAccessoryOrApparel: true,
      itemGroup: 'apparel',
      suggestedRackCode: 'Etalase 1',
      zoneLabel: 'Etalase Pajangan',
      matchedRule: 'Aturan 3: Sarung tangan pada Etalase 1 (dapat ditukar Etalase 2)',
      isDummyRack: true,
    };
  }

  const isPouchOrHat =
    /\b(pouch|poct|waist\s*bag|sling\s*bag|tas\s*kecil|topi|hat|beanie|baseball\s*cap|trucker\s*cap)\b/i.test(
      combinedText
    ) ||
    (/\bcap\b/i.test(combinedText) && !MECHANICAL_CAP_CONTEXT.test(combinedText));

  if (isPouchOrHat) {
    return {
      isAccessoryOrApparel: true,
      itemGroup: 'apparel',
      suggestedRackCode: 'Etalase 2',
      zoneLabel: 'Etalase Pajangan',
      matchedRule: 'Aturan 3: Pouch/poct, tas kecil, dan topi pada Etalase 2 (dapat ditukar Etalase 1)',
      isDummyRack: true,
    };
  }

  const isNonChemical08Code =
    normCode.length >= 8 &&
    normCode.startsWith('08') &&
    !normCode.startsWith('0800A') &&
    !NON_ACCESSORY_08_PREFIXES.some((prefix) => normCode.startsWith(prefix));

  const isMotorcycleAccessoryKeyword = RUANG_B_GENERAL_ACCESSORY_KEYWORDS.test(combinedText);

  if (isNonChemical08Code || isMotorcycleAccessoryKeyword) {
    const aisle: 'B-01' | 'B-02' = RUANG_B_AISLE_B2_KEYWORDS.test(combinedText) ? 'B-02' : 'B-01';
    const hashSeed =
      normCode.length >= 5 ? normCode : combinedText.toLowerCase().replace(/[^a-z0-9]/g, '');
    const slot = (stableHash(hashSeed || 'accessory') % 8) + 1;
    const rackCode = `${aisle}-${String(slot).padStart(3, '0')}`;

    return {
      isAccessoryOrApparel: true,
      itemGroup: 'aksesoris',
      suggestedRackCode: rackCode,
      zoneLabel: 'Ruang B',
      matchedRule:
        aisle === 'B-01'
          ? 'Aturan 6: Aksesoris motor besar/bodi/garnish/visor pada Ruang B (Baris B-01)'
          : 'Aturan 6: Aksesoris motor besar (step floor/karpet/jok/rak/box) pada Ruang B (Baris B-02)',
      isDummyRack: true,
    };
  }

  return {
    isAccessoryOrApparel: false,
    itemGroup: 'sparepart',
    suggestedRackCode: null,
    zoneLabel: null,
    matchedRule: null,
    isDummyRack: false,
  };
}
