
CREATE OR REPLACE FUNCTION public.join_championship_live(_champ uuid)
RETURNS TABLE(registration_id uuid, participant_id uuid, paper_account_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v public.championships%ROWTYPE;
  v_reg_id uuid;
  v_part_id uuid;
  v_acc_id uuid;
  v_existing_acc uuid;
  v_bal numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v FROM public.championships WHERE id = _champ;
  IF NOT FOUND THEN RAISE EXCEPTION 'Championship not found'; END IF;
  IF v.status NOT IN ('registration','upcoming','live') THEN
    RAISE EXCEPTION 'Championship is not open for join (status=%)', v.status;
  END IF;

  v_bal := COALESCE(v.starting_balance, 10000);

  -- Reuse existing paper account for this championship if user re-joins
  SELECT id INTO v_existing_acc
  FROM public.paper_accounts
  WHERE user_id = v_uid AND championship_id = _champ AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_acc IS NOT NULL THEN
    v_acc_id := v_existing_acc;
  ELSE
    INSERT INTO public.paper_accounts(
      user_id, name, currency, starting_balance, balance, equity,
      leverage, max_daily_risk_pct, max_trade_risk_pct, is_active, championship_id
    ) VALUES (
      v_uid,
      'Championship: ' || v.name,
      'USD',
      v_bal, v_bal, v_bal,
      100,
      COALESCE(v.max_daily_loss_pct, 5),
      COALESCE(v.max_risk_per_trade_pct, 2),
      true,
      _champ
    ) RETURNING id INTO v_acc_id;
  END IF;

  INSERT INTO public.championship_registrations(championship_id, user_id, accepted_rules_at)
    VALUES (_champ, v_uid, now())
    ON CONFLICT (championship_id, user_id)
      DO UPDATE SET cancelled_at = NULL, accepted_rules_at = now()
    RETURNING id INTO v_reg_id;

  INSERT INTO public.championship_participants(championship_id, user_id, paper_account_id, status)
    VALUES (_champ, v_uid, v_acc_id, 'active')
    ON CONFLICT (championship_id, user_id)
      DO UPDATE SET paper_account_id = EXCLUDED.paper_account_id, status = 'active', updated_at = now()
    RETURNING id INTO v_part_id;

  PERFORM public.emit_championship_activity(
    _champ, v_uid, 'registration',
    'Joined live tournament with $' || v_bal::text || ' account',
    jsonb_build_object('paper_account_id', v_acc_id),
    'info'
  );

  RETURN QUERY SELECT v_reg_id, v_part_id, v_acc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_championship_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_championship_live(uuid) TO authenticated;
