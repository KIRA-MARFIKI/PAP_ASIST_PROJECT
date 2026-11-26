-- Template registrasi admin pertama untuk PaP Asist.
-- Jalankan di Supabase Dashboard -> SQL Editor setelah membuat user di Authentication -> Users.

-- Opsi 1: Insert langsung ke public.admin_profiles
INSERT INTO public.admin_profiles (user_id, full_name, email, pin_hash, role)
VALUES (
  '<PASTE_AUTH_USER_UUID_HERE>',
  '<NAMA_ADMIN>',
  '<EMAIL_ADMIN>',
  extensions.crypt('<12_DIGIT_PIN>', extensions.gen_salt('bf')),
  'super_admin'
)
ON CONFLICT (user_id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    pin_hash = EXCLUDED.pin_hash,
    is_active = true,
    updated_at = now();

-- Opsi 2: Menggunakan helper RPC (tersedia untuk SQL Editor / service_role)
-- SELECT public.upsert_admin_profile_pin(
--   '<PASTE_AUTH_USER_UUID_HERE>'::uuid,
--   '<NAMA_ADMIN>',
--   '<EMAIL_ADMIN>',
--   '<12_DIGIT_PIN>',
--   'super_admin'
-- );
