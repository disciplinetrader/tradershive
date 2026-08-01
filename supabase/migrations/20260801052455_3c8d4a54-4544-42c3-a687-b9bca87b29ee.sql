CREATE POLICY "replay screenshots owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'replay-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "replay screenshots owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'replay-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "replay screenshots owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'replay-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "replay screenshots owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'replay-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);