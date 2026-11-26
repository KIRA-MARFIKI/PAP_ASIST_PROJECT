-- Storage bucket for Honda Padang Panjang part photos (public read, warehouse admin write)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'part-photos',
  'part-photos',
  true,
  5242880,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "part_photos_public_read" ON storage.objects;
CREATE POLICY "part_photos_public_read"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'part-photos');

DROP POLICY IF EXISTS "part_photos_admin_insert" ON storage.objects;
CREATE POLICY "part_photos_admin_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'part-photos'
    AND public.is_warehouse_admin()
  );

DROP POLICY IF EXISTS "part_photos_admin_update" ON storage.objects;
CREATE POLICY "part_photos_admin_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'part-photos'
    AND public.is_warehouse_admin()
  )
  WITH CHECK (
    bucket_id = 'part-photos'
    AND public.is_warehouse_admin()
  );

DROP POLICY IF EXISTS "part_photos_admin_delete" ON storage.objects;
CREATE POLICY "part_photos_admin_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'part-photos'
    AND public.is_warehouse_admin()
  );
