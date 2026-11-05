import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateResponse, generateImage, generateSpeech } from "@lovable.dev/ai-gateway";
import "@/ai-gateway.types";
import {
  STORYBOARD_JSON_SCHEMA,
  STORYBOARD_SYSTEM_PROMPT,
  assertStoryboardSceneCount,
  buildStoryboardUserPrompt,
  sceneCountFor,
  stylePrompt,
  LANGUAGE_CODES,
  NARRATOR_VOICE,
  VOICES,
  type StoryboardJson,
} from "./storyboard";

const RESPONSE_MODEL = "openai/gpt-6-astra" as const;
const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst" as const;
const TTS_MODEL = "google/gemini-3.1-flash-tts-preview" as const;
const storyboardResponseSchema = z.object({
  title: z.string().min(1),
  logline: z.string(),
  mood: z.enum(["warm", "epic", "playful", "calm", "mysterious"]),
  characters: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string(),
        appearance: z.string(),
      }),
    )
    .min(1)
    .max(6),
  scenes: z
    .array(
      z.object({
        heading: z.string(),
        description: z.string(),
        imagePrompt: z.string(),
        narration: z.string(),
        dialogues: z.array(
          z.object({ character: z.string(), line: z.string(), emotion: z.string() }),
        ),
        emotion: z.enum(["warm", "epic", "playful", "calm", "mysterious"]),
      }),
    )
    .min(1),
});
const dialogueRowsSchema = z.array(
  z.object({
    character: z.string(),
    line: z.string(),
    emotion: z.string().optional(),
    audio_path: z.string().nullable().optional(),
  }),
);

function extractOutputText(response: unknown): string {
  const out = (response as { output?: unknown[] }).output ?? [];
  const parts: string[] = [];
  for (const item of out) {
    const it = item as { type?: string; content?: unknown[] };
    if (it.type !== "message" || !Array.isArray(it.content)) continue;
    for (const c of it.content) {
      const cc = c as { type?: string; text?: string };
      if (cc.type === "output_text" && typeof cc.text === "string") parts.push(cc.text);
    }
  }
  return parts.join("\n");
}

function parseStoryboard(raw: string, expectedSceneCount: number): StoryboardJson {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "");
  const parsed = storyboardResponseSchema.parse(JSON.parse(cleaned));
  assertStoryboardSceneCount(parsed.scenes.length, expectedSceneCount);
  return parsed as StoryboardJson;
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

interface ImageResult {
  data?: { b64_json?: string }[];
}
async function generateImageBytes(prompt: string, size: string): Promise<Uint8Array> {
  const result = (await generateImage({
    model: IMAGE_MODEL,
    prompt,
    size,
    quality: "medium",
    n: 1,
    output_format: "png",
  })) as ImageResult;
  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no image data");
  return base64ToUint8(b64);
}

async function generateSpeechBytes(text: string, voice: string, language: string): Promise<Blob> {
  const binary = await generateSpeech({
    model: TTS_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        languageCode: LANGUAGE_CODES[language] ?? "en-US",
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  });
  return binary.blob();
}

// ---------------------------------------------------------------------------
// Storyboard
// ---------------------------------------------------------------------------

export const generateStoryboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { videoId: string; replace?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: video, error } = await supabase
      .from("videos")
      .select("*")
      .eq("id", data.videoId)
      .single();
    if (error || !video) throw new Error("Video not found");

    const content = [video.source_text].filter(Boolean).join("\n\n") || video.title;
    const expectedSceneCount = sceneCountFor(video.target_duration_sec);
    const response = await generateResponse({
      model: RESPONSE_MODEL,
      input: [
        { role: "system", content: STORYBOARD_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildStoryboardUserPrompt({
            mode: video.mode as "story" | "script" | "prompt",
            content,
            targetDurationSec: video.target_duration_sec,
            language: video.language,
            sceneCount: expectedSceneCount,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "storyboard",
          strict: true,
          schema: STORYBOARD_JSON_SCHEMA,
        },
      },
    });
    const storyboard = parseStoryboard(extractOutputText(response), expectedSceneCount);

    if (data.replace) {
      const { error: scenesDeleteError } = await supabase
        .from("scenes")
        .delete()
        .eq("video_id", data.videoId);
      if (scenesDeleteError)
        throw new Error("Could not replace the previous scenes: " + scenesDeleteError.message);
      const { error: castDeleteError } = await supabase
        .from("video_characters")
        .delete()
        .eq("video_id", data.videoId);
      if (castDeleteError)
        throw new Error("Could not replace the previous cast: " + castDeleteError.message);
    }

    // Characters: reuse library characters with the same name, else create.
    const { data: existing, error: existingError } = await supabase
      .from("characters")
      .select("id, name")
      .eq("user_id", userId);
    if (existingError)
      throw new Error("Could not load your character library: " + existingError.message);
    const existingByName = new Map((existing ?? []).map((c) => [c.name.toLowerCase(), c.id]));
    const links: { video_id: string; character_id: string; voice_id: string }[] = [];
    for (const [i, c] of storyboard.characters.entries()) {
      let charId = existingByName.get(c.name.toLowerCase());
      const description = [c.description, c.appearance ? `Visual appearance: ${c.appearance}` : ""]
        .filter(Boolean)
        .join("\n");
      if (!charId) {
        const { data: created, error: insErr } = await supabase
          .from("characters")
          .insert({ user_id: userId, name: c.name, description, source: "generated" })
          .select("id")
          .single();
        if (insErr || !created)
          throw new Error(
            "Could not save storyboard character: " + (insErr?.message ?? "No character returned"),
          );
        charId = created.id;
      } else {
        const { error: updateCharacterError } = await supabase
          .from("characters")
          .update({ description })
          .eq("id", charId);
        if (updateCharacterError)
          throw new Error("Could not update storyboard character: " + updateCharacterError.message);
      }
      links.push({
        video_id: data.videoId,
        character_id: charId,
        voice_id: (() => {
          const voice = VOICES[i % VOICES.length];
          if (!voice) throw new Error("No voice options are configured");
          return voice.id;
        })(),
      });
    }
    if (links.length > 0) {
      const { error: castError } = await supabase
        .from("video_characters")
        .upsert(links, { onConflict: "video_id,character_id" });
      if (castError) throw new Error("Failed to save the cast: " + castError.message);
    }

    const sceneRows = storyboard.scenes.map((s, i) => ({
      video_id: data.videoId,
      scene_index: i,
      heading: s.heading,
      description: s.description,
      image_prompt: s.imagePrompt,
      narration: s.narration ?? "",
      dialogues: (s.dialogues ?? []).map((d) => ({
        character: d.character,
        line: d.line,
        emotion: d.emotion,
        audio_path: null,
      })),
      emotion: s.emotion ?? "calm",
    }));
    const { error: sceneErr } = await supabase.from("scenes").insert(sceneRows);
    if (sceneErr) throw new Error("Failed to save scenes: " + sceneErr.message);

    const { error: videoUpdateError } = await supabase
      .from("videos")
      .update({
        title: storyboard.title || video.title,
        status: "storyboard",
        final_video_path: null,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.videoId);
    if (videoUpdateError)
      throw new Error(
        "Scenes were saved, but the video status could not be updated: " + videoUpdateError.message,
      );

    return {
      title: storyboard.title,
      sceneCount: storyboard.scenes.length,
      characterCount: storyboard.characters.length,
      logline: storyboard.logline,
      mood: storyboard.mood,
    };
  });

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export const generateCharacterArt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { characterId: string; style: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: character, error } = await supabase
      .from("characters")
      .select("*")
      .eq("id", data.characterId)
      .single();
    if (error || !character) throw new Error("Character not found");

    const prompt = `Character design sheet of "${character.name}": ${character.description}. Style: ${stylePrompt(data.style)}. Full body, centered composition, plain soft background, consistent clean character design, no text or labels.`;
    const bytes = await generateImageBytes(prompt, "1024x1536");

    const path = `${userId}/${character.id}.png`;
    const { error: upErr } = await supabase.storage
      .from("character-images")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error("Failed to save character art: " + upErr.message);

    const { error: characterUpdateError } = await supabase
      .from("characters")
      .update({ image_path: path })
      .eq("id", character.id);
    if (characterUpdateError)
      throw new Error(
        "Character art was uploaded but could not be linked: " + characterUpdateError.message,
      );
    return { image_path: path };
  });

export const generateSceneArt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sceneId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: scene, error } = await supabase
      .from("scenes")
      .select("*, videos!inner(id, style, user_id)")
      .eq("id", data.sceneId)
      .single();
    if (error || !scene) throw new Error("Scene not found");
    const video = scene.videos as { id: string; style: string; user_id: string };

    const { data: casts, error: castsError } = await supabase
      .from("video_characters")
      .select("voice_id, characters(name, description)")
      .eq("video_id", video.id);
    if (castsError) throw new Error("Could not load the cast for scene art: " + castsError.message);
    const castLine = (casts ?? [])
      .map((c) => {
        const ch = c.characters as { name: string; description: string } | null;
        return ch ? `${ch.name} (${ch.description})` : "";
      })
      .filter(Boolean)
      .join("; ");

    const prompt = `${stylePrompt(video.style)}. One cinematic 16:9 animated scene frame. Scene: ${scene.description}. Visual direction: ${scene.image_prompt}. Characters in this story: ${castLine || "none specified"}. Keep character designs consistent with their descriptions. No text, letters or watermarks.`;
    const bytes = await generateImageBytes(prompt, "1536x1024");

    const path = `${userId}/${video.id}/scene-${scene.scene_index}.png`;
    const { error: upErr } = await supabase.storage
      .from("scene-assets")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error("Failed to save scene art: " + upErr.message);

    const { error: sceneUpdateError } = await supabase
      .from("scenes")
      .update({ image_path: path })
      .eq("id", scene.id);
    if (sceneUpdateError)
      throw new Error(
        "Scene art was uploaded but could not be linked: " + sceneUpdateError.message,
      );
    const { error: videoUpdateError } = await supabase
      .from("videos")
      .update({ status: "scenes", final_video_path: null, updated_at: new Date().toISOString() })
      .eq("id", video.id);
    if (videoUpdateError)
      throw new Error(
        "Scene art was saved, but the video status could not be updated: " +
          videoUpdateError.message,
      );
    return { image_path: path };
  });

// ---------------------------------------------------------------------------
// Voiceover
// ---------------------------------------------------------------------------

export const generateSceneVoiceover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sceneId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: scene, error } = await supabase
      .from("scenes")
      .select("*, videos!inner(id, language, user_id)")
      .eq("id", data.sceneId)
      .single();
    if (error || !scene) throw new Error("Scene not found");
    const video = scene.videos as { id: string; language: string };

    const { data: casts, error: castsError } = await supabase
      .from("video_characters")
      .select("voice_id, characters(name)")
      .eq("video_id", video.id);
    if (castsError) throw new Error("Could not load voice assignments: " + castsError.message);
    const voiceByName = new Map(
      (casts ?? []).map((c) => {
        const ch = c.characters as { name: string } | null;
        return [ch?.name.toLowerCase() ?? "", c.voice_id || NARRATOR_VOICE];
      }),
    );

    type Clip = { text: string; voice: string; kind: "narration" | "dialogue" };
    const dialogues = dialogueRowsSchema.parse(scene.dialogues ?? []);
    const clips: Clip[] = [];
    if (scene.narration?.trim())
      clips.push({ text: scene.narration.trim(), voice: NARRATOR_VOICE, kind: "narration" });
    for (const d of dialogues) {
      if (d.line?.trim())
        clips.push({
          text: d.line.trim(),
          voice: voiceByName.get(d.character.toLowerCase()) ?? NARRATOR_VOICE,
          kind: "dialogue",
        });
    }
    if (clips.length === 0) {
      const clearedDialogues = dialogues.map((d) => ({ ...d, audio_path: null }));
      const { error: clearError } = await supabase
        .from("scenes")
        .update({ audio_path: null, dialogues: clearedDialogues })
        .eq("id", scene.id);
      if (clearError)
        throw new Error("Could not clear stale voiceover audio: " + clearError.message);
      const { error: videoUpdateError } = await supabase
        .from("videos")
        .update({ status: "scenes", final_video_path: null, updated_at: new Date().toISOString() })
        .eq("id", video.id);
      if (videoUpdateError)
        throw new Error(
          "Voiceover was cleared, but the video status could not be updated: " +
            videoUpdateError.message,
        );
      return { audio_path: null, dialogueAudio: {} };
    }

    const base = `${userId}/${video.id}`;
    const dialogueAudio: Record<string, string> = {};
    let narrationPath: string | null = null;

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (!clip) throw new Error("Voiceover clip indexing failed");
      const blob = await generateSpeechBytes(clip.text, clip.voice, video.language);
      const name =
        clip.kind === "narration"
          ? `audio-${scene.scene_index}-narration.mp3`
          : `audio-${scene.scene_index}-d${i}.mp3`;
      const path = `${base}/${name}`;
      const { error: upErr } = await supabase.storage
        .from("scene-assets")
        .upload(path, blob, { contentType: "audio/mpeg", upsert: true });
      if (upErr) throw new Error("Failed to save audio: " + upErr.message);
      if (clip.kind === "narration") narrationPath = path;
      else dialogueAudio[String(i)] = path;
    }

    // dialogue keys above are clip indexes (including narration at 0) — map back to dialogue indexes.
    const dialogueAudioByIndex: Record<string, string> = {};
    let dialogueIdx = 0;
    let clipIdx = 0;
    for (const clip of clips) {
      if (clip.kind === "dialogue") {
        const stored = dialogueAudio[String(clipIdx)];
        if (stored) dialogueAudioByIndex[String(dialogueIdx)] = stored;
        dialogueIdx++;
      }
      clipIdx++;
    }

    const updatedDialogues = dialogues.map((d, i) => ({
      ...d,
      audio_path: dialogueAudioByIndex[String(i)] ?? null,
    }));
    const { error: sceneUpdateError } = await supabase
      .from("scenes")
      .update({ audio_path: narrationPath, dialogues: updatedDialogues })
      .eq("id", scene.id);
    if (sceneUpdateError)
      throw new Error(
        "Voiceover was generated but could not be linked to the scene: " + sceneUpdateError.message,
      );
    const { error: videoUpdateError } = await supabase
      .from("videos")
      .update({ status: "scenes", final_video_path: null, updated_at: new Date().toISOString() })
      .eq("id", video.id);
    if (videoUpdateError)
      throw new Error(
        "Voiceover was saved, but the video status could not be updated: " +
          videoUpdateError.message,
      );

    return { audio_path: narrationPath, dialogueAudio: dialogueAudioByIndex };
  });
