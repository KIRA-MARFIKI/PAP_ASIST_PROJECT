-- PaP Asist: Remove the 12 prototype dummy rows from public.warehouse_parts
-- and clear stale catalog_cache entries so live searches verify strictly against
-- real uploaded warehouse inventory and hondacengkareng.com.

DELETE FROM public.warehouse_parts
WHERE part_code IN (
  '51410KVB901',
  '12391KPH900',
  '06455KVB901',
  '17210KVB900',
  '31916KPH901',
  '06430KPH951',
  '23100K1AN01',
  '2212AK44V00',
  '61100K1AN00',
  '33100K1AN01',
  '17910K81N01',
  '51490KRM852'
)
AND rack_code ~ '^[A-Z]-[0-9]{2}-[0-9]{2}$';

DELETE FROM public.catalog_cache;
