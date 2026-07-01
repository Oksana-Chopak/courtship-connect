# Iteration 1 — Push (Save My Set): деплой через Lovable + термінал

**Без доступу до Supabase-дашборду.** Усе йде через Lovable (Cloud → Secrets, авто-деплой
edge-функції, міграції) і твій термінал (генерація VAPID). Тригер пушів — виклик функції
з апки (не вебхук), тож дашборд не потрібен зовсім. ~15 хвилин.

## 1. Згенерувати VAPID-ключі (термінал)
```bash
npx web-push generate-vapid-keys
```
Отримаєш `Public Key` і `Private Key`. Public — публічний, Private — секрет.

## 2. Секрети в Lovable (для edge-функції)
Lovable → вкладка **Cloud → Secrets** → **Add Secret** (по одному):
| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | <public> |
| `VAPID_PRIVATE_KEY` | <private> |
| `VAPID_SUBJECT` | `mailto:ти@клуб.se` |
Lovable шифрує їх і сам інжектить у функцію. `SUPABASE_URL` і `SUPABASE_SERVICE_ROLE_KEY`
додаються автоматично — їх не чіпай.

## 3. Публічний ключ для фронту
Додай `VITE_VAPID_PUBLIC_KEY=<той самий public>`:
- у Lovable (Project env), **або**
- у файл `.env` (рядок уже є, просто впиши значення) — термінал → commit.
Це публічний ключ, комітити безпечно.

## 4. Задеплоїти
Просто **синкни/опублікуй гілку через Lovable** — він сам:
- застосує міграції (`push_infra`, `sos_push_targets`),
- задеплоїть edge-функцію `supabase/functions/sos-notify`.
Жодних ручних команд Supabase. Жодного вебхука — апка викликає функцію сама при
створенні SOS і при flare.

## 5. (Опціонально) термінал замість Lovable-деплою
Якщо колись матимеш Supabase CLI-токен:
```bash
supabase functions deploy sos-notify
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
```
Але через Lovable це не потрібно.

---

## Як перевірити (2 реальні телефони, прод)
1. Встанови PWA: відкрий прод-URL у браузері телефона → **Add to Home Screen** → відкрий з іконки.
2. На телефоні А: `/me` → **«Last-minute SOS alerts»** → **Turn on alerts** → дозволь. Має зʼявитися «You're on the rescue squad ✓».
3. Налаштуй радіус / ліміт / wake-me → **Save**.
4. На телефоні Б (інший акаунт, те саме місто, рівень у діапазоні): створи **урґентний** SOS (час ≤ 6 год).
5. **Закрий апку на телефоні А.** За кілька секунд має прийти пуш «🚨 SOS · a partner needs you». Тап → відкриває `/sos/<id>`.

## Якщо не прийшло — діагностика
- Lovable → Cloud → **Functions → sos-notify → Logs**. Кожен виклик логує `{ targets, sent, pruned }`.
  - `targets: 0` → ніхто не підпадає (перевір: opt-in увімкнено? те саме місто? рівень у діапазоні? не тихі години?).
  - `sent: 0, pruned > 0` → підписки мертві (переустанови PWA, увімкни alerts знову).
  - `error: VAPID keys not configured` → секрети не задано (крок 2).
- Скинь мені лог — скажу, де затик.

## Нюанси
- **Прод-онлі:** SW і пуші працюють лише в продакшені — у Lovable-прев'ю service worker навмисно вимкнено.
- **iOS:** лише для PWA на Home Screen (iOS 16.4+); у звичайному Safari пушів немає.
- **Тихі години 22:00–07:00 (Europe/Stockholm)** — не турбуємо, якщо не ввімкнено «Wake me».
- **Радіус** поки зводиться до міста (реальний гео-радіус — Iteration 2).
- Авто-ескалація (cron open→sos) поки без пушу — додамо в наступному кроці; створення SOS і ручний flare пуш шлють.

<!-- preview rebuild trigger 2026-06-24T07:56:53Z -->
Thu Jun 25 19:09:47 UTC 2026
Fri Jun 26 13:16:21 UTC 2026
Fri Jun 26 14:06:40 UTC 2026
Fri Jun 26 17:27:22 UTC 2026
Fri Jun 26 17:37:50 UTC 2026
2026-06-28 22:57:54 UTC
Rebuild triggered: 2026-06-29T11:12:54Z
Rebuild triggered: 2026-07-01T09:30:55Z
