-- Demo data: six fictional venues, two members, links, visits, clicks,
-- bookings and guests, so the pilot can be looked at before real venues join.
-- Inserts only into an empty database: if any venue already exists, nothing
-- happens. Dates are relative to the day the migration runs.
-- To remove before launch, add a new migration that deletes these rows
-- (ids below are fixed); never edit or delete this file once applied.
do $$
begin
  if exists (select 1 from venues) then
    return;
  end if;

  insert into applications (kind, name, age, city, instagram, interests, consent, lang) values
    ('member', 'Дана', 24, 'Алматы', 'dana.eats', 'Кофе, бранчи, пилатес', true, 'ru'),
    ('member', 'Мадина', 21, 'Алматы', 'madina.kz', 'Путешествия', true, 'kk');
  insert into applications (kind, venue_name, category, contact_name, phone, instagram, avg_check, consent, lang) values
    ('partner', 'Sora Bistro', 'restaurant', 'Ержан', '+77011234567', 'sora.bistro', 14000, true, 'ru');

  insert into members (id, slug, name, age, city, instagram, followers, interests) values
    ('11111111-1111-4111-8111-111111111111', 'aruzhan', 'Аружан', 23, 'Алматы', 'aruzhan.daily', 2400, 'Рестораны, вино'),
    ('22222222-2222-4222-8222-222222222222', 'kamila', 'Камила', 26, 'Алматы', 'kamila.in.almaty', 1300, 'Спа, бьюти');

  insert into venues (id, slug, name, category, description, description_kk, address, instagram, contact_name, phone, avg_check, host_token, is_listed, featured, open_time, close_time) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nomad-bar', 'Nomad Bar', 'bar',
     'Коктейльный бар на крыше с видом на горы. Авторские коктейли и живой джаз по четвергам.',
     'Тауларға қарайтын шатырдағы коктейль-бар. Авторлық коктейльдер және бейсенбі сайын тірі джаз.',
     'пр. Достык, 136', 'nomad.bar', 'Алия', '+77071112233', 12000, 'demo-host-token-nomad-bar-0001', true, true, '17:00', '02:00'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'lotus-spa', 'Lotus Spa', 'wellness',
     'Спа на Аль-Фараби: массаж, хаммам, уход за лицом.',
     null, 'пр. Аль-Фараби, 77/8', 'lotus.spa', 'Гульнара', '+77075554433', 25000, 'demo-host-token-lotus-spa-0002', true, false, '10:00', '22:00'),
    ('cccccccc-0003-4ccc-8ccc-000000000003', 'sora-bistro', 'Sora Bistro', 'restaurant',
     'Бистро с открытой кухней и сезонным меню: локальные продукты, паста ручной работы, натуральные вина.',
     'Ашық асүйі бар бистро: маусымдық мәзір, жергілікті өнім, қолдан жасалған паста.',
     'ул. Кабанбай батыра, 83', 'sora.bistro', 'Ержан', '+77011234567', 14000, 'demo-host-token-sora-bistro-0003', true, true, '12:00', '23:30'),
    ('cccccccc-0004-4ccc-8ccc-000000000004', 'mono-coffee', 'Mono Coffee', 'cafe',
     'Спешелти-кофейня у парка: альтернатива, завтраки весь день, выпечка из своей пекарни.',
     null, 'ул. Жибек Жолы, 50', 'mono.coffee', 'Динара', '+77017778800', 5000, 'demo-host-token-mono-coffee-0004', true, true, '08:00', '22:00'),
    ('cccccccc-0005-4ccc-8ccc-000000000005', 'atelier-nails', 'Atelier Nails', 'beauty',
     'Маникюр, педикюр и уход в тихой студии на пять мест.',
     null, 'ул. Фурманова, 240', 'atelier.nails', 'Аида', '+77052223344', 12000, 'demo-host-token-atelier-nails-0005', true, false, '10:00', '21:00'),
    ('cccccccc-0006-4ccc-8ccc-000000000006', 'pilates-loft', 'Pilates Loft', 'fitness',
     'Пилатес на реформерах в мини-группах до четырёх человек.',
     null, 'пр. Абая, 52', 'pilates.loft', 'Сауле', '+77053334455', 9000, 'demo-host-token-pilates-loft-0006', true, false, '07:00', '22:00');

  insert into offers (id, venue_id, title, member_reward, member_reward_value, guest_perk, guest_perk_kk, terms) values
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ужин на двоих',
     'Ужин на двоих и два коктейля', 30000, 'Комплимент от бара каждому гостю', 'Әр қонаққа бардан комплимент', 'Для компаний до 6 человек'),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Массаж 60 минут',
     'Массаж 60 минут', 25000, 'Скидка 15% на первый визит', 'Алғашқы келуге 15% жеңілдік', null),
    ('dddddddd-0003-4ddd-8ddd-000000000003', 'cccccccc-0003-4ccc-8ccc-000000000003', 'Ужин от шефа',
     'Сет от шефа на двоих', 28000, 'Десерт от шефа к ужину', 'Кешкі асқа шефтен десерт', 'При заказе от двух горячих'),
    ('dddddddd-0004-4ddd-8ddd-000000000004', 'cccccccc-0004-4ccc-8ccc-000000000004', 'Завтрак',
     'Завтрак и фильтр-кофе', 6000, 'Второй кофе в подарок', 'Екінші кофе сыйлыққа', null);

  insert into tracking_links (id, member_id, venue_id, offer_id) values
    ('eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ('eeeeeeee-0002-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ('eeeeeeee-0003-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');

  insert into member_visits (id, tracking_link_id, visit_date, received, reward_value, source) values
    ('f0000000-0001-4000-8000-000000000001', 'eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', (now() at time zone 'Asia/Almaty')::date - 6, 'Ужин на двоих и два коктейля', 30000, 'host'),
    ('f0000000-0002-4000-8000-000000000002', 'eeeeeeee-0002-4eee-8eee-eeeeeeeeeeee', (now() at time zone 'Asia/Almaty')::date - 4, 'Ужин на двоих и два коктейля', 30000, 'host'),
    ('f0000000-0003-4000-8000-000000000003', 'eeeeeeee-0003-4eee-8eee-eeeeeeeeeeee', (now() at time zone 'Asia/Almaty')::date - 3, 'Массаж 60 минут', 25000, 'admin');

  insert into content_proofs (member_visit_id, kind, views, posted_at) values
    ('f0000000-0001-4000-8000-000000000001', 'story', 1850, (now() at time zone 'Asia/Almaty')::date - 6),
    ('f0000000-0002-4000-8000-000000000002', 'story', 940, (now() at time zone 'Asia/Almaty')::date - 4),
    ('f0000000-0003-4000-8000-000000000003', 'story', 610, (now() at time zone 'Asia/Almaty')::date - 3);

  insert into link_clicks (tracking_link_id, visitor_hash, is_bot, created_at)
  select 'eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'v' || (g % 52), false, now() - (g || ' hours')::interval from generate_series(1, 64) g;
  insert into link_clicks (tracking_link_id, visitor_hash, is_bot, created_at)
  select 'eeeeeeee-0002-4eee-8eee-eeeeeeeeeeee', 'w' || (g % 20), false, now() - (g || ' hours')::interval from generate_series(1, 23) g;
  insert into link_clicks (tracking_link_id, visitor_hash, is_bot, created_at)
  select 'eeeeeeee-0003-4eee-8eee-eeeeeeeeeeee', 'x' || g, false, now() - (g || ' hours')::interval from generate_series(1, 9) g;
  insert into link_clicks (tracking_link_id, visitor_hash, user_agent, is_bot)
  values ('eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'bot', 'facebookexternalhit/1.1', true);


  -- Floor plans. Plan units: a hall is width × height, items are boxes in it.
  insert into venue_halls (id, venue_id, name, name_kk, width, height, sort) values
    ('ba000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Терраса', 'Терраса', 100, 64, 0),
    ('ba000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Зал у бара', 'Бар жанындағы зал', 100, 64, 1),
    ('ba000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Кабинеты', 'Кабинеттер', 100, 56, 0),
    ('ba000000-0000-4000-8000-000000000004', 'cccccccc-0003-4ccc-8ccc-000000000003', 'Основной зал', 'Негізгі зал', 100, 70, 0),
    ('ba000000-0000-4000-8000-000000000005', 'cccccccc-0004-4ccc-8ccc-000000000004', 'Зал', 'Зал', 100, 60, 0);

  insert into venue_tables (id, venue_id, hall_id, kind, label, shape, x, y, w, h, seats_min, seats_max) values
    -- Nomad Bar, terrace: the view is along the top edge
    ('b0000000-0000-4000-8000-000000000090', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000001', 'decor', 'Вид на горы', 'rect', 4, 3, 92, 5, 1, 1),
    ('b0000000-0000-4000-8000-000000000091', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000001', 'decor', 'Вход', 'rect', 82, 54, 14, 7, 1, 1),
    ('b0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000001', 'table', '1', 'round', 8, 14, 12, 12, 1, 2),
    ('b0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000001', 'table', '2', 'round', 28, 14, 12, 12, 1, 2),
    ('b0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000001', 'table', '3', 'round', 48, 14, 12, 12, 1, 2),
    ('b0000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000001', 'table', '4', 'rect', 68, 13, 22, 13, 3, 6),
    ('b0000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000001', 'table', '5', 'rect', 8, 36, 20, 13, 2, 4),
    ('b0000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000001', 'table', '6', 'rect', 36, 36, 20, 13, 2, 4),
    ('b0000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000001', 'table', '7', 'round', 62, 35, 15, 15, 4, 8),
    -- Nomad Bar, hall by the bar
    ('b0000000-0000-4000-8000-000000000092', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000002', 'decor', 'Бар', 'rect', 6, 4, 60, 8, 1, 1),
    ('b0000000-0000-4000-8000-000000000011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000002', 'table', '11', 'round', 8, 20, 10, 10, 1, 2),
    ('b0000000-0000-4000-8000-000000000012', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000002', 'table', '12', 'round', 26, 20, 10, 10, 1, 2),
    ('b0000000-0000-4000-8000-000000000013', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000002', 'table', '13', 'rect', 46, 22, 20, 12, 2, 4),
    ('b0000000-0000-4000-8000-000000000014', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000002', 'table', '14', 'rect', 74, 6, 18, 50, 6, 12),
    ('b0000000-0000-4000-8000-000000000015', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000002', 'table', '15', 'rect', 8, 42, 24, 13, 2, 4),
    ('b0000000-0000-4000-8000-000000000016', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ba000000-0000-4000-8000-000000000002', 'table', '16', 'rect', 40, 42, 24, 13, 2, 4),
    -- Lotus Spa: rooms
    ('b0000000-0000-4000-8000-000000000021', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ba000000-0000-4000-8000-000000000003', 'table', 'Кабинет 1', 'rect', 6, 8, 26, 20, 1, 1),
    ('b0000000-0000-4000-8000-000000000022', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ba000000-0000-4000-8000-000000000003', 'table', 'Кабинет 2', 'rect', 37, 8, 26, 20, 1, 1),
    ('b0000000-0000-4000-8000-000000000023', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ba000000-0000-4000-8000-000000000003', 'table', 'Для двоих', 'rect', 68, 8, 26, 20, 2, 2),
    ('b0000000-0000-4000-8000-000000000093', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ba000000-0000-4000-8000-000000000003', 'decor', 'Хаммам', 'round', 36, 34, 28, 16, 1, 1),
    -- Sora Bistro
    ('b0000000-0000-4000-8000-000000000094', 'cccccccc-0003-4ccc-8ccc-000000000003', 'ba000000-0000-4000-8000-000000000004', 'decor', 'Открытая кухня', 'rect', 6, 4, 50, 9, 1, 1),
    ('b0000000-0000-4000-8000-000000000095', 'cccccccc-0003-4ccc-8ccc-000000000003', 'ba000000-0000-4000-8000-000000000004', 'decor', 'Окна', 'rect', 96, 14, 3, 48, 1, 1),
    ('b0000000-0000-4000-8000-000000000031', 'cccccccc-0003-4ccc-8ccc-000000000003', 'ba000000-0000-4000-8000-000000000004', 'table', '1', 'rect', 78, 16, 14, 12, 1, 2),
    ('b0000000-0000-4000-8000-000000000032', 'cccccccc-0003-4ccc-8ccc-000000000003', 'ba000000-0000-4000-8000-000000000004', 'table', '2', 'rect', 78, 34, 14, 12, 1, 2),
    ('b0000000-0000-4000-8000-000000000033', 'cccccccc-0003-4ccc-8ccc-000000000003', 'ba000000-0000-4000-8000-000000000004', 'table', '3', 'rect', 78, 52, 14, 12, 1, 2),
    ('b0000000-0000-4000-8000-000000000034', 'cccccccc-0003-4ccc-8ccc-000000000003', 'ba000000-0000-4000-8000-000000000004', 'table', '4', 'round', 10, 22, 14, 14, 2, 4),
    ('b0000000-0000-4000-8000-000000000035', 'cccccccc-0003-4ccc-8ccc-000000000003', 'ba000000-0000-4000-8000-000000000004', 'table', '5', 'round', 34, 22, 14, 14, 2, 4),
    ('b0000000-0000-4000-8000-000000000036', 'cccccccc-0003-4ccc-8ccc-000000000003', 'ba000000-0000-4000-8000-000000000004', 'table', '6', 'rect', 10, 46, 38, 14, 4, 8),
    ('b0000000-0000-4000-8000-000000000037', 'cccccccc-0003-4ccc-8ccc-000000000003', 'ba000000-0000-4000-8000-000000000004', 'table', '7', 'rect', 56, 26, 14, 34, 4, 8),
    -- Mono Coffee
    ('b0000000-0000-4000-8000-000000000096', 'cccccccc-0004-4ccc-8ccc-000000000004', 'ba000000-0000-4000-8000-000000000005', 'decor', 'Стойка', 'rect', 60, 4, 34, 9, 1, 1),
    ('b0000000-0000-4000-8000-000000000041', 'cccccccc-0004-4ccc-8ccc-000000000004', 'ba000000-0000-4000-8000-000000000005', 'table', '1', 'round', 8, 8, 11, 11, 1, 2),
    ('b0000000-0000-4000-8000-000000000042', 'cccccccc-0004-4ccc-8ccc-000000000004', 'ba000000-0000-4000-8000-000000000005', 'table', '2', 'round', 26, 8, 11, 11, 1, 2),
    ('b0000000-0000-4000-8000-000000000043', 'cccccccc-0004-4ccc-8ccc-000000000004', 'ba000000-0000-4000-8000-000000000005', 'table', '3', 'rect', 8, 30, 30, 12, 2, 6),
    ('b0000000-0000-4000-8000-000000000044', 'cccccccc-0004-4ccc-8ccc-000000000004', 'ba000000-0000-4000-8000-000000000005', 'table', '4', 'round', 50, 30, 13, 13, 2, 4),
    ('b0000000-0000-4000-8000-000000000045', 'cccccccc-0004-4ccc-8ccc-000000000004', 'ba000000-0000-4000-8000-000000000005', 'table', '5', 'round', 74, 30, 13, 13, 2, 4);

  insert into guest_bookings (id, tracking_link_id, venue_id, guest_name, phone, booking_date, booking_time, party_size, consent, status, table_id) values
    ('a0000000-0001-4000-8000-000000000001', 'eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Асель', '+77012223344', (now() at time zone 'Asia/Almaty')::date - 5, '20:00', 3, true, 'arrived', 'b0000000-0000-4000-8000-000000000004'),
    ('a0000000-0002-4000-8000-000000000002', 'eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Тимур', '+77013334455', (now() at time zone 'Asia/Almaty')::date - 2, '19:30', 2, true, 'arrived', 'b0000000-0000-4000-8000-000000000001'),
    ('a0000000-0003-4000-8000-000000000003', 'eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Жанна', '+77014445566', (now() at time zone 'Asia/Almaty')::date, '19:00', 4, true, 'new', 'b0000000-0000-4000-8000-000000000004'),
    ('a0000000-0004-4000-8000-000000000004', 'eeeeeeee-0002-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ольга', '+77015556677', (now() at time zone 'Asia/Almaty')::date, '21:00', 2, true, 'new', 'b0000000-0000-4000-8000-000000000002'),
    ('a0000000-0005-4000-8000-000000000005', 'eeeeeeee-0002-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ерлан', '+77016667788', (now() at time zone 'Asia/Almaty')::date - 1, '20:30', 2, true, 'no_show', null),
    ('a0000000-0006-4000-8000-000000000006', 'eeeeeeee-0003-4eee-8eee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Сабина', '+77017778899', (now() at time zone 'Asia/Almaty')::date + 1, '12:00', 1, true, 'new', 'b0000000-0000-4000-8000-000000000021');

  insert into guest_visits (tracking_link_id, venue_id, booking_id, source, visit_date, guests_count, check_amount) values
    ('eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0001-4000-8000-000000000001', 'booking', (now() at time zone 'Asia/Almaty')::date - 5, 3, 46500),
    ('eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0002-4000-8000-000000000002', 'booking', (now() at time zone 'Asia/Almaty')::date - 2, 2, 28000),
    ('eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'phrase', (now() at time zone 'Asia/Almaty')::date - 3, 2, 31000),
    ('eeeeeeee-0002-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'phrase', (now() at time zone 'Asia/Almaty')::date - 1, 1, 12500),
    ('eeeeeeee-0003-4eee-8eee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, 'phrase', (now() at time zone 'Asia/Almaty')::date - 2, 1, 27000);
end $$;
