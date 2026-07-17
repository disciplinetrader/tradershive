
CREATE POLICY "trade screenshots read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'trade-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "trade screenshots insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trade-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "trade screenshots update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'trade-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "trade screenshots delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'trade-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
