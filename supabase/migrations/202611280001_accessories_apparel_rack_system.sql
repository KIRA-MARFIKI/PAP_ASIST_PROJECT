-- PaP Asist: Accessories & Apparel Master Rack System (22 Standardized Rack Codes Across 4 Zones)
-- Non-destructive migration: preserves all existing real spare part rows in public.warehouse_parts.

-- 1. Master Reference Table: public.warehouse_racks
CREATE TABLE IF NOT EXISTS public.warehouse_racks (
  rack_code text PRIMARY KEY,
  zone text NOT NULL CHECK (zone IN ('wall_display', 'etalase', 'aquarium', 'ruang_b')),
  zone_label text NOT NULL,
  aisle text,
  slot_number integer,
  scope text NOT NULL DEFAULT 'aksesoris_apparel',
  allowed_items_summary text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_racks_zone_sort
  ON public.warehouse_racks (zone, sort_order);

-- Seed all 22 standardized rack codes idempotently
INSERT INTO public.warehouse_racks (
  rack_code,
  zone,
  zone_label,
  aisle,
  slot_number,
  scope,
  allowed_items_summary,
  sort_order
)
VALUES
  (
    'Wall Display Baju',
    'wall_display',
    'Wall Display',
    NULL,
    1,
    'aksesoris_apparel',
    'Semua pakaian dan atasan apparel Honda (baju, kaos, t-shirt, polo, jaket, jersey, hoodie, kemeja, rompi, vest).',
    1
  ),
  (
    'Wall Display Helm',
    'wall_display',
    'Wall Display',
    NULL,
    2,
    'aksesoris_apparel',
    'Semua helm resmi Honda (half face, full face, TRX).',
    2
  ),
  (
    'Etalase 1',
    'etalase',
    'Etalase Pajangan',
    NULL,
    1,
    'aksesoris_apparel',
    'Sarung tangan (gloves), serta pouch/tas kecil dan topi (dapat ditukar dengan Etalase 2).',
    3
  ),
  (
    'Etalase 2',
    'etalase',
    'Etalase Pajangan',
    NULL,
    2,
    'aksesoris_apparel',
    'Pouch/poct, waistbag, sling bag, tas kecil, dan topi/cap (dapat ditukar dengan Etalase 1).',
    4
  ),
  (
    'Etalase 3',
    'etalase',
    'Etalase Pajangan',
    NULL,
    3,
    'aksesoris_apparel',
    'Khusus aksesoris kecil: dompet, gelang, patch, stiker baju, emblem kain, pin, lanyard, gantungan kunci.',
    5
  ),
  (
    'Aquarium Part',
    'aquarium',
    'Aquarium Part',
    NULL,
    1,
    'aksesoris_apparel',
    'Khusus paket bundling aksesoris motor Honda dengan awalan kode part 0800A.',
    6
  ),
  ('B-01-001', 'ruang_b', 'Ruang B', 'B-01', 1, 'aksesoris_apparel', 'Aksesoris motor besar dan aksesoris bodi/garnish/visor non-0800A (Baris B-01 Slot 1).', 7),
  ('B-01-002', 'ruang_b', 'Ruang B', 'B-01', 2, 'aksesoris_apparel', 'Aksesoris motor besar dan aksesoris bodi/garnish/visor non-0800A (Baris B-01 Slot 2).', 8),
  ('B-01-003', 'ruang_b', 'Ruang B', 'B-01', 3, 'aksesoris_apparel', 'Aksesoris motor besar dan aksesoris bodi/garnish/visor non-0800A (Baris B-01 Slot 3).', 9),
  ('B-01-004', 'ruang_b', 'Ruang B', 'B-01', 4, 'aksesoris_apparel', 'Aksesoris motor besar dan aksesoris bodi/garnish/visor non-0800A (Baris B-01 Slot 4).', 10),
  ('B-01-005', 'ruang_b', 'Ruang B', 'B-01', 5, 'aksesoris_apparel', 'Aksesoris motor besar dan aksesoris bodi/garnish/visor non-0800A (Baris B-01 Slot 5).', 11),
  ('B-01-006', 'ruang_b', 'Ruang B', 'B-01', 6, 'aksesoris_apparel', 'Aksesoris motor besar dan aksesoris bodi/garnish/visor non-0800A (Baris B-01 Slot 6).', 12),
  ('B-01-007', 'ruang_b', 'Ruang B', 'B-01', 7, 'aksesoris_apparel', 'Aksesoris motor besar dan aksesoris bodi/garnish/visor non-0800A (Baris B-01 Slot 7).', 13),
  ('B-01-008', 'ruang_b', 'Ruang B', 'B-01', 8, 'aksesoris_apparel', 'Aksesoris motor besar dan aksesoris bodi/garnish/visor non-0800A (Baris B-01 Slot 8).', 14),
  ('B-02-001', 'ruang_b', 'Ruang B', 'B-02', 1, 'aksesoris_apparel', 'Aksesoris motor besar seperti step floor, karpet, seat cover, rear carrier, top box, crash bar (Baris B-02 Slot 1).', 15),
  ('B-02-002', 'ruang_b', 'Ruang B', 'B-02', 2, 'aksesoris_apparel', 'Aksesoris motor besar seperti step floor, karpet, seat cover, rear carrier, top box, crash bar (Baris B-02 Slot 2).', 16),
  ('B-02-003', 'ruang_b', 'Ruang B', 'B-02', 3, 'aksesoris_apparel', 'Aksesoris motor besar seperti step floor, karpet, seat cover, rear carrier, top box, crash bar (Baris B-02 Slot 3).', 17),
  ('B-02-004', 'ruang_b', 'Ruang B', 'B-02', 4, 'aksesoris_apparel', 'Aksesoris motor besar seperti step floor, karpet, seat cover, rear carrier, top box, crash bar (Baris B-02 Slot 4).', 18),
  ('B-02-005', 'ruang_b', 'Ruang B', 'B-02', 5, 'aksesoris_apparel', 'Aksesoris motor besar seperti step floor, karpet, seat cover, rear carrier, top box, crash bar (Baris B-02 Slot 5).', 19),
  ('B-02-006', 'ruang_b', 'Ruang B', 'B-02', 6, 'aksesoris_apparel', 'Aksesoris motor besar seperti step floor, karpet, seat cover, rear carrier, top box, crash bar (Baris B-02 Slot 6).', 20),
  ('B-02-007', 'ruang_b', 'Ruang B', 'B-02', 7, 'aksesoris_apparel', 'Aksesoris motor besar seperti step floor, karpet, seat cover, rear carrier, top box, crash bar (Baris B-02 Slot 7).', 21),
  ('B-02-008', 'ruang_b', 'Ruang B', 'B-02', 8, 'aksesoris_apparel', 'Aksesoris motor besar seperti step floor, karpet, seat cover, rear carrier, top box, crash bar (Baris B-02 Slot 8).', 22)
ON CONFLICT (rack_code) DO UPDATE
SET zone = EXCLUDED.zone,
    zone_label = EXCLUDED.zone_label,
    aisle = EXCLUDED.aisle,
    slot_number = EXCLUDED.slot_number,
    scope = EXCLUDED.scope,
    allowed_items_summary = EXCLUDED.allowed_items_summary,
    sort_order = EXCLUDED.sort_order;

ALTER TABLE public.warehouse_racks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse_racks_select_public" ON public.warehouse_racks;
CREATE POLICY "warehouse_racks_select_public"
  ON public.warehouse_racks
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "warehouse_racks_insert_admin" ON public.warehouse_racks;
CREATE POLICY "warehouse_racks_insert_admin"
  ON public.warehouse_racks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_warehouse_admin());

DROP POLICY IF EXISTS "warehouse_racks_update_admin" ON public.warehouse_racks;
CREATE POLICY "warehouse_racks_update_admin"
  ON public.warehouse_racks
  FOR UPDATE
  TO authenticated
  USING (public.is_warehouse_admin())
  WITH CHECK (public.is_warehouse_admin());

DROP POLICY IF EXISTS "warehouse_racks_delete_admin" ON public.warehouse_racks;
CREATE POLICY "warehouse_racks_delete_admin"
  ON public.warehouse_racks
  FOR DELETE
  TO authenticated
  USING (public.is_warehouse_admin());

-- 2. Extend public.warehouse_parts non-destructively
ALTER TABLE public.warehouse_parts
  ADD COLUMN IF NOT EXISTS item_group text NOT NULL DEFAULT 'sparepart',
  ADD COLUMN IF NOT EXISTS is_dummy_rack boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'warehouse_parts_item_group_check'
      AND conrelid = 'public.warehouse_parts'::regclass
  ) THEN
    ALTER TABLE public.warehouse_parts
      ADD CONSTRAINT warehouse_parts_item_group_check
      CHECK (item_group IN ('sparepart', 'aksesoris', 'apparel'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_item_group
  ON public.warehouse_parts (item_group);

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_rack_code
  ON public.warehouse_parts (rack_code);

-- 3. Safe non-destructive classification ONLY for existing rows that match HGA/Apparel with unset rack_code ('-')
UPDATE public.warehouse_parts
SET item_group = 'aksesoris',
    rack_code = 'Aquarium Part',
    is_dummy_rack = true
WHERE rack_code = '-'
  AND part_code LIKE '0800A%';

UPDATE public.warehouse_parts
SET item_group = 'aksesoris',
    rack_code = 'B-01-00' || ((abs(hashtext(part_code)) % 8) + 1)::text,
    is_dummy_rack = true
WHERE rack_code = '-'
  AND part_code LIKE '08%'
  AND part_code NOT LIKE '0800A%'
  AND part_code NOT LIKE '08232%'
  AND part_code NOT LIKE '08234%'
  AND part_code NOT LIKE '08203%'
  AND part_code NOT LIKE '08294%'
  AND part_code NOT LIKE '08226%'
  AND part_code NOT LIKE '08CL%'
  AND part_code NOT LIKE '08798%'
  AND part_code NOT LIKE '08880%';
