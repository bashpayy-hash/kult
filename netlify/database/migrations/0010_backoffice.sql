-- The venue's back office (18 Nov 2026, owner, after Marble's «AI for
-- restaurant back-office: invoice reconciliation, inventory tracking,
-- supplier coordination»: «Ещё бы внести элементы вот этого и сделать супер
-- приложение»). Guests get the catalog, booking and blat; the venue gets the
-- hostess page, the plan and now its back office, at /m/<manager_token>.
--
--  • suppliers: who brings what, with a WhatsApp number for orders.
--  • invoices + invoice_lines: a supplier's invoice, read from a photo, with
--    the checks the app ran (sums, a repeated number, prices that went up).
--  • stock_items: what is on hand, the point to reorder at and the level to
--    order up to, the last price paid.
-- No personal data here: names of goods, suppliers and sums.

-- A key of its own: the manager sees money, the hostess does not.
alter table venues add column manager_token text unique check (manager_token is null or length(manager_token) >= 24);
update venues set manager_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where manager_token is null;

create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  phone      text check (phone is null or length(phone) <= 20),
  notes      text check (notes is null or length(notes) <= 300),
  created_at timestamptz not null default now()
);
create index suppliers_venue_idx on suppliers (venue_id);

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references venues(id) on delete cascade,
  supplier_id   uuid references suppliers(id) on delete set null,
  supplier_name text check (supplier_name is null or length(supplier_name) <= 80),
  number        text check (number is null or length(number) <= 40),
  invoice_date  date,
  total         numeric(12,2),
  photo_path    text,
  -- What the checks found when it was saved: [{kind, text}].
  issues        jsonb not null default '[]',
  created_at    timestamptz not null default now()
);
create index invoices_venue_idx on invoices (venue_id, invoice_date desc);

create table invoice_lines (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 120),
  -- Lower case, letters and digits only: how lines of the same goods meet across invoices.
  key        text not null,
  qty        numeric(12,3),
  unit       text check (unit is null or length(unit) <= 12),
  price      numeric(12,2),
  sum        numeric(12,2),
  sort       int not null default 0
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id);
create index invoice_lines_key_idx on invoice_lines (key);

create table stock_items (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  key         text not null,
  unit        text check (unit is null or length(unit) <= 12),
  on_hand     numeric(12,3) not null default 0,
  -- Reorder when on_hand falls to min_qty; order up to par_qty.
  min_qty     numeric(12,3),
  par_qty     numeric(12,3),
  supplier_id uuid references suppliers(id) on delete set null,
  last_price  numeric(12,2),
  updated_at  timestamptz not null default now(),
  unique (venue_id, key)
);

alter table suppliers     enable row level security;
alter table invoices      enable row level security;
alter table invoice_lines enable row level security;
alter table stock_items   enable row level security;

-- Demo: the fictional Sora Bistro of 0005, so the back office can be shown
-- before a real venue joins. Skipped where Sora Bistro is gone.
do $$
declare
  v uuid := 'cccccccc-0003-4ccc-8ccc-000000000003';
  s1 uuid := 'f1000000-0000-4000-8000-000000000001';
  s2 uuid := 'f1000000-0000-4000-8000-000000000002';
  i1 uuid := 'f2000000-0000-4000-8000-000000000001';
  i2 uuid := 'f2000000-0000-4000-8000-000000000002';
  today date := (now() at time zone 'Asia/Almaty')::date;
begin
  if not exists (select 1 from venues where id = v) then
    return;
  end if;
  insert into suppliers (id, venue_id, name, phone, notes) values
    (s1, v, 'Овощи Алатау (демо)', '+77010000101', 'Привоз вт и пт до 10:00'),
    (s2, v, 'Молочный двор (демо)', '+77010000102', 'Заказ накануне до 18:00');
  insert into invoices (id, venue_id, supplier_id, supplier_name, number, invoice_date, total, issues) values
    (i1, v, s1, 'Овощи Алатау (демо)', 'А-1182', today - 7, 21500, '[]'),
    (i2, v, s1, 'Овощи Алатау (демо)', 'А-1207', today - 3, 23940,
     '[{"kind":"price","text":"Томаты: 1 120 ₸ за кг, было 980 ₸ (+14%)"}]');
  insert into invoice_lines (invoice_id, name, key, qty, unit, price, sum, sort) values
    (i1, 'Томаты', 'томаты', 10, 'кг', 980, 9800, 0),
    (i1, 'Огурцы', 'огурцы', 6, 'кг', 750, 4500, 1),
    (i1, 'Зелень (укроп, петрушка)', 'зеленьукроппетрушка', 8, 'пучок', 400, 3200, 2),
    (i1, 'Лук репчатый', 'лукрепчатый', 10, 'кг', 400, 4000, 3),
    (i2, 'Томаты', 'томаты', 12, 'кг', 1120, 13440, 0),
    (i2, 'Огурцы', 'огурцы', 6, 'кг', 750, 4500, 1),
    (i2, 'Лук репчатый', 'лукрепчатый', 15, 'кг', 400, 6000, 2);
  insert into stock_items (venue_id, name, key, unit, on_hand, min_qty, par_qty, supplier_id, last_price) values
    (v, 'Томаты', 'томаты', 'кг', 4, 5, 15, s1, 1120),
    (v, 'Огурцы', 'огурцы', 'кг', 7, 3, 10, s1, 750),
    (v, 'Лук репчатый', 'лукрепчатый', 'кг', 12, 5, 20, s1, 400),
    (v, 'Зелень (укроп, петрушка)', 'зеленьукроппетрушка', 'пучок', 2, 4, 10, s1, 400),
    (v, 'Сливки 33%', 'сливки33', 'л', 3, 4, 12, s2, 2100),
    (v, 'Пармезан', 'пармезан', 'кг', 1.2, 1, 3, s2, 9800),
    (v, 'Мука 00', 'мука00', 'кг', 18, 10, 40, null, 620);
end $$;
