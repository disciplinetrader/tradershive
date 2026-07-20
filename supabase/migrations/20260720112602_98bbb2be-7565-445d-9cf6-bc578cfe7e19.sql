DROP POLICY IF EXISTS hg_auth_read ON public.historical_gaps;
DROP POLICY IF EXISTS hij_auth_read ON public.historical_import_jobs;
DROP POLICY IF EXISTS hsl_auth_read ON public.historical_sync_logs;

CREATE POLICY hg_admin_read ON public.historical_gaps
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY hij_admin_read ON public.historical_import_jobs
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY hsl_admin_read ON public.historical_sync_logs
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));