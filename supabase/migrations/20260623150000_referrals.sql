-- Referral reward: when someone signs up with a member's PERSONAL invite code,
-- the inviter is credited (referrals_count → Recruiter badge) and the newcomer
-- is auto-buddied with them (already handled by _buddy_on_signup). Extends the
-- existing AFTER-INSERT trigger — no change to the invite-enforcement path.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referrals_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public._buddy_on_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  IF NEW.signup_code IS NULL THEN RETURN NEW; END IF;
  SELECT owner_id INTO _owner FROM public.invite_codes WHERE code = upper(NEW.signup_code);
  IF _owner IS NOT NULL AND _owner <> NEW.id THEN
    PERFORM public._add_buddy(_owner, NEW.id, 'invite');         -- newcomer's reward: instant first buddy
    UPDATE public.profiles SET referrals_count = referrals_count + 1 WHERE id = _owner; -- inviter's reward
  END IF;
  RETURN NEW;
END; $$;
