-- Demo data for a local try-out: two members, two venues, links, a few
-- visits, clicks, bookings and guests. Safe to re-run: it wipes demo rows first.
-- Do not run on production.
delete from guest_visits; delete from guest_bookings; delete from link_clicks;
delete from content_proofs; delete from member_visits; delete from tracking_links;
delete from offers; delete from venues; delete from members; delete from applications;

insert into applications (kind, name, age, city, instagram, interests, consent, lang) values
  ('member', 'Дана', 24, 'Алматы', 'dana.eats', 'Кофе, бранчи, пилатес', true, 'ru'),
  ('member', 'Мадина', 21, 'Алматы', 'madina.kz', 'Путешествия', true, 'kk');
insert into applications (kind, venue_name, category, contact_name, phone, instagram, avg_check, consent, lang) values
  ('partner', 'Sora Bistro', 'restaurant', 'Ержан', '+77011234567', 'sora.bistro', 14000, true, 'ru');

insert into members (id, slug, name, age, city, instagram, followers, interests) values
  ('11111111-1111-4111-8111-111111111111', 'aruzhan', 'Аружан', 23, 'Алматы', 'aruzhan.daily', 2400, 'Рестораны, вино'),
  ('22222222-2222-4222-8222-222222222222', 'kamila', 'Камила', 26, 'Алматы', 'kamila.in.almaty', 1300, 'Спа, бьюти');

insert into venues (id, slug, name, category, description, description_kk, address, instagram, contact_name, phone, avg_check, host_token) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nomad-bar', 'Nomad Bar', 'bar',
   'Коктейльный бар на крыше с видом на горы. Авторские коктейли и живой джаз по четвергам.',
   'Тауларға қарайтын шатырдағы коктейль-бар. Авторлық коктейльдер және бейсенбі сайын тірі джаз.',
   'пр. Достык, 136', 'nomad.bar', 'Алия', '+77071112233', 12000, 'demo-host-token-nomad-bar-0001'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'lotus-spa', 'Lotus Spa', 'wellness',
   'Спа на Аль-Фараби: массаж, хаммам, уход за лицом.',
   null, 'пр. Аль-Фараби, 77/8', 'lotus.spa', 'Гульнара', '+77075554433', 25000, 'demo-host-token-lotus-spa-0002');

insert into offers (id, venue_id, title, member_reward, member_reward_value, guest_perk, guest_perk_kk, terms) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ужин на двоих',
   'Ужин на двоих и два коктейля', 30000, 'Комплимент от бара каждому гостю', 'Әр қонаққа бардан комплимент', 'Для компаний до 6 человек'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Массаж 60 минут',
   'Массаж 60 минут', 25000, 'Скидка 15% на первый визит', 'Алғашқы келуге 15% жеңілдік', null);

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

insert into guest_bookings (id, tracking_link_id, guest_name, phone, booking_date, booking_time, party_size, consent, status) values
  ('a0000000-0001-4000-8000-000000000001', 'eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'Асель', '+77012223344', (now() at time zone 'Asia/Almaty')::date - 5, '20:00', 3, true, 'arrived'),
  ('a0000000-0002-4000-8000-000000000002', 'eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'Тимур', '+77013334455', (now() at time zone 'Asia/Almaty')::date - 2, '19:30', 2, true, 'arrived'),
  ('a0000000-0003-4000-8000-000000000003', 'eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'Жанна', '+77014445566', (now() at time zone 'Asia/Almaty')::date, '19:00', 4, true, 'new'),
  ('a0000000-0004-4000-8000-000000000004', 'eeeeeeee-0002-4eee-8eee-eeeeeeeeeeee', 'Ольга', '+77015556677', (now() at time zone 'Asia/Almaty')::date, '21:00', 2, true, 'new'),
  ('a0000000-0005-4000-8000-000000000005', 'eeeeeeee-0002-4eee-8eee-eeeeeeeeeeee', 'Ерлан', '+77016667788', (now() at time zone 'Asia/Almaty')::date - 1, '20:30', 2, true, 'no_show'),
  ('a0000000-0006-4000-8000-000000000006', 'eeeeeeee-0003-4eee-8eee-eeeeeeeeeeee', 'Сабина', '+77017778899', (now() at time zone 'Asia/Almaty')::date + 1, '12:00', 1, true, 'new');

insert into guest_visits (tracking_link_id, booking_id, source, visit_date, guests_count, check_amount) values
  ('eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'a0000000-0001-4000-8000-000000000001', 'booking', (now() at time zone 'Asia/Almaty')::date - 5, 3, 46500),
  ('eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', 'a0000000-0002-4000-8000-000000000002', 'booking', (now() at time zone 'Asia/Almaty')::date - 2, 2, 28000),
  ('eeeeeeee-0001-4eee-8eee-eeeeeeeeeeee', null, 'phrase', (now() at time zone 'Asia/Almaty')::date - 3, 2, 31000),
  ('eeeeeeee-0002-4eee-8eee-eeeeeeeeeeee', null, 'phrase', (now() at time zone 'Asia/Almaty')::date - 1, 1, 12500),
  ('eeeeeeee-0003-4eee-8eee-eeeeeeeeeeee', null, 'phrase', (now() at time zone 'Asia/Almaty')::date - 2, 1, 27000);
