CREATE TABLE IF NOT EXISTS public.economic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_time timestamptz NOT NULL,
  currency text NOT NULL,
  title text NOT NULL,
  impact text NOT NULL DEFAULT 'low' CHECK (impact IN ('high','medium','low','holiday')),
  actual text,
  forecast text,
  previous text,
  source text NOT NULL DEFAULT 'faireconomy',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_time, currency, title)
);

CREATE INDEX IF NOT EXISTS economic_events_time_idx ON public.economic_events (event_time);
CREATE INDEX IF NOT EXISTS economic_events_currency_time_idx ON public.economic_events (currency, event_time);

GRANT SELECT ON public.economic_events TO authenticated;
GRANT ALL ON public.economic_events TO service_role;

ALTER TABLE public.economic_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "economic_events_select_authenticated"
  ON public.economic_events FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_economic_events_updated_at
  BEFORE UPDATE ON public.economic_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();