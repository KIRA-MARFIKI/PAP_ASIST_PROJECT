-- PaP Asist (Padang Panjang Part Asisten) - Initial Schema, RLS Policies, and 12-Digit PIN RPC

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Warehouse Parts Inventory
CREATE TABLE IF NOT EXISTS public.warehouse_parts (
  part_code text PRIMARY KEY,
  part_code_display text NOT NULL,
  official_name text NOT NULL,
  rack_code text NOT NULL DEFAULT '-',
  price numeric(12,0) NOT NULL DEFAULT 0 CHECK (price >= 0),
  category text NOT NULL CHECK (category IN ('fast', 'slow')),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock integer NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  photo_url text,
  aliases text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_category
  ON public.warehouse_parts (category);

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_official_name_lower
  ON public.warehouse_parts (lower(official_name));

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_low_stock
  ON public.warehouse_parts (stock, min_stock);

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_aliases_gin
  ON public.warehouse_parts USING gin (aliases);

-- 2. Honda Catalog Grounding Cache (Edge Function service-role access only)
CREATE TABLE IF NOT EXISTS public.catalog_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_normalized text UNIQUE NOT NULL,
  official_name text NOT NULL,
  part_codes text[] NOT NULL DEFAULT '{}',
  catalog_photo_url text,
  source_url text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  cached_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_cache_cached_at
  ON public.catalog_cache (cached_at DESC);

-- 3. Warehouse Admin Profiles (links Supabase Auth users to bcrypt-hashed 12-digit PIN)
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  role text NOT NULL DEFAULT 'warehouse_admin',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Stock Import Logs (Admin Asist upload history)
CREATE TABLE IF NOT EXISTS public.stock_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_by_name text NOT NULL,
  file_name text NOT NULL,
  total_rows integer NOT NULL CHECK (total_rows >= 0),
  success_count integer NOT NULL CHECK (success_count >= 0),
  failed_count integer NOT NULL CHECK (failed_count >= 0),
  status text NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_import_logs_created_at
  ON public.stock_import_logs (created_at DESC);

-- Trigger helper to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warehouse_parts_updated_at ON public.warehouse_parts;
CREATE TRIGGER trg_warehouse_parts_updated_at
  BEFORE UPDATE ON public.warehouse_parts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_admin_profiles_updated_at ON public.admin_profiles;
CREATE TRIGGER trg_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Helper function for RLS admin checks
CREATE OR REPLACE FUNCTION public.is_warehouse_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE user_id = auth.uid()
      AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_warehouse_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_warehouse_admin() TO anon, authenticated, service_role;

-- 5. RPC: Verify 12-Digit Admin PIN (called immediately after signInWithPassword)
CREATE OR REPLACE FUNCTION public.verify_admin_pin(
  p_pin text,
  p_full_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.admin_profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('verified', false, 'full_name', NULL, 'role', NULL);
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{12}$' THEN
    RETURN jsonb_build_object('verified', false, 'full_name', NULL, 'role', NULL);
  END IF;

  SELECT *
  INTO v_profile
  FROM public.admin_profiles
  WHERE user_id = v_uid
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('verified', false, 'full_name', NULL, 'role', NULL);
  END IF;

  IF v_profile.pin_hash = extensions.crypt(p_pin, v_profile.pin_hash) THEN
    RETURN jsonb_build_object(
      'verified', true,
      'full_name', COALESCE(NULLIF(trim(p_full_name), ''), v_profile.full_name),
      'role', v_profile.role
    );
  END IF;

  RETURN jsonb_build_object('verified', false, 'full_name', NULL, 'role', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_admin_pin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(text, text) TO authenticated, service_role;

-- 6. RPC: Admin Registration Helper (SQL Editor / service_role only, never exposed to public clients)
CREATE OR REPLACE FUNCTION public.upsert_admin_profile_pin(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_pin text,
  p_role text DEFAULT 'warehouse_admin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'PIN admin harus tepat 12 digit angka.';
  END IF;

  INSERT INTO public.admin_profiles (user_id, full_name, email, pin_hash, role, is_active)
  VALUES (
    p_user_id,
    trim(p_full_name),
    lower(trim(p_email)),
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    COALESCE(NULLIF(trim(p_role), ''), 'warehouse_admin'),
    true
  )
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      pin_hash = EXCLUDED.pin_hash,
      role = EXCLUDED.role,
      is_active = true,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_admin_profile_pin(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_admin_profile_pin(uuid, text, text, text, text) TO service_role;

-- 7. Row Level Security (RLS)
ALTER TABLE public.warehouse_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_import_logs ENABLE ROW LEVEL SECURITY;

-- warehouse_parts: public read, admin-only write
DROP POLICY IF EXISTS "warehouse_parts_select_public" ON public.warehouse_parts;
CREATE POLICY "warehouse_parts_select_public"
  ON public.warehouse_parts
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "warehouse_parts_insert_admin" ON public.warehouse_parts;
CREATE POLICY "warehouse_parts_insert_admin"
  ON public.warehouse_parts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_warehouse_admin());

DROP POLICY IF EXISTS "warehouse_parts_update_admin" ON public.warehouse_parts;
CREATE POLICY "warehouse_parts_update_admin"
  ON public.warehouse_parts
  FOR UPDATE
  TO authenticated
  USING (public.is_warehouse_admin())
  WITH CHECK (public.is_warehouse_admin());

DROP POLICY IF EXISTS "warehouse_parts_delete_admin" ON public.warehouse_parts;
CREATE POLICY "warehouse_parts_delete_admin"
  ON public.warehouse_parts
  FOR DELETE
  TO authenticated
  USING (public.is_warehouse_admin());

-- stock_import_logs: admin-only read and insert
DROP POLICY IF EXISTS "stock_import_logs_select_admin" ON public.stock_import_logs;
CREATE POLICY "stock_import_logs_select_admin"
  ON public.stock_import_logs
  FOR SELECT
  TO authenticated
  USING (public.is_warehouse_admin());

DROP POLICY IF EXISTS "stock_import_logs_insert_admin" ON public.stock_import_logs;
CREATE POLICY "stock_import_logs_insert_admin"
  ON public.stock_import_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_warehouse_admin());

-- admin_profiles: owner read-only, no direct client insert/update/delete on pin_hash
DROP POLICY IF EXISTS "admin_profiles_select_self" ON public.admin_profiles;
CREATE POLICY "admin_profiles_select_self"
  ON public.admin_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- catalog_cache: no anon/authenticated policies (accessible only via service_role in Edge Functions)
