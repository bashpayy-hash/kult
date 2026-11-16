-- Fixes from the 16 Nov 2026 checks (docs/PLUGINS_CHECKLIST.md: fact-check
-- agents and a Kazakh proofread).
--  • Kazakh text for what the plan and the offers show: venue_tables.label_kk
--    («Кіреберіс» for «Вход»), offers.terms_kk.
--  • The fictional demo venues of 0005 lose drinks from their texts: the
--    advertising law bans alcohol advertising, and a member's story about a
--    bar would carry it. Each update only touches a row still holding the
--    demo text, so nothing an admin changed is overwritten.

alter table venue_tables add column label_kk text check (label_kk is null or length(label_kk) <= 24);
alter table offers add column terms_kk text;

-- Demo venues: no drinks in the texts.
update venues set
  description = 'Бар на крыше с видом на горы. Живой джаз по четвергам.',
  description_kk = 'Тауларға қарайтын шатырдағы бар. Бейсенбі сайын жанды джаз.'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and description = 'Коктейльный бар на крыше с видом на горы. Авторские коктейли и живой джаз по четвергам.';
update venues set
  description = 'Бистро с открытой кухней и сезонным меню: локальные продукты, паста ручной работы.',
  description_kk = 'Ашық асүйі мен маусымдық мәзірі бар бистро: жергілікті өнімдер, қолдан жасалған паста.'
where id = 'cccccccc-0003-4ccc-8ccc-000000000003'
  and description = 'Бистро с открытой кухней и сезонным меню: локальные продукты, паста ручной работы, натуральные вина.';
update offers set member_reward = 'Ужин на двоих'
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and member_reward = 'Ужин на двоих и два коктейля';
update offers set guest_perk = 'Комплимент от шефа каждому гостю', guest_perk_kk = 'Әр қонаққа шефтен комплимент'
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and guest_perk = 'Комплимент от бара каждому гостю';

-- Demo venues: Kazakh where only Russian was.
update venues set description_kk = 'Әл-Фарабидегі спа: массаж, хаммам, бет күтімі.'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and description_kk is null;
update venues set description_kk = 'Саябақ жанындағы спешелти-кофехана: балама дайындау әдістері, күні бойы таңғы ас, өз наубайханасының тоқаштары.'
where id = 'cccccccc-0004-4ccc-8ccc-000000000004' and description_kk is null;
update venues set description_kk = 'Бес орындық тыныш студияда маникюр, педикюр және күтім.'
where id = 'cccccccc-0005-4ccc-8ccc-000000000005' and description_kk is null;
update venues set description_kk = 'Төрт адамға дейінгі шағын топтарда реформерлердегі пилатес.'
where id = 'cccccccc-0006-4ccc-8ccc-000000000006' and description_kk is null;
update offers set terms_kk = '6 адамға дейінгі топтарға' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and terms = 'Для компаний до 6 человек';
update offers set terms_kk = 'Екі ыстық тағамнан бастап тапсырыс бергенде' where id = 'dddddddd-0003-4ddd-8ddd-000000000003' and terms = 'При заказе от двух горячих';
update venue_photos set caption_kk = 'Жібек Жолындағы саябақ жанындағы бұрыш'
where path = '/venues/mono-coffee/exterior.webp' and caption_kk = 'Жібек Жолындағы саябақ бұрышы';

-- Plan labels in Kazakh (demo tables and decor of 0005).
update venue_tables t set label_kk = v.kk
from (values
  ('b0000000-0000-4000-8000-000000000090', 'Тауға көрініс'),
  ('b0000000-0000-4000-8000-000000000091', 'Кіреберіс'),
  ('b0000000-0000-4000-8000-000000000092', 'Бар'),
  ('b0000000-0000-4000-8000-000000000021', '1-кабинет'),
  ('b0000000-0000-4000-8000-000000000022', '2-кабинет'),
  ('b0000000-0000-4000-8000-000000000023', 'Екі адамға'),
  ('b0000000-0000-4000-8000-000000000093', 'Хаммам'),
  ('b0000000-0000-4000-8000-000000000094', 'Ашық асүй'),
  ('b0000000-0000-4000-8000-000000000095', 'Терезелер'),
  ('b0000000-0000-4000-8000-000000000096', 'Сөре')
) as v (id, kk)
where t.id = v.id::uuid and t.label_kk is null;
