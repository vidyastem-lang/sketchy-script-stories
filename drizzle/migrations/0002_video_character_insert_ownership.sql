-- Prevent linking another user's character to an owned video.
DROP POLICY IF EXISTS "video_characters_insert_own" ON public.video_characters;
--> statement-breakpoint
CREATE POLICY "video_characters_insert_own" ON public.video_characters FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.videos v
    WHERE v.id = video_characters.video_id AND v.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = video_characters.character_id AND c.user_id = auth.uid()
  )
);
