CREATE OR REPLACE FUNCTION public.create_txn_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sender_balance NUMERIC;
  _recipient_balance NUMERIC;
  _recipient_name TEXT;
  _sender_name TEXT;
  _sender_phone TEXT;
  _ts TEXT;
  _body TEXT;
  _looked_up_name TEXT;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;

  _ts := to_char(NEW.completed_at AT TIME ZONE 'Africa/Nairobi', 'DD/MM/YYYY "at" HH12:MI AM');

  IF NEW.sender_id IS NOT NULL THEN
    SELECT balance INTO _sender_balance FROM wallets WHERE user_id = NEW.sender_id;
    SELECT full_name, phone INTO _sender_name, _sender_phone FROM profiles WHERE id = NEW.sender_id;

    IF NEW.recipient_id IS NOT NULL THEN
      SELECT full_name INTO _recipient_name FROM profiles WHERE id = NEW.recipient_id;
      IF NEW.recipient_phone IS NOT NULL THEN
        _recipient_name := COALESCE(_recipient_name, '') || ' ' || NEW.recipient_phone;
      END IF;
    ELSIF NEW.recipient_phone IS NOT NULL THEN
      -- Try to extract looked-up name from description ("Send to <name>")
      IF NEW.description LIKE 'Send to %' THEN
        _looked_up_name := substring(NEW.description from 9);
      END IF;
      IF _looked_up_name IS NOT NULL AND _looked_up_name NOT LIKE '+%' AND _looked_up_name <> '' THEN
        _recipient_name := _looked_up_name || ' ' || NEW.recipient_phone;
      ELSE
        _recipient_name := NEW.recipient_phone;
      END IF;
    ELSIF NEW.recipient_shortcode IS NOT NULL THEN
      _recipient_name := NEW.recipient_shortcode;
    END IF;

    _body := NEW.ref_code || ' Confirmed. ' || fmt_kes(NEW.amount) || ' sent to '
          || COALESCE(_recipient_name, 'recipient') || ' on ' || _ts
          || '. New M-PESA balance is ' || fmt_kes(_sender_balance)
          || '. Transaction Cost,' || fmt_kes(NEW.fee)
          || '. Amount you can transact within the day is Ksh499,777.00.'
          || ' Sign up for Lipa Na M-PESA Till online';

    INSERT INTO messages (user_id, ref_code, body, link_url, link_label)
    VALUES (NEW.sender_id, NEW.ref_code, _body, 'https://m-pesaforbusiness.co.ke', 'm-pesaforbusiness.co.ke');
  END IF;

  IF NEW.recipient_id IS NOT NULL AND NEW.recipient_id <> COALESCE(NEW.sender_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    SELECT balance INTO _recipient_balance FROM wallets WHERE user_id = NEW.recipient_id;
    _body := NEW.ref_code || ' Confirmed. You have received ' || fmt_kes(NEW.amount) || ' from '
          || COALESCE(_sender_name, 'sender') || ' ' || COALESCE(_sender_phone, '')
          || ' on ' || _ts
          || '. New M-PESA balance is ' || fmt_kes(_recipient_balance)
          || '. Separate personal and business funds through pochi la Biashara on *334#';

    INSERT INTO messages (user_id, ref_code, body)
    VALUES (NEW.recipient_id, NEW.ref_code, _body);
  END IF;

  RETURN NEW;
END $function$;