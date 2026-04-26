
-- Messages table (M-PESA SMS-style notifications)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ref_code TEXT,
  body TEXT NOT NULL,
  link_url TEXT,
  link_label TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_user_created ON public.messages(user_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Helper: format KES like "Ksh1,050.00"
CREATE OR REPLACE FUNCTION public.fmt_kes(_n NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT 'Ksh' || to_char(_n, 'FM999,999,999,990.00');
$$;

-- Trigger: build SMS-style messages after completed transactions
CREATE OR REPLACE FUNCTION public.create_txn_messages()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sender_balance NUMERIC;
  _recipient_balance NUMERIC;
  _recipient_name TEXT;
  _sender_name TEXT;
  _sender_phone TEXT;
  _ts TEXT;
  _body TEXT;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;

  _ts := to_char(NEW.completed_at AT TIME ZONE 'Africa/Nairobi', 'DD/MM/YYYY "at" HH12:MI AM');

  IF NEW.sender_id IS NOT NULL THEN
    SELECT balance INTO _sender_balance FROM wallets WHERE user_id = NEW.sender_id;
    SELECT full_name, phone INTO _sender_name, _sender_phone FROM profiles WHERE id = NEW.sender_id;

    IF NEW.recipient_id IS NOT NULL THEN
      SELECT full_name INTO _recipient_name FROM profiles WHERE id = NEW.recipient_id;
    ELSIF NEW.recipient_phone IS NOT NULL THEN
      _recipient_name := NEW.recipient_phone;
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
END $$;

CREATE TRIGGER trg_create_txn_messages
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.create_txn_messages();

-- Welcome message on signup
CREATE OR REPLACE FUNCTION public.send_welcome_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO messages (user_id, body, link_url, link_label) VALUES (
    NEW.id,
    'Karibu M-PESA! Your account is now active with a starting balance of Ksh20,000.00. Dial *334# anytime to access M-PESA services. For help visit',
    'https://m-pesaforbusiness.co.ke',
    'm-pesaforbusiness.co.ke'
  );
  RETURN NEW;
END $$;

CREATE TRIGGER trg_send_welcome_message
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.send_welcome_message();
