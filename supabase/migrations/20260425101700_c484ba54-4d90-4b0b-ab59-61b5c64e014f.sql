
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('customer', 'agent', 'merchant', 'admin');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT UNIQUE,
  id_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Wallets (in-app M-Pesa balance, ledger of record)
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  pin_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_select_own" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Agents (with float)
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  agent_number TEXT NOT NULL UNIQUE,
  store_name TEXT NOT NULL,
  location TEXT,
  float_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents_select_all_authenticated" ON public.agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "agents_update_own" ON public.agents FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Merchants (Till + Paybill)
CREATE TYPE public.merchant_type AS ENUM ('till', 'paybill');
CREATE TABLE public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type merchant_type NOT NULL,
  shortcode TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merchants_select_all_authenticated" ON public.merchants FOR SELECT TO authenticated USING (true);
CREATE POLICY "merchants_owner_manage" ON public.merchants FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Transactions
CREATE TYPE public.txn_type AS ENUM (
  'send_money', 'receive_money', 'withdraw_agent', 'deposit_agent',
  'pay_till', 'pay_bill', 'buy_airtime', 'mpesa_topup', 'b2c_withdraw', 'reversal'
);
CREATE TYPE public.txn_status AS ENUM ('pending', 'completed', 'failed', 'reversed');

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code TEXT NOT NULL UNIQUE,
  type txn_type NOT NULL,
  status txn_status NOT NULL DEFAULT 'pending',
  amount NUMERIC(14,2) NOT NULL,
  fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  sender_id UUID REFERENCES auth.users ON DELETE SET NULL,
  recipient_id UUID REFERENCES auth.users ON DELETE SET NULL,
  recipient_phone TEXT,
  recipient_shortcode TEXT,
  account_ref TEXT,
  description TEXT,
  -- Daraja fields
  mpesa_receipt TEXT,
  checkout_request_id TEXT,
  merchant_request_id TEXT,
  raw_callback JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.transactions (sender_id, created_at DESC);
CREATE INDEX ON public.transactions (recipient_id, created_at DESC);
CREATE INDEX ON public.transactions (checkout_request_id);

CREATE POLICY "txn_select_involved" ON public.transactions FOR SELECT TO authenticated
USING (
  auth.uid() = sender_id OR auth.uid() = recipient_id
  OR EXISTS (SELECT 1 FROM public.merchants m WHERE m.shortcode = transactions.recipient_shortcode AND m.user_id = auth.uid())
);

-- Trigger: auto-create profile, wallet, customer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone'
  );
  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 0);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomic transfer function (in-app wallet to wallet)
CREATE OR REPLACE FUNCTION public.transfer_funds(
  _sender UUID, _recipient UUID, _amount NUMERIC, _type txn_type,
  _description TEXT DEFAULT NULL, _recipient_phone TEXT DEFAULT NULL,
  _shortcode TEXT DEFAULT NULL, _account_ref TEXT DEFAULT NULL, _fee NUMERIC DEFAULT 0
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;
