-- Retire temporary browser crash-log uploads, including older cached pages
-- that can still call the Supabase API directly. Keep the private records.
revoke execute on function public.exam_client_log(text, text, jsonb)
  from public, anon, authenticated, service_role;
