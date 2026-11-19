-- The back office, stage 2 (19 Nov 2026, owner: «Делай следующие стадии,
-- при этом полишни дизайн»). Stage 1 (0010) read invoices, kept the stock
-- and typed orders for WhatsApp. Stage 2 closes the loops:
--
--  • supplier_orders: an order the manager sent. The invoice that comes back
--    from that supplier is checked against it: short delivery, goods that
--    did not come, goods nobody ordered.
--  • invoices.paid_at: what is still to pay, and to whom.
--  • write_offs: spoiled goods, staff meals, a supplier's defect. The stock
--    goes down and the loss is counted in tenge.
--  • dishes + dish_items: a dish made of stock items. Its cost follows the
--    last prices paid, so a price rise shows up on the menu.
-- No personal data: goods, sums, dish names.

create table supplier_orders (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references venues(id) on delete cascade,
  supplier_id   uuid references suppliers(id) on delete set null,
  supplier_name text check (supplier_name is null or length(supplier_name) <= 80),
  -- [{name, key, qty, unit, price}]: price is the last price paid when it was sent.
  lines         jsonb not null default '[]',
  status        text not null default 'sent' check (status in ('sent', 'received', 'cancelled')),
  invoice_id    uuid references invoices(id) on delete set null,
  created_at    timestamptz not null default now(),
  received_at   timestamptz
);
create index supplier_orders_venue_idx on supplier_orders (venue_id, status, created_at desc);

alter table invoices add column paid_at timestamptz;
alter table invoices add column order_id uuid references supplier_orders(id) on delete set null;

create table write_offs (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references venues(id) on delete cascade,
  stock_item_id uuid references stock_items(id) on delete set null,
  name          text not null check (length(trim(name)) between 1 and 120),
  qty           numeric(12,3) not null check (qty > 0),
  unit          text check (unit is null or length(unit) <= 12),
  reason        text not null check (reason in ('spoiled', 'staff', 'defect', 'other')),
  cost          numeric(12,2),
  note          text check (note is null or length(note) <= 200),
  created_at    timestamptz not null default now()
);
create index write_offs_venue_idx on write_offs (venue_id, created_at desc);

create table dishes (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  menu_price numeric(12,2) check (menu_price is null or menu_price >= 0),
  created_at timestamptz not null default now(),
  unique (venue_id, name)
);

create table dish_items (
  id            uuid primary key default gen_random_uuid(),
  dish_id       uuid not null references dishes(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  -- In the stock item's own unit: 0,25 кг томатов, 3 шт яиц.
  qty           numeric(12,4) not null check (qty > 0),
  sort          int not null default 0
);
create index dish_items_dish_idx on dish_items (dish_id);

alter table supplier_orders enable row level security;
alter table write_offs      enable row level security;
alter table dishes          enable row level security;
alter table dish_items      enable row level security;

-- Demo: the fictional Sora Bistro of 0005 and 0010. The first invoice is
-- paid; the second came against an order and the greens did not come;
-- two write-offs; three dishes. Skipped where Sora Bistro is gone.
do $$
declare
  v  uuid := 'cccccccc-0003-4ccc-8ccc-000000000003';
  s1 uuid := 'f1000000-0000-4000-8000-000000000001';
  i1 uuid := 'f2000000-0000-4000-8000-000000000001';
  i2 uuid := 'f2000000-0000-4000-8000-000000000002';
  o1 uuid := 'f3000000-0000-4000-8000-000000000001';
  d1 uuid := 'f4000000-0000-4000-8000-000000000001';
  d2 uuid := 'f4000000-0000-4000-8000-000000000002';
  d3 uuid := 'f4000000-0000-4000-8000-000000000003';
  eggs uuid;
  today date := (now() at time zone 'Asia/Almaty')::date;
begin
  if not exists (select 1 from invoices where id = i2) then
    return;
  end if;
  update invoices set paid_at = (today - 5)::timestamp at time zone 'Asia/Almaty' + interval '12 hours' where id = i1;

  insert into supplier_orders (id, venue_id, supplier_id, supplier_name, lines, status, invoice_id, created_at, received_at) values
    (o1, v, s1, 'Овощи Алатау (демо)',
     '[{"name":"Томаты","key":"томаты","qty":12,"unit":"кг","price":980},
       {"name":"Огурцы","key":"огурцы","qty":6,"unit":"кг","price":750},
       {"name":"Лук репчатый","key":"лукрепчатый","qty":15,"unit":"кг","price":400},
       {"name":"Зелень (укроп, петрушка)","key":"зеленьукроппетрушка","qty":8,"unit":"пучок","price":400}]',
     'received', i2, (today - 4)::timestamp at time zone 'Asia/Almaty' + interval '17 hours',
     (today - 3)::timestamp at time zone 'Asia/Almaty' + interval '10 hours');
  update invoices set order_id = o1, issues =
    '[{"kind":"price","text":"Томаты: 1 120 ₸ за кг, было 980 ₸ (+14%)"},
      {"kind":"order","text":"Не привезли: Зелень (укроп, петрушка) — 8 пучков по заказу"}]'
  where id = i2;

  insert into stock_items (venue_id, name, key, unit, on_hand, min_qty, par_qty, last_price)
  values (v, 'Яйца', 'яйца', 'шт', 90, 30, 120, 55)
  on conflict (venue_id, key) do nothing;
  select id into eggs from stock_items where venue_id = v and key = 'яйца';

  insert into write_offs (venue_id, stock_item_id, name, qty, unit, reason, cost, created_at)
  select v, s.id, s.name, w.qty, s.unit, w.reason, round(w.qty * coalesce(s.last_price, 0), 2), (today - w.ago)::timestamp at time zone 'Asia/Almaty' + interval '22 hours'
  from (values ('томаты', 1.5, 'spoiled', 2), ('зеленьукроппетрушка', 1.0, 'spoiled', 1)) as w(key, qty, reason, ago)
  join stock_items s on s.venue_id = v and s.key = w.key;

  insert into dishes (id, venue_id, name, menu_price) values
    (d1, v, 'Шакшука', 2900),
    (d2, v, 'Салат из свежих овощей', 2400),
    (d3, v, 'Паста со сливками и пармезаном', 3900);
  insert into dish_items (dish_id, stock_item_id, qty, sort)
  select x.dish, s.id, x.qty, x.sort
  from (values
    (d1, 'томаты', 0.3, 0), (d1, 'яйца', 3, 1), (d1, 'лукрепчатый', 0.05, 2), (d1, 'зеленьукроппетрушка', 0.2, 3),
    (d2, 'томаты', 0.15, 0), (d2, 'огурцы', 0.15, 1), (d2, 'лукрепчатый', 0.03, 2), (d2, 'зеленьукроппетрушка', 0.25, 3),
    (d3, 'мука00', 0.12, 0), (d3, 'сливки33', 0.1, 1), (d3, 'пармезан', 0.03, 2)
  ) as x(dish, key, qty, sort)
  join stock_items s on s.venue_id = v and s.key = x.key;
end $$;
