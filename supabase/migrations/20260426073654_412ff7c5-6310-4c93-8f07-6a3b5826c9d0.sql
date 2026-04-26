CREATE OR REPLACE FUNCTION public.fmt_kes(_n NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 'Ksh' || to_char(_n, 'FM999,999,999,990.00');
$$;