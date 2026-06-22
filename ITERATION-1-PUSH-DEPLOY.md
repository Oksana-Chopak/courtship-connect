# Iteration 1 — Push (Save My Set): гайд деплою

Код готовий і змержений у гілці `iteration-1-push`. Щоб пуші ожили, треба разово
налаштувати VAPID-ключі, секрети, env і вебхук. ~15 хвилин.

## 1. Згенерувати VAPID-ключі (один раз)
```bash
npx web-push generate-vapid-keys
```
Отримаєш `Public Key` і `Private Key`. Public — публічний (безпечно світити), Private — секрет.

## 2. Секрети Supabase (для edge-функції)
Supabase Dashboard → Edge Functions → Manage secrets (або CLI):
```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=<public> \
  VAPID_PRIVATE_KEY=<private> \
  VAPID_SUBJECT=mailto:ти@клуб.se
```
`SUPABASE_URL` і `SUPABASE_SERVICE_ROLE_KEY` Supabase інжектить у функцію автоматично.

## 3. Клієнтський env
Встанови `VITE_VAPID_PUBLIC_KEY=<той самий public>` — у Lovable (Project → Env) і/або в `.env`.
Це публічний ключ, його безпечно комітити.

## 4. Задеплоїти edge-функцію
```bash
supabase functions deploy sos-notify
```
(або через Supabase-інтеграцію Lovable, якщо деплоїш звідти).

## 5. Database Webhook → функція
Supabase Dashboard → Database → Webhooks → **Create a new hook**:
- **Table:** `public.sos_requests`
- **Events:** ✅ Insert  ✅ Update
- **Type:** Supabase Edge Functions → `sos-notify`
- **Method:** POST
Функція сама фільтрує: шле лише коли рядок став активним урґентним SOS (kind=`sos`,
status=`active`) — на INSERT або на момент flare/ескалації. На інших апдейтах — мовчить.

## 6. Міграції
`20260621130000_push_infra.sql` і `20260621140000_sos_push_targets.sql` застосуються
через міграційний синк Lovable/Supabase (як решта).

---

## Як перевірити (на реальному телефоні, прод)
1. Встанови PWA: відкрий прод-URL у браузері телефона → **Add to Home Screen**.
2. Відкрий апку з іконки → `/me` → блок **«Last-minute SOS alerts»** → **Turn on alerts** → дозволь сповіщення. Має зʼявитися «You're on the rescue squad ✓».
3. Налаштуй радіус / ліміт / wake-me, **Save**.
4. Іншим акаунтом (інший телефон) у тому ж місті й твоєму рівневому діапазоні створи **урґентний** SOS (час ≤ 6 год).
5. **Закрий апку.** Протягом кількох секунд має прийти пуш «🚨 SOS · a partner needs you». Тап → відкриває `/sos/<id>` (екран контакту з WhatsApp).

## Нюанси (важливо)
- **Прод-онлі:** SW і пуші працюють лише в продакшені — у Lovable-прев'ю service worker навмисно вимкнено. У прев'ю опт-ін graceful no-op.
- **iOS:** пуші тільки для PWA, доданого на Home Screen (iOS 16.4+). У звичайному Safari iOS пушів немає.
- **Тихі години 22:00–07:00 (Europe/Stockholm)** — за замовчуванням не турбуємо; «Wake me» вимикає це для маніяків тенісу.
- **Ліміт/тиждень** рахується з `push_events`; **радіус** поки що зводиться до міста (реальний радіус — Iteration 2, гео).
- Мертві підписки (404/410) функція сама чистить.
