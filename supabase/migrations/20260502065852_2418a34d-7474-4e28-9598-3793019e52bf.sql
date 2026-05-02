DROP TRIGGER IF EXISTS trg_create_txn_messages ON public.transactions;
-- Clean up the existing duplicates (keep the oldest of each pair)
DELETE FROM public.messages m
USING public.messages m2
WHERE m.user_id = m2.user_id
  AND m.ref_code = m2.ref_code
  AND m.body = m2.body
  AND m.ref_code IS NOT NULL
  AND m.id > m2.id;