# Shaqyru — план пилота

Shaqyru (шақыру — «приглашение»). Закрытое lifestyle-комьюнити в Алматы. Участница (micro-аккаунт 1–3k)
получает ужин или услугу в заведении, публикует сторис с личной ссылкой.
Подписчики бронируют по ссылке или приходят и называют кодовую фразу.

**Главная метрика пилота:** сколько платящих гостей приводит один визит
участницы. Порог успеха — **≥ 2 гостя на визит** (`PILOT_THRESHOLD`).

## 1. Стек и решения

| Что | Решение | Почему |
|---|---|---|
| Фреймворк | Next.js 16, App Router, Server Actions | Формы без отдельного API, один деплой на Vercel |
| База | Supabase Postgres, доступ через `postgres` (postgres.js) по `DATABASE_URL` (transaction pooler, `prepare: false`) | Дашборд — это SQL-агрегаты; прямой SQL проще и проверяется на локальном Postgres |
| Файлы | Supabase Storage: `venue-photos` (публичный), `story-proofs` (приватный, подписанные ссылки) | Скрины сторис не должны быть публичными |
| Защита данных | RLS включён на всех таблицах без политик: anon-ключ не видит ничего. Сервер ходит под ролью базы | Ни одной таблицы наружу через PostgREST |
| Стили | Tailwind v4, токены в одном файле `src/app/tokens.css` | Правится одно место |
| Языки | ru / kk, cookie `lang`, первый выбор по `Accept-Language` | Без префиксов в URL: ссылка участницы одна на оба языка |
| Админка | Пароль из `ADMIN_PASSWORD`, httpOnly-cookie с HMAC-подписью и сроком 14 дней. `proxy.ts` закрывает `/admin/*`, каждое server action проверяет сессию ещё раз | Server action можно вызвать POST-ом на любой путь, поэтому проверка внутри действия обязательна |
| Хостес | `/h/<venue_token>`: 32 случайных символа, без логина. Токен можно перевыпустить из админки | Старая ссылка сразу перестаёт работать |
| Клики | Каждое открытие `/[member]/[venue]` пишет строку в `link_clicks` на сервере. Боты и превью ссылок (Instagram, Telegram, WhatsApp) помечаются `is_bot` и в метрику не идут | Превью ссылок в мессенджерах иначе раздувают клики |
| Часовой пояс | `Asia/Almaty` (UTC+5) для «сегодня» у хостес и в форме брони | |
| Антиспам | Скрытое поле-ловушка, не больше 5 броней в час с одного устройства на ссылку | Без капчи для пилота |

**Не делаем сейчас:** нативное приложение, логин участниц, оплату, тиры,
подписку для заведений.

## 2. Страницы

| Путь | Кто | Что |
|---|---|---|
| `/` | все | Лендинг: как это работает (дорожка из орбов) и две формы заявки — участница и заведение |
| `/privacy` | все | Согласие на обработку персональных данных |
| `/[member]/[venue]` | подписчики | Фото заведения, perk, «скажи на входе: я от {имя}», форма брони. Каждое открытие — клик |
| `/h/[token]` | хостес | Брони на день, «пришли» (гостей, чек), «не пришли», «гость назвал фразу», «визит участницы», журнал дня с отменой |
| `/admin/login` | админ | Вход по паролю |
| `/admin` | админ | Дашборд по парам участница + заведение, подсветка ≥ 2, CSV |
| `/admin/applications` | админ | Заявки new / approved / rejected. Одобрение создаёт участницу или заведение |
| `/admin/members`, `/admin/members/[id]` | админ | CRUD участниц |
| `/admin/venues`, `/admin/venues/[id]` | админ | CRUD заведений, фото, offers и perks, ссылка хостес |
| `/admin/links`, `/admin/links/[id]` | админ | Пары участница + заведение: ссылка, фраза, визиты участницы, скрины сторис и просмотры, брони и гости пары |
| `/admin/export` | админ | CSV дашборда (UTF-8 с BOM, разделитель `;` — открывается в русском Excel) |

Зарезервированные слаги участниц: `admin`, `h`, `api`, `privacy`, `_next` и др.

## 3. Схема БД

```
applications ─┐ (approved → создаёт)
              ├─► members ─┐
              └─► venues ──┼─► offers
                           │
              tracking_links (member × venue, offer, фраза)  ◄── уникальная пара
                 │
   ┌─────────────┼──────────────┬───────────────────┐
   ▼             ▼              ▼                   ▼
member_visits  link_clicks   guest_bookings ──► guest_visits (source: booking | phrase)
   │
   ▼
content_proofs (скрин сторис, просмотры)
```

### members — участницы
| поле | тип | |
|---|---|---|
| id | uuid pk | |
| slug | text unique | в ссылке: `/aruzhan/nomad-bar` |
| name | text | показывается подписчикам: «я от Аружан» |
| age | int | `check (age between 18 and 99)` |
| city, instagram, followers, interests, phone, notes | | |
| status | text | `active` / `paused` / `archived` |
| application_id | uuid → applications | откуда пришла |

### venues — заведения
| поле | тип | |
|---|---|---|
| id, slug, name | | |
| category | text | `restaurant` / `cafe` / `bar` / `beauty` / `wellness` / `fitness` / `other` |
| description, description_kk, address, city, instagram | | |
| contact_name, phone, avg_check | | средний чек, ₸ |
| photo_path | text | путь в `venue-photos` |
| host_token | text unique | секрет для `/h/<token>` |
| status, notes, application_id | | |

### offers — что получает участница и что получают гости (perks)
| поле | |
|---|---|
| venue_id → venues | |
| title | внутреннее название |
| member_reward, member_reward_value | что получает участница и номинал, ₸ |
| guest_perk, guest_perk_kk | perk для подписчиков |
| terms, active | |

### tracking_links — пара участница + заведение
`member_id`, `venue_id` (unique вместе), `offer_id`, `code_phrase`
(пусто → «я от {имя}»), `active`.

### member_visits — визит участницы
`tracking_link_id`, `visit_date`, `received` (что получила),
`reward_value`, `source` (`host` / `admin`), `notes`.

### content_proofs — подтверждение контента
`member_visit_id`, `kind` (`story` / `post` / `reel`), `screenshot_path`,
`views`, `posted_at`.

### link_clicks — открытия публичной страницы
`tracking_link_id`, `created_at`, `visitor_hash` (sha256 от IP + UA + соль,
сам IP не хранится), `referrer`, `user_agent`, `is_bot`, `lang`.

### guest_bookings — брони подписчиков
`tracking_link_id`, `guest_name`, `phone`, `booking_date`, `booking_time`,
`party_size`, `comment`, `consent` (`check (consent)`), `consent_at`,
`status` (`new` / `arrived` / `no_show` / `cancelled`), `visitor_hash`, `lang`.

### guest_visits — пришедшие гости
`tracking_link_id`, `booking_id` (unique, для `source = booking`),
`source` (`booking` / `phrase`), `visit_date`, `guests_count`,
`check_amount` (₸).

### applications — заявки с лендинга
`kind` (`member` / `partner`), `status` (`new` / `approved` / `rejected`),
поля участницы (name, age ≥ 18, city, instagram, interests), поля
заведения (venue_name, category, contact_name, phone, instagram,
avg_check), `consent`, `consent_at`, `lang`, `review_note`, `reviewed_at`.
Check-ограничения требуют свои поля для каждого `kind`.

### pair_stats — представление для дашборда
На каждую пару: визиты участницы, просмотры, клики (без ботов) и
уникальные, брони (без отменённых), гости всего / по брони / по фразе,
выручка, **гостей на визит** = гости ÷ визиты, **конверсия просмотров в
гостей** = гости ÷ просмотры. `security_invoker = true`, чтобы RLS
действовал и через представление.

## 4. Порядок работы

1. План и схема (этот файл, `supabase/migrations/0001_init.sql`).
2. Каркас Next.js, токены дизайна, шрифты, иконка, i18n.
3. Лендинг и формы заявок.
4. Публичная страница и бронь, логирование кликов.
5. Страница хостес.
6. Админка: вход, заявки, CRUD, ссылки, визиты и скрины, дашборд, CSV.
7. Проверка: типы, линт, сборка, прогон на локальном Postgres с демо-данными,
   скриншоты 1440 / 1024 / 768 / 390, `tools/audit.mjs`.
8. README: развёртывание, как завести заведение и участницу, как выдать
   ссылку хостес.

## 5. Каталог и бронь стола (12 ноября 2026, по приложению друга)

Миграция `supabase/migrations/0003_catalog_floorplans.sql`.

| Что | Как |
|---|---|
| `venues` | `is_listed` (в каталоге), `featured` (популярные), `open_time`, `close_time` (раньше открытия — после полуночи), `slot_minutes` (15/30/60), `hold_minutes` (сколько держим стол) |
| `venue_halls` | залы заведения: название ru/kk, ширина × глубина в единицах плана |
| `venue_tables` | столы и подписи: `kind` table/decor, номер, форма, x/y/w/h, места от/до |
| `guest_bookings` | `venue_id`, `source` link/catalog (ссылка участницы теперь необязательна), `table_id`, `hold_minutes`, `starts_at` (дата + время); **exclusion constraint**: один стол нельзя занять на пересекающееся время даже при одновременных запросах |
| `guest_visits` | `venue_id`; у гостя из каталога нет ссылки участницы |

Время считается в минутах «сервисного дня»: бар 17:00–02:00 имеет слоты
до 25:00 = 01:00 следующего календарного дня. Хостес видит день с 06:00
до 06:00. Правила — `src/lib/booking.ts`, одни и те же в браузере и на
сервере; доступность — `GET /api/availability?venue=&date=` (только
номера столов и минуты, без имён и телефонов).

Страницы: `/` — «Обзор», `/places` — все места, `/v/<заведение>` —
страница заведения с планом и бронью, `/join` — клуб и заявки. Ссылка
участницы `/<участница>/<заведение>` использует тот же модуль брони, бронь
засчитывается её паре. Брони из каталога в метрику пилота не входят и
показаны на дашборде отдельной строкой.

Не сделано сейчас: события, карта, «Рядом со мной», «Самый быстрый ответ»
из приложения друга.
