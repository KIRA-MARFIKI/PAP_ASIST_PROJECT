-- PaP Asist: Partial Warehouse Import Support, Reference Pricing Source, Substitution Codes & AI Enrichment Tracking

-- 1. Update public.warehouse_parts for nullable price/stock/min_stock and enrichment metadata
ALTER TABLE public.warehouse_parts
  ALTER COLUMN price DROP NOT NULL,
  ALTER COLUMN price DROP DEFAULT,
  ALTER COLUMN stock DROP NOT NULL,
  ALTER COLUMN stock DROP DEFAULT,
  ALTER COLUMN min_stock DROP NOT NULL,
  ALTER COLUMN min_stock DROP DEFAULT;

ALTER TABLE public.warehouse_parts
  ADD COLUMN IF NOT EXISTS price_source text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stock_known boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS substituted_by text,
  ADD COLUMN IF NOT EXISTS catalog_url text,
  ADD COLUMN IF NOT EXISTS ai_enriched boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'warehouse_parts_price_source_check'
      AND conrelid = 'public.warehouse_parts'::regclass
  ) THEN
    ALTER TABLE public.warehouse_parts
      ADD CONSTRAINT warehouse_parts_price_source_check
      CHECK (price_source IN ('warehouse', 'cengkareng', 'none'));
  END IF;
END;
$$;

UPDATE public.warehouse_parts
SET stock_known = true
WHERE stock IS NOT NULL
  AND min_stock IS NOT NULL;

UPDATE public.warehouse_parts
SET price_source = 'warehouse'
WHERE price IS NOT NULL
  AND price > 0
  AND price_source = 'none';

DROP INDEX IF EXISTS public.idx_warehouse_parts_low_stock;
CREATE INDEX idx_warehouse_parts_low_stock
  ON public.warehouse_parts (stock, min_stock)
  WHERE stock_known = true
    AND stock IS NOT NULL
    AND min_stock IS NOT NULL
    AND stock < min_stock;

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_enrichment_pending
  ON public.warehouse_parts (updated_at ASC)
  WHERE ai_enriched = false
    OR price IS NULL
    OR official_name LIKE 'Kode Pengganti:%';

-- 2. Update public.stock_import_logs for multi-sheet and duplicate merge reporting
ALTER TABLE public.stock_import_logs
  ADD COLUMN IF NOT EXISTS duplicate_merged_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sheets_processed text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stock_import_logs_duplicate_merged_count_check'
      AND conrelid = 'public.stock_import_logs'::regclass
  ) THEN
    ALTER TABLE public.stock_import_logs
      ADD CONSTRAINT stock_import_logs_duplicate_merged_count_check
      CHECK (duplicate_merged_count >= 0);
  END IF;
END;
$$;
