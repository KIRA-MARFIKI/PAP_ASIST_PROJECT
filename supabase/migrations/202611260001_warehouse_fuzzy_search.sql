-- PaP Asist: PostgreSQL Typo-Tolerant Fuzzy Search (pg_trgm)

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.normalize_part_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(upper(trim(coalesce(p_code, ''))), '[^A-Z0-9]', '', 'g');
$$;

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_official_name_trgm
  ON public.warehouse_parts USING gin (official_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_part_code_trgm
  ON public.warehouse_parts USING gin (part_code extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_warehouse_parts_fuzzy(
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  part_code text,
  part_code_display text,
  official_name text,
  rack_code text,
  price numeric(12,0),
  price_source text,
  category text,
  stock integer,
  min_stock integer,
  stock_known boolean,
  substituted_by text,
  catalog_url text,
  ai_enriched boolean,
  photo_url text,
  aliases text[],
  updated_at timestamptz,
  match_score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH params AS (
    SELECT
      lower(trim(coalesce(p_query, ''))) AS q_lower,
      public.normalize_part_code(p_query) AS q_code,
      GREATEST(1, LEAST(COALESCE(p_limit, 8), 25)) AS row_limit
  ),
  scored AS (
    SELECT
      wp.*,
      CASE
        WHEN p.q_code <> '' AND wp.part_code = p.q_code THEN 1.0::double precision
        WHEN p.q_lower <> '' AND wp.aliases @> ARRAY[p.q_lower] THEN 0.95::double precision
        WHEN length(p.q_code) >= 5 AND wp.part_code ILIKE '%' || p.q_code || '%' THEN 0.85::double precision
        ELSE GREATEST(
          extensions.similarity(lower(wp.official_name), p.q_lower)::double precision,
          extensions.word_similarity(p.q_lower, lower(wp.official_name))::double precision
        )
      END AS score
    FROM public.warehouse_parts wp
    CROSS JOIN params p
    WHERE p.q_lower <> ''
      AND (
        (p.q_code <> '' AND wp.part_code = p.q_code)
        OR (wp.aliases @> ARRAY[p.q_lower])
        OR (length(p.q_code) >= 5 AND wp.part_code ILIKE '%' || p.q_code || '%')
        OR extensions.similarity(lower(wp.official_name), p.q_lower) >= 0.30
        OR extensions.word_similarity(p.q_lower, lower(wp.official_name)) >= 0.45
      )
  )
  SELECT
    s.part_code,
    s.part_code_display,
    s.official_name,
    s.rack_code,
    s.price,
    s.price_source,
    s.category,
    s.stock,
    s.min_stock,
    s.stock_known,
    s.substituted_by,
    s.catalog_url,
    s.ai_enriched,
    s.photo_url,
    s.aliases,
    s.updated_at,
    s.score AS match_score
  FROM scored s
  ORDER BY s.score DESC, s.official_name ASC
  LIMIT (SELECT row_limit FROM params);
$$;

REVOKE ALL ON FUNCTION public.search_warehouse_parts_fuzzy(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_warehouse_parts_fuzzy(text, integer) TO anon, authenticated, service_role;
