
DO $$
DECLARE b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['strategy-images','strategy-files','strategy-covers'] LOOP
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects FOR ALL TO authenticated
        USING (bucket_id = %L AND (auth.uid())::text = (storage.foldername(name))[1])
        WITH CHECK (bucket_id = %L AND (auth.uid())::text = (storage.foldername(name))[1])
    $f$, b || '_own', b, b);
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = %L AND EXISTS (
          SELECT 1 FROM public.strategies s
          WHERE s.user_id::text = (storage.foldername(name))[1] AND s.status = 'public'
        ))
    $f$, b || '_read_public', b, b);
  END LOOP;
END $$;
