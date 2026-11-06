insert into public.cafe_products (
  branch_id,
  name,
  category,
  description,
  price_zar,
  image_url,
  vendor,
  is_available,
  is_popular,
  is_active,
  track_inventory,
  stock_quantity,
  low_stock_threshold
)
select
  branch.id,
  'Chicken Prego',
  'Lunch',
  'Flame-grilled marinated chicken prego served with a focaccia bread roll.',
  85,
  null,
  'Office & Co Café',
  true,
  false,
  true,
  false,
  0,
  5
from public.branches branch
where branch.slug = 'rosebank'
on conflict (branch_id, name) do update set
  category = excluded.category,
  description = excluded.description,
  price_zar = excluded.price_zar,
  is_available = excluded.is_available,
  is_active = excluded.is_active;