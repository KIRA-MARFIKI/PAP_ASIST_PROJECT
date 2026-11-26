-- PaP Asist: Default Admin Seed, Strict Admin Name Enforcement, and Credential Management RPCs

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Seed default admin account idempotently into auth.users, auth.identities, and public.admin_profiles
DO $$
DECLARE
  v_user_id uuid;
  v_email constant text := 'adminpapasist@papasist.com';
  v_full_name constant text := 'Pap Asist Admin';
  v_password_hash text;
  v_pin_hash text;
BEGIN
  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_password_hash := extensions.crypt('admin123!@#', extensions.gen_salt('bf'));

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      created_at,
      updated_at
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      v_password_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_full_name),
      '',
      '',
      '',
      '',
      now(),
      now()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.identities
    WHERE user_id = v_user_id
      AND provider = 'email'
  ) THEN
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_user_id,
      v_user_id::text,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    );
  END IF;

  v_pin_hash := extensions.crypt('123456789012', extensions.gen_salt('bf'));

  INSERT INTO public.admin_profiles (user_id, full_name, email, pin_hash, role, is_active)
  VALUES (v_user_id, v_full_name, v_email, v_pin_hash, 'super_admin', true)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- 2. Strict mandatory admin name enforcement + 12-digit PIN verification
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
  v_clean_name text := trim(coalesce(p_full_name, ''));
  v_profile public.admin_profiles%ROWTYPE;
BEGIN
  IF v_clean_name <> 'Pap Asist Admin' THEN
    RETURN jsonb_build_object(
      'verified', false,
      'reason', 'Nama wajib diisi tepat sebagai Pap Asist Admin. Akses ditolak.',
      'full_name', NULL,
      'email', NULL,
      'role', NULL
    );
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'verified', false,
      'reason', 'Sesi autentikasi tidak ditemukan.',
      'full_name', NULL,
      'email', NULL,
      'role', NULL
    );
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{12}$' THEN
    RETURN jsonb_build_object(
      'verified', false,
      'reason', 'PIN harus tepat 12 digit angka.',
      'full_name', NULL,
      'email', NULL,
      'role', NULL
    );
  END IF;

  SELECT *
  INTO v_profile
  FROM public.admin_profiles
  WHERE user_id = v_uid
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'verified', false,
      'reason', 'Akun ini tidak terdaftar sebagai admin gudang aktif.',
      'full_name', NULL,
      'email', NULL,
      'role', NULL
    );
  END IF;

  IF trim(v_profile.full_name) <> v_clean_name THEN
    RETURN jsonb_build_object(
      'verified', false,
      'reason', 'Nama wajib diisi tepat sebagai Pap Asist Admin. Akses ditolak.',
      'full_name', NULL,
      'email', NULL,
      'role', NULL
    );
  END IF;

  IF v_profile.pin_hash = extensions.crypt(p_pin, v_profile.pin_hash) THEN
    RETURN jsonb_build_object(
      'verified', true,
      'reason', NULL,
      'full_name', v_profile.full_name,
      'email', v_profile.email,
      'role', v_profile.role
    );
  END IF;

  RETURN jsonb_build_object(
    'verified', false,
    'reason', 'PIN 12 digit tidak sesuai.',
    'full_name', NULL,
    'email', NULL,
    'role', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_admin_pin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(text, text) TO authenticated, service_role;

-- 3. Server-only helper to verify current 12-digit PIN for Edge Function credential edits
CREATE OR REPLACE FUNCTION public.verify_admin_pin_for_user(
  p_user_id uuid,
  p_pin text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pin_hash text;
BEGIN
  IF p_user_id IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{12}$' THEN
    RETURN false;
  END IF;

  SELECT pin_hash
  INTO v_pin_hash
  FROM public.admin_profiles
  WHERE user_id = p_user_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN v_pin_hash = extensions.crypt(p_pin, v_pin_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_admin_pin_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin_for_user(uuid, text) TO service_role;

-- 4. Server-only RPC to update admin email and/or 12-digit PIN while keeping full_name locked as 'Pap Asist Admin'
CREATE OR REPLACE FUNCTION public.admin_update_profile_credentials(
  p_user_id uuid,
  p_new_email text DEFAULT NULL,
  p_new_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_email text := NULLIF(lower(trim(coalesce(p_new_email, ''))), '');
  v_clean_pin text := NULLIF(trim(coalesce(p_new_pin, '')), '');
  v_updated public.admin_profiles%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID wajib diisi.';
  END IF;

  IF v_clean_pin IS NOT NULL AND v_clean_pin !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'PIN baru harus tepat 12 digit angka.';
  END IF;

  UPDATE public.admin_profiles
  SET full_name = 'Pap Asist Admin',
      email = COALESCE(v_clean_email, email),
      pin_hash = CASE
        WHEN v_clean_pin IS NOT NULL THEN extensions.crypt(v_clean_pin, extensions.gen_salt('bf'))
        ELSE pin_hash
      END,
      updated_at = now()
  WHERE user_id = p_user_id
    AND is_active = true
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil admin aktif tidak ditemukan.';
  END IF;

  RETURN jsonb_build_object(
    'full_name', v_updated.full_name,
    'email', v_updated.email,
    'role', v_updated.role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_profile_credentials(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile_credentials(uuid, text, text) TO service_role;
