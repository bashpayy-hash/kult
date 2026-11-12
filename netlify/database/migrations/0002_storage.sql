-- Storage buckets. Runs only on Supabase (the storage schema exists there);
-- on a plain Postgres it does nothing.
--   venue-photos  public:  the photo on /<member>/<venue>
--   story-proofs  private: story screenshots, shown in the admin through signed URLs
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('venue-photos', 'venue-photos', true,  5242880, array['image/jpeg','image/png','image/webp']),
      ('story-proofs', 'story-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
