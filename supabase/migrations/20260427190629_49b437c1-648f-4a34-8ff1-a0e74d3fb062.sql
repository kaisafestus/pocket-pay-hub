
CREATE OR REPLACE FUNCTION public.transfer_funds(
  _sender uuid,
  _amount numeric,
  _type txn_type,
  _recipient uuid DEFAULT NULL,
  _description text DEFAULT NULL::text,
  _recipient_phone text DEFAULT NULL::text,
  _shortcode text DEFAULT NULL::text,
  _account_ref text DEFAULT NULL::text,
  _fee numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _txn_id UUID;
  _ref TEXT;
  _sender_balance NUMERIC;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  SELECT balance INTO _sender_balance FROM public.wallets WHERE user_id = _sender FOR UPDATE;
  IF _sender_balance IS NULL THEN RAISE EXCEPTION 'Sender wallet not found'; END IF;
  IF _sender_balance < (_amount + _fee) THEN RAISE EXCEPTION 'Insufficient funds'; END IF;

  UPDATE public.wallets SET balance = balance - (_amount + _fee) WHERE user_id = _sender;
  IF _recipient IS NOT NULL THEN
    UPDATE public.wallets SET balance = balance + _amount WHERE user_id = _recipient;
  END IF;

  _ref := 'MP' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  INSERT INTO public.transactions (
    ref_code, type, status, amount, fee, sender_id, recipient_id,
    recipient_phone, recipient_shortcode, account_ref, description, completed_at
  ) VALUES (
    _ref, _type, 'completed', _amount, _fee, _sender, _recipient,
    _recipient_phone, _shortcode, _account_ref, _description, now()
  ) RETURNING id INTO _txn_id;
  RETURN _txn_id;
END $function$;
