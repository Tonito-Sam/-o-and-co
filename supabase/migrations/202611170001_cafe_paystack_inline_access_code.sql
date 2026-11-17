create table if not exists public.cafe_payment_sessions (
  order_id uuid primary key references public.cafe_orders(id) on delete cascade,
  access_code text not null,
  created_at timestamptz not null default now()
);

alter table public.cafe_payment_sessions enable row level security;
revoke all on public.cafe_payment_sessions from public, anon, authenticated;
grant all on public.cafe_payment_sessions to service_role;

notify pgrst, 'reload schema';
