-- Sequential M-PESA-style ref code generator
-- Format: 2-char daily prefix (deterministic from date) + 8-char sequence (base32 of daily count)
CREATE OR REPLACE FUNCTION public.gen_mpesa_ref()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars (no I,O,0,1)
  base INT := 32;
  prefix TEXT;
  seq_num BIGINT;
  seq TEXT := '';
  n BIGINT;
  d DATE := (now() AT TIME ZONE 'Africa/Nairobi')::date;
  doy INT;
  yr INT;
  p1 INT;
  p2 INT;
  result TEXT;
  attempt INT := 0;
BEGIN
  doy := extract(doy from d)::int;       -- 1..366
  yr  := extract(year from d)::int;
  -- Deterministic 2-letter daily prefix from date
  p1 := ((yr * 7 + doy) % base);
  p2 := ((yr * 13 + doy * 5) % base);
  prefix := substr(alphabet, p1 + 1, 1) || substr(alphabet, p2 + 1, 1);

  LOOP
    -- Daily sequence: count of txns today + 1 + attempt offset
    SELECT COUNT(*) INTO seq_num
    FROM public.transactions
    WHERE (created_at AT TIME ZONE 'Africa/Nairobi')::date = d;
    seq_num := seq_num + 1 + attempt;

    -- Encode seq_num to 8-char base32 (zero-padded)
    seq := '';
    n := seq_num;
    FOR i IN 1..8 LOOP
      seq := substr(alphabet, (n % base)::int + 1, 1) || seq;
      n := n / base;
    END LOOP;

    result := prefix || seq;

    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE ref_code = result) THEN
      RETURN result;
    END IF;
    attempt := attempt + 1;
    IF attempt > 50 THEN
      RETURN prefix || to_char(extract(epoch from clock_timestamp())::bigint, 'FM00000000');
    END IF;
  END LOOP;
END;
$function$;