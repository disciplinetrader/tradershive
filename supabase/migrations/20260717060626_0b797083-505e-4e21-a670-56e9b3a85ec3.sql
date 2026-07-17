
-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Storage RLS: users manage files under their own uid folder in each bucket
-- File path convention: "<user_id>/<file>"

-- Avatars: readable by anyone signed in, writable only by owner
CREATE POLICY "Avatars are viewable by authenticated users"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Users upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete their own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Journal images: private to owner
CREATE POLICY "Users read own journal images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'journal-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users insert own journal images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'journal-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own journal images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'journal-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own journal images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'journal-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Trade images: private to owner
CREATE POLICY "Users read own trade images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users insert own trade images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own trade images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own trade images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Challenge images: read for all authenticated, admin writes
CREATE POLICY "Challenge images readable by authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'challenge-images');

CREATE POLICY "Admins manage challenge images"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'challenge-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'challenge-images' AND public.has_role(auth.uid(), 'admin'));
