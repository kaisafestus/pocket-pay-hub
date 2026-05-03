CREATE OR REPLACE FUNCTION public.gen_mpesa_ref()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  letters TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ';        -- 24 letters (no I, O)
  alnum   TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars (no I,O,0,1)
  seq_num BIGINT;
  n BIGINT;
  prefix TEXT;
  body TEXT;
  result TEXT;
  attempt INT := 0;
  p1 INT;
  p2 INT;
BEGIN
  LOOP
    SELECT COUNT(*) INTO seq_num FROM public.transactions;
    seq_num := seq_num + 1 + attempt;

    -- Scatter sequence so consecutive codes look random
    n := (seq_num * 2654435761)::bigint # 1125899906842597;
    IF n < 0 THEN n := -n; END IF;

    -- Two-letter prefix derived from scattered value
    p1 := (n % 24)::int;
    p2 := ((n / 24) % 24)::int;
    prefix := substr(letters, p1 + 1, 1) || substr(letters, p2 + 1, 1);

    -- 8-char alphanumeric body from remaining bits
    n := n / (24 * 24);
    body := '';
    FOR i IN 1..8 LOOP
      body := substr(alnum, (n % 32)::int + 1, 1) || body;
      n := n / 32;
      IF n = 0 THEN
        n := (seq_num * 1103515245 + attempt * 12345)::bigint;
        IF n < 0 THEN n := -n; END IF;
      END IF;
    END LOOP;

    result := prefix || body;
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE ref_code = result) THEN
      RETURN result;
    END IF;
    attempt := attempt + 1;
    IF attempt > 100 THEN
      RETURN substr(letters, 1 + (attempt % 24), 1)
          || substr(letters, 1 + ((attempt * 7) % 24), 1)
          || upper(substr(md5(clock_timestamp()::text), 1, 8));
    END IF;
  END LOOP;
END;
$function$;