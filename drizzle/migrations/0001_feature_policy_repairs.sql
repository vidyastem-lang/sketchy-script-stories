-- Ensure all application asset buckets exist and remain private.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('character-images', 'character-images', false),
  ('scene-assets', 'scene-assets', false),
  ('final-videos', 'final-videos', false)
ON CONFLICT (id) DO UPDATE SET public = false;
--> statement-breakpoint

-- Storage upsert requires UPDATE permission as well as INSERT/SELECT.
CREATE POLICY "character_images_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'character-images' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'character-images' AND (storage.foldername(name))[1] = auth.uid()::text);
--> statement-breakpoint
CREATE POLICY "scene_assets_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'scene-assets' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'scene-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
--> statement-breakpoint
CREATE POLICY "final_videos_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'final-videos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'final-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
--> statement-breakpoint

-- Voice assignment is editable only when both the video and character belong to the caller.
CREATE POLICY "video_characters_update_own" ON public.video_characters FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_characters.video_id AND v.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.characters c WHERE c.id = video_characters.character_id AND c.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_characters.video_id AND v.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.characters c WHERE c.id = video_characters.character_id AND c.user_id = auth.uid())
);
--> statement-breakpoint

-- Limit repeated creation of guest identities from one network; this does not limit
-- video generations inside a successfully provisioned guest session.
CREATE TABLE public.guest_provision_limits (
  ip_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE public.guest_provision_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.guest_provision_limits FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.guest_provision_limits TO service_role;
--> statement-breakpoint
CREATE INDEX guest_provision_limits_window_started_idx ON public.guest_provision_limits (window_started_at);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.consume_guest_provision_slot(p_ip_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_attempts integer;
BEGIN
  DELETE FROM public.guest_provision_limits
  WHERE window_started_at < now() - interval '24 hours';

  INSERT INTO public.guest_provision_limits AS current_window (ip_hash, window_started_at, attempts)
  VALUES (p_ip_hash, now(), 1)
  ON CONFLICT (ip_hash) DO UPDATE
  SET window_started_at = CASE
        WHEN current_window.window_started_at <= now() - interval '1 hour' THEN now()
        ELSE current_window.window_started_at
      END,
      attempts = CASE
        WHEN current_window.window_started_at <= now() - interval '1 hour' THEN 1
        ELSE current_window.attempts + 1
      END
  RETURNING attempts INTO current_attempts;

  RETURN current_attempts <= 15;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_guest_provision_slot(text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.consume_guest_provision_slot(text) TO service_role;
