-- Profiles: minimal user profile, created on signup
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Character library: user-uploaded or AI-generated character sheets
CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_path text,
  source text NOT NULL DEFAULT 'generated',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Video projects
CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled video',
  mode text NOT NULL CHECK (mode IN ('story','script','prompt')),
  source_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','storyboard','scenes','ready','failed')),
  style text NOT NULL DEFAULT 'storybook',
  language text NOT NULL DEFAULT 'English',
  target_duration_sec integer NOT NULL DEFAULT 60,
  resolution text NOT NULL DEFAULT '720p' CHECK (resolution IN ('720p','1080p')),
  bgm_enabled boolean NOT NULL DEFAULT true,
  bgm_path text,
  final_video_path text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scenes of a video (storyboard + generated assets)
CREATE TABLE public.scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  scene_index integer NOT NULL,
  heading text,
  description text NOT NULL DEFAULT '',
  image_prompt text NOT NULL DEFAULT '',
  narration text NOT NULL DEFAULT '',
  dialogues jsonb NOT NULL DEFAULT '[]'::jsonb,
  emotion text,
  image_path text,
  audio_path text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Which characters appear in which video, with their voice assignment
CREATE TABLE public.video_characters (
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  voice_id text NOT NULL DEFAULT '',
  PRIMARY KEY (video_id, character_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenes TO authenticated;
GRANT ALL ON public.scenes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_characters TO authenticated;
GRANT ALL ON public.video_characters TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "characters_select_own" ON public.characters FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "characters_insert_own" ON public.characters FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "characters_update_own" ON public.characters FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "characters_delete_own" ON public.characters FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "videos_select_own" ON public.videos FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "videos_insert_own" ON public.videos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "videos_update_own" ON public.videos FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "videos_delete_own" ON public.videos FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "scenes_select_own" ON public.scenes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = scenes.video_id AND v.user_id = auth.uid()));
CREATE POLICY "scenes_insert_own" ON public.scenes FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = scenes.video_id AND v.user_id = auth.uid()));
CREATE POLICY "scenes_update_own" ON public.scenes FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = scenes.video_id AND v.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = scenes.video_id AND v.user_id = auth.uid()));
CREATE POLICY "scenes_delete_own" ON public.scenes FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = scenes.video_id AND v.user_id = auth.uid()));

CREATE POLICY "video_characters_select_own" ON public.video_characters FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_characters.video_id AND v.user_id = auth.uid()));
CREATE POLICY "video_characters_insert_own" ON public.video_characters FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_characters.video_id AND v.user_id = auth.uid()));
CREATE POLICY "video_characters_delete_own" ON public.video_characters FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_characters.video_id AND v.user_id = auth.uid()));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage: user-scoped access to private buckets (first path segment = user id)
CREATE POLICY "character_images_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'character-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "character_images_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'character-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "character_images_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'character-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "scene_assets_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'scene-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "scene_assets_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'scene-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "scene_assets_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'scene-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "final_videos_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'final-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "final_videos_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'final-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "final_videos_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'final-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

GRANT ALL ON storage.objects TO service_role;
