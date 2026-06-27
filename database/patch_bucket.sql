-- =====================================================================
-- GO-RENT — Storage bucket patch
-- Run this in the Supabase SQL Editor if the proof_of_payment bucket
-- does not exist yet (you'll see "Bucket not found" errors otherwise).
-- =====================================================================

-- Create the bucket. public = false keeps files private; the admin panel
-- uses signed URLs (generated server-side) so it can still view them.
insert into storage.buckets (id, name, public)
values ('proof_of_payment', 'proof_of_payment', false)
on conflict (id) do nothing;

-- Allow anyone with the anon key to upload a proof file (one-way submit).
drop policy if exists "anon upload proof" on storage.objects;
create policy "anon upload proof"
  on storage.objects for insert
  with check (bucket_id = 'proof_of_payment');

-- Allow signed-URL reads (Supabase validates the signature internally).
drop policy if exists "anon read proof" on storage.objects;
create policy "anon read proof"
  on storage.objects for select
  using (bucket_id = 'proof_of_payment');
