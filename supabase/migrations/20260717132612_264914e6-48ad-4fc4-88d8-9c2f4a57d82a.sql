
-- Provider credentials (encrypted; server-only access)
CREATE TABLE public.provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL,
  field_key text NOT NULL,
  ciphertext text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, field_key)
);
GRANT ALL ON public.provider_credentials TO service_role;
ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon — service role only via server fns.
CREATE TRIGGER update_provider_credentials_updated_at
  BEFORE UPDATE ON public.provider_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-market provider assignment
CREATE TABLE public.provider_market_assignments (
  market_kind text PRIMARY KEY,
  primary_code text,
  fallback_code text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_market_assignments TO authenticated;
GRANT ALL ON public.provider_market_assignments TO service_role;
ALTER TABLE public.provider_market_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments readable to authenticated"
  ON public.provider_market_assignments FOR SELECT TO authenticated USING (true);
-- Writes only via server functions using service role after admin gate.
CREATE TRIGGER update_provider_market_assignments_updated_at
  BEFORE UPDATE ON public.provider_market_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Provider health check log
CREATE TABLE public.provider_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  latency_ms integer,
  error_code text,
  error_message text,
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_health_checks TO authenticated;
GRANT ALL ON public.provider_health_checks TO service_role;
ALTER TABLE public.provider_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health checks readable to platform admins"
  ON public.provider_health_checks FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));
CREATE INDEX idx_provider_health_checks_provider_time
  ON public.provider_health_checks (provider_code, checked_at DESC);

-- Extend market_providers with quick health summary
ALTER TABLE public.market_providers
  ADD COLUMN IF NOT EXISTS last_health_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_ok boolean,
  ADD COLUMN IF NOT EXISTS last_latency_ms integer;
