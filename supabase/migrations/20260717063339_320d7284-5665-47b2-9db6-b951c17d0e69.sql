
-- 1) Extend profiles with fields for onboarding, name split, goals, and premium flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goals text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS preferred_markets text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz;

-- 2) user_settings: notification + interface preferences
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_weekly_report boolean NOT NULL DEFAULT true,
  notify_challenges boolean NOT NULL DEFAULT true,
  notify_rank_changes boolean NOT NULL DEFAULT false,
  notify_product_updates boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  notify_push boolean NOT NULL DEFAULT true,
  locale text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON public.user_settings;

CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own settings" ON public.user_settings
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) user_preferences: trading goals + interface prefs
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_goal text,
  daily_xp_goal integer NOT NULL DEFAULT 200,
  chart_default_symbol text NOT NULL DEFAULT 'BTCUSD',
  chart_default_interval text NOT NULL DEFAULT '1h',
  show_pnl_percent boolean NOT NULL DEFAULT true,
  risk_per_trade_pct numeric(5,2) NOT NULL DEFAULT 1.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own prefs" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert own prefs" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own prefs" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can delete own prefs" ON public.user_preferences;

CREATE POLICY "Users can view own prefs" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own prefs" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own prefs" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own prefs" ON public.user_preferences
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Update handle_new_user to capture rich signup metadata and seed all 3 tables
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  base_username TEXT;
  final_username TEXT;
  suffix INTEGER := 0;
  md JSONB;
BEGIN
  md := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  base_username := COALESCE(
    md->>'username',
    split_part(NEW.email, '@', 1),
    'trader_' || substr(NEW.id::text, 1, 8)
  );
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]+', '_', 'g');
  IF length(base_username) < 3 THEN
    base_username := 'trader_' || substr(NEW.id::text, 1, 8);
  END IF;
  final_username := base_username;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (
    id, username, display_name, email, avatar_url,
    first_name, last_name, country, timezone,
    experience, preferred_market, trading_style,
    preferred_markets, onboarded, accepted_terms_at
  )
  VALUES (
    NEW.id,
    final_username,
    COALESCE(md->>'display_name', md->>'full_name', md->>'name', final_username),
    NEW.email,
    md->>'avatar_url',
    md->>'first_name',
    md->>'last_name',
    md->>'country',
    COALESCE(md->>'timezone', 'UTC'),
    NULLIF(md->>'experience','')::public.trading_experience,
    NULLIF(md->>'preferred_market','')::public.preferred_market,
    NULLIF(md->>'trading_style','')::public.trading_style,
    CASE
      WHEN md ? 'preferred_markets'
        THEN ARRAY(SELECT jsonb_array_elements_text(md->'preferred_markets'))
      ELSE ARRAY[]::text[]
    END,
    COALESCE((md->>'onboarded')::boolean, false),
    CASE WHEN (md->>'accepted_terms')::boolean THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_settings (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 5) Ensure the auth trigger is attached (idempotent) so every new auth user gets a profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6) Backfill settings/preferences for existing users
INSERT INTO public.user_settings (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_preferences (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- 7) Storage RLS for avatars bucket (bucket already exists; only manage policies)
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

CREATE POLICY "Public read avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
