-- 1. battle_chat: prevent kind escalation on UPDATE
DROP POLICY IF EXISTS "Author or moderator can update chat" ON public.battle_chat;
CREATE POLICY "Author or moderator can update chat"
ON public.battle_chat
FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid()) OR is_battle_host(battle_id, auth.uid()) OR is_platform_admin(auth.uid())
)
WITH CHECK (
  (
    is_battle_host(battle_id, auth.uid()) OR is_platform_admin(auth.uid())
  )
  OR (user_id = auth.uid() AND kind = 'user'::text)
);

-- 2. community_challenge_entries: authenticated-only reads
DROP POLICY IF EXISTS "cce read" ON public.community_challenge_entries;
CREATE POLICY "cce read"
ON public.community_challenge_entries
FOR SELECT
TO authenticated
USING (true);
REVOKE SELECT ON public.community_challenge_entries FROM anon;

-- 3. community_reactions: authenticated-only reads
DROP POLICY IF EXISTS "reactions read" ON public.community_reactions;
CREATE POLICY "reactions read"
ON public.community_reactions
FOR SELECT
TO authenticated
USING (true);
REVOKE SELECT ON public.community_reactions FROM anon;

-- 4. strategy_comments: authenticated-only reads of public-strategy comments
DROP POLICY IF EXISTS "read_public_comments" ON public.strategy_comments;
CREATE POLICY "read_public_comments"
ON public.strategy_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_comments.strategy_id
      AND s.status = 'public'::strategy_status
  )
);

DROP POLICY IF EXISTS "own_comments" ON public.strategy_comments;
CREATE POLICY "own_comments"
ON public.strategy_comments
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
REVOKE SELECT ON public.strategy_comments FROM anon;
