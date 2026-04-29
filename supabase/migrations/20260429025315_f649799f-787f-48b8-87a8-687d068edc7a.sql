
-- Make handle_new_user resilient to phone uniqueness collisions and other issues
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _phone TEXT;
BEGIN
  _phone := NEW.raw_user_meta_data->>'phone';

  -- If phone already exists on a different profile, null it out to avoid unique violation
  IF _phone IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE phone = _phone AND id <> NEW.id) THEN
    _phone := NULL;
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, full_name, phone)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      _phone
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.profiles (id, full_name, phone)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), NULL)
    ON CONFLICT (id) DO NOTHING;
  END;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (NEW.id, 20000)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;
