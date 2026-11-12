-- Venue logo (owner, 12 Nov 2026: real venue imagery instead of generated
-- scenes). Square image in the public venue-photos bucket.
alter table venues add column logo_path text;
