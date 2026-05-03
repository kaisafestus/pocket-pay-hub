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
  _merchant_name TEXT;
  _agent_name TEXT;
  _agent_number TEXT;
  _ts TEXT;
  _body TEXT;
  _looked_up_name TEXT;
  _paybill_desc TEXT;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  _ts := to_char(COALESCE(NEW.completed_at, NEW.created_at) AT TIME ZONE 'Africa/Nairobi', 'DD/MM/YYYY "at" HH12:MI AM');

  IF NEW.sender_id IS NOT NULL THEN
    SELECT balance INTO _sender_balance FROM public.wallets WHERE user_id = NEW.sender_id;
    SELECT full_name, phone INTO _sender_name, _sender_phone FROM public.profiles WHERE id = NEW.sender_id;
  END IF;

  IF NEW.recipient_id IS NOT NULL THEN
    SELECT balance INTO _recipient_balance FROM public.wallets WHERE user_id = NEW.recipient_id;
    SELECT full_name INTO _recipient_name FROM public.profiles WHERE id = NEW.recipient_id;
  END IF;

  IF NEW.recipient_shortcode IS NOT NULL THEN
    SELECT business_name INTO _merchant_name FROM public.merchants WHERE shortcode = NEW.recipient_shortcode LIMIT 1;
    SELECT store_name, agent_number INTO _agent_name, _agent_number FROM public.agents WHERE agent_number = NEW.recipient_shortcode LIMIT 1;
  END IF;

  IF NEW.description LIKE 'Send to %' THEN
    _looked_up_name := trim(regexp_replace(substring(NEW.description from 9), '\s+•.*$', ''));
  END IF;

  IF NEW.type = 'send_money' AND NEW.sender_id IS NOT NULL THEN
    IF NEW.recipient_id IS NOT NULL THEN
      _recipient_name := trim(COALESCE(_recipient_name, '') || CASE WHEN NEW.recipient_phone IS NOT NULL THEN ' ' || NEW.recipient_phone ELSE '' END);
    ELSIF NEW.recipient_phone IS NOT NULL THEN
      IF _looked_up_name IS NOT NULL AND _looked_up_name <> '' AND _looked_up_name NOT LIKE '+%' THEN
        _recipient_name := upper(_looked_up_name) || ' ' || NEW.recipient_phone;
      ELSE
        _recipient_name := NEW.recipient_phone;
      END IF;
    END IF;

    _body := NEW.ref_code || ' Confirmed. ' || public.fmt_kes(NEW.amount) || ' sent to '
          || COALESCE(NULLIF(_recipient_name, ''), NEW.recipient_phone, 'recipient') || ' on ' || _ts
          || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_sender_balance, 0))
          || '. Transaction Cost,' || public.fmt_kes(NEW.fee)
          || '. Amount you can transact within the day is Ksh499,777.00.'
          || ' Sign up for Lipa Na M-PESA Till online';

    INSERT INTO public.messages (user_id, ref_code, body, link_url, link_label)
    VALUES (NEW.sender_id, NEW.ref_code, _body, 'https://m-pesaforbusiness.co.ke', 'm-pesaforbusiness.co.ke');

    IF NEW.recipient_id IS NOT NULL AND NEW.recipient_id <> NEW.sender_id THEN
      _body := NEW.ref_code || ' Confirmed. You have received ' || public.fmt_kes(NEW.amount) || ' from '
            || COALESCE(_sender_name, 'sender') || CASE WHEN _sender_phone IS NOT NULL THEN ' ' || _sender_phone ELSE '' END
            || ' on ' || _ts
            || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_recipient_balance, 0))
            || '. Separate personal and business funds through pochi la Biashara on *334#';
      INSERT INTO public.messages (user_id, ref_code, body)
      VALUES (NEW.recipient_id, NEW.ref_code, _body);
    END IF;

  ELSIF NEW.type = 'pay_till' AND NEW.sender_id IS NOT NULL THEN
    _body := NEW.ref_code || ' Confirmed. ' || public.fmt_kes(NEW.amount) || ' paid to '
          || upper(COALESCE(NULLIF(NEW.description, ''), _merchant_name, NEW.recipient_shortcode, 'business')) || ' on ' || _ts
          || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_sender_balance, 0))
          || '. Transaction Cost,' || public.fmt_kes(NEW.fee)
          || '. Amount you can transact within the day is Ksh499,777.00.';
    INSERT INTO public.messages (user_id, ref_code, body)
    VALUES (NEW.sender_id, NEW.ref_code, _body);

  ELSIF NEW.type = 'pay_bill' AND NEW.sender_id IS NOT NULL THEN
    _paybill_desc := trim(regexp_replace(COALESCE(NEW.description, ''), '\s+•.*$', ''));
    _body := NEW.ref_code || ' Confirmed. ' || public.fmt_kes(NEW.amount) || ' sent to '
          || upper(COALESCE(NULLIF(_paybill_desc, ''), _merchant_name, NEW.recipient_shortcode, 'business'))
          || CASE WHEN NEW.account_ref IS NOT NULL THEN ' for account ' || NEW.account_ref ELSE '' END
          || ' on ' || _ts
          || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_sender_balance, 0))
          || '. Transaction Cost,' || public.fmt_kes(NEW.fee)
          || '. Amount you can transact within the day is Ksh499,777.00.';
    INSERT INTO public.messages (user_id, ref_code, body)
    VALUES (NEW.sender_id, NEW.ref_code, _body);

  ELSIF NEW.type = 'withdraw_agent' AND NEW.sender_id IS NOT NULL THEN
    _body := NEW.ref_code || ' Confirmed. ' || public.fmt_kes(NEW.amount) || ' withdrawn from '
          || COALESCE(_agent_name, NEW.description, NEW.recipient_shortcode, 'agent') || ' on ' || _ts
          || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_sender_balance, 0))
          || '. Transaction Cost,' || public.fmt_kes(NEW.fee)
          || '. Amount you can transact within the day is Ksh499,777.00.';
    INSERT INTO public.messages (user_id, ref_code, body)
    VALUES (NEW.sender_id, NEW.ref_code, _body);

  ELSIF NEW.type = 'deposit_agent' THEN
    IF NEW.recipient_id IS NOT NULL THEN
      _body := NEW.ref_code || ' Confirmed. You have received ' || public.fmt_kes(NEW.amount) || ' from '
            || COALESCE(_agent_name, _sender_name, 'agent') || CASE WHEN NEW.recipient_shortcode IS NOT NULL THEN ' ' || NEW.recipient_shortcode ELSE '' END
            || ' on ' || _ts
            || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_recipient_balance, 0))
            || '. Separate personal and business funds through pochi la Biashara on *334#';
      INSERT INTO public.messages (user_id, ref_code, body)
      VALUES (NEW.recipient_id, NEW.ref_code, _body);
    END IF;
    IF NEW.sender_id IS NOT NULL THEN
      _body := NEW.ref_code || ' Confirmed. Customer deposit of ' || public.fmt_kes(NEW.amount)
            || ' to ' || COALESCE(_recipient_name, NEW.recipient_phone, 'customer') || ' on ' || _ts
            || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_sender_balance, 0)) || '.';
      INSERT INTO public.messages (user_id, ref_code, body)
      VALUES (NEW.sender_id, NEW.ref_code, _body);
    END IF;

  ELSIF NEW.type = 'mpesa_topup' AND NEW.recipient_id IS NOT NULL THEN
    _body := NEW.ref_code || ' Confirmed. You have received ' || public.fmt_kes(NEW.amount)
          || ' from M-PESA top-up on ' || _ts
          || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_recipient_balance, 0)) || '.';
    INSERT INTO public.messages (user_id, ref_code, body)
    VALUES (NEW.recipient_id, NEW.ref_code, _body);

  ELSIF NEW.type = 'reversal' THEN
    IF NEW.sender_id IS NOT NULL THEN
      _body := NEW.ref_code || ' Confirmed. Reversal of ' || public.fmt_kes(NEW.amount)
            || ' to ' || COALESCE(_recipient_name, 'recipient') || ' on ' || _ts
            || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_sender_balance, 0)) || '.';
      INSERT INTO public.messages (user_id, ref_code, body)
      VALUES (NEW.sender_id, NEW.ref_code, _body);
    END IF;
    IF NEW.recipient_id IS NOT NULL AND NEW.recipient_id <> COALESCE(NEW.sender_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      _body := NEW.ref_code || ' Confirmed. You have received reversed funds of ' || public.fmt_kes(NEW.amount)
            || ' from ' || COALESCE(_sender_name, 'sender') || ' on ' || _ts
            || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_recipient_balance, 0)) || '.';
      INSERT INTO public.messages (user_id, ref_code, body)
      VALUES (NEW.recipient_id, NEW.ref_code, _body);
    END IF;

  ELSE
    IF NEW.sender_id IS NOT NULL THEN
      _body := NEW.ref_code || ' Confirmed. ' || public.fmt_kes(NEW.amount) || ' ' || replace(NEW.type::text, '_', ' ')
            || ' on ' || _ts || '. New M-PESA balance is ' || public.fmt_kes(COALESCE(_sender_balance, 0))
            || '. Transaction Cost,' || public.fmt_kes(NEW.fee) || '.';
      INSERT INTO public.messages (user_id, ref_code, body)
      VALUES (NEW.sender_id, NEW.ref_code, _body);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;