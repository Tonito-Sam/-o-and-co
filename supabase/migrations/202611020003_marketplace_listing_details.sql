alter table public.marketplace_listings
  add column if not exists seller_name text,
  add column if not exists listing_type text not null default 'product',
  add column if not exists description text,
  add column if not exists image_url text;