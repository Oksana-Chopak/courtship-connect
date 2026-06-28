INSERT INTO public.invite_codes (code)
SELECT upper(trim(raw_user_meta_data->>'signup_code'))
FROM auth.users
WHERE email = 'chopak.info@gmail.com'
  AND coalesce(trim(raw_user_meta_data->>'signup_code'), '') <> ''
ON CONFLICT (code) DO UPDATE SET active = true;

INSERT INTO public.invite_codes (code) VALUES ('UPPSALA80')
ON CONFLICT (code) DO UPDATE SET active = true;