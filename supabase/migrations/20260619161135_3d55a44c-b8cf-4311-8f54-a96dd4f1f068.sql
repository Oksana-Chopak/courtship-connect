CREATE OR REPLACE FUNCTION public.save_my_profile(_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _code text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  _code := upper(trim(COALESCE(NULLIF(_data->>'signup_code',''),
                               (auth.jwt() -> 'user_metadata' ->> 'signup_code'))));
  INSERT INTO public.profiles (
    id, name, last_name, phone_e164, photo_url, level, formats, play_times,
    vibe, looking_for, home_courts, home_city, home_cities,
    buddy_optin, buddy_radius_km, buddy_sos_optin, bio, fav_shot, signup_code
  ) VALUES (
    _uid,
    COALESCE(NULLIF(_data->>'name',''), 'Player'),
    NULLIF(_data->>'last_name',''),
    COALESCE(NULLIF(_data->>'phone_e164',''), ''),
    NULLIF(_data->>'photo_url',''),
    COALESCE(NULLIF(_data->>'level','')::int, 3),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(_data->'formats') x), '{}'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(_data->'play_times') x), '{}'),
    COALESCE(NULLIF(_data->>'vibe','')::vibe_t, 'friendly'),
    COALESCE(NULLIF(_data->>'looking_for','')::looking_for_t, 'both'),
    NULLIF(_data->>'home_courts',''),
    COALESCE(NULLIF(_data->>'home_city',''), 'Uppsala'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(_data->'home_cities') x), '{}'),
    COALESCE(NULLIF(_data->>'buddy_optin','')::buddy_optin_t, 'sometimes'),
    COALESCE(NULLIF(_data->>'buddy_radius_km','')::int, 10),
    COALESCE((_data->>'buddy_sos_optin')::boolean, true),
    NULLIF(_data->>'bio',''),
    NULLIF(_data->>'fav_shot',''),
    NULLIF(_code,'')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    last_name = EXCLUDED.last_name,
    phone_e164 = EXCLUDED.phone_e164,
    photo_url = COALESCE(EXCLUDED.photo_url, public.profiles.photo_url),
    level = EXCLUDED.level,
    formats = EXCLUDED.formats,
    play_times = EXCLUDED.play_times,
    vibe = EXCLUDED.vibe,
    looking_for = EXCLUDED.looking_for,
    home_courts = EXCLUDED.home_courts,
    home_city = EXCLUDED.home_city,
    home_cities = EXCLUDED.home_cities,
    buddy_optin = EXCLUDED.buddy_optin,
    buddy_radius_km = EXCLUDED.buddy_radius_km,
    buddy_sos_optin = EXCLUDED.buddy_sos_optin,
    bio = EXCLUDED.bio,
    fav_shot = EXCLUDED.fav_shot;
END $$;

GRANT EXECUTE ON FUNCTION public.save_my_profile(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_invite_on_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _valid boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN RETURN NEW; END IF;
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  _code := upper(trim(COALESCE(NEW.signup_code,
                               (auth.jwt() -> 'user_metadata' ->> 'signup_code'))));
  IF _code IS NULL OR _code = '' THEN RAISE EXCEPTION 'invite_required'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.invite_codes WHERE code = _code AND active = true) INTO _valid;
  IF NOT _valid THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  NEW.signup_code := _code;
  RETURN NEW;
END $$;