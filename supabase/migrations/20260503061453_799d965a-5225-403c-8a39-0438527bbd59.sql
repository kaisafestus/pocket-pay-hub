CREATE OR REPLACE FUNCTION public.gen_mpesa_ref()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars (no I,O,0,1)
  base INT := 32;
  seq_num BIGINT;
  n BIGINT;
  s TEXT;
  result TEXT;
  attempt INT := 0;
BEGIN
  LOOP
    SELECT COUNT(*) INTO seq_num FROM public.transactions;
    seq_num := seq_num + 1 + attempt;

    -- Mix the sequence with a large prime so consecutive codes look random
    -- but remain unique and monotonic in space.
    n := (seq_num * 2654435761)::bigint;
    -- Keep within 50 bits to fit comfortably in 10 base32 chars (50 bits)
    n := n # 1125899906842597; -- xor with prime to scatter
    IF n < 0 THEN n := -n; END IF;
    n := n % 1125899906842624; -- 2^50

    s := '';
    FOR i IN 1..10 LOOP
      s := substr(alphabet, (n % base)::int + 1, 1) || s;
      n := n / base;
    END LOOP;

    result := s;
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE ref_code = result) THEN
      RETURN result;
    END IF;
    attempt := attempt + 1;
    IF attempt > 100 THEN
      RETURN substr(md5(clock_timestamp()::text), 1, 10);
    END IF;
  END LOOP;
END;
$function$;