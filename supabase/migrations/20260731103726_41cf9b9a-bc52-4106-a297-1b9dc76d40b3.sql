CREATE TABLE public.chart_position_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  position_id TEXT,
  drawing_id TEXT,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL,
  client_updated_at BIGINT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id)
);

CREATE INDEX idx_chart_position_orders_user_symbol ON public.chart_position_orders (user_id, symbol);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_position_orders TO authenticated;
GRANT ALL ON public.chart_position_orders TO service_role;

ALTER TABLE public.chart_position_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own chart position orders"
  ON public.chart_position_orders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_chart_position_orders_updated_at
  BEFORE UPDATE ON public.chart_position_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();