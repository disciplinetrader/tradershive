
CREATE POLICY "chart-screenshots owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chart-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chart-screenshots owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chart-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chart-screenshots owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'chart-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chart-screenshots owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chart-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "chart-layouts owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chart-layouts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chart-layouts owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chart-layouts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chart-layouts owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'chart-layouts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chart-layouts owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chart-layouts' AND auth.uid()::text = (storage.foldername(name))[1]);
