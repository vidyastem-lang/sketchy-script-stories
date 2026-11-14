// Client-safe storyboard contract, styles, voices and prompt helpers.

export type VideoMode = "story" | "script" | "prompt";

export const MODE_META: Record<VideoMode, { label: string; blurb: string }> = {
  story: {
    label: "Story to Video",
    blurb: "Paste a story or a rough idea — AI expands it into a full screenplay.",
  },
  script: {
    label: "Script to Video",
    blurb: "Upload or paste a script. Scenes, characters and dialogue are detected automatically.",
  },
  prompt: {
    label: "Prompt to Video",
    blurb: "One line about what you want — AI writes the story and the storyboard.",
  },
};

export interface StylePreset {
  id: string;
  label: string;
  prompt: string;
}

export const ANIMATION_STYLES: StylePreset[] = [
  {
    id: "storybook",
    label: "Storybook",
    prompt:
      "warm hand-painted storybook illustration, soft brush textures, gentle golden lighting, rich colors",
  },
  {
    id: "anime",
    label: "Anime",
    prompt: "vibrant 2D anime style, clean line art, expressive eyes, cinematic color grading",
  },
  {
    id: "cartoon",
    label: "Cartoon",
    prompt: "playful 2D cartoon style, bold outlines, bright saturated colors, exaggerated shapes",
  },
  {
    id: "render3d",
    label: "3D Render",
    prompt:
      "polished stylized 3D render, soft global illumination, appealing rounded character designs, detailed materials",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    prompt: "dreamy watercolor painting, flowing pigment, visible paper texture, luminous washes",
  },
  {
    id: "comic",
    label: "Comic Book",
    prompt: "dynamic comic book art, ink outlines, halftone shading, dramatic contrast",
  },
];

export function stylePrompt(styleId: string): string {
  const style = ANIMATION_STYLES.find((s) => s.id === styleId) ?? ANIMATION_STYLES[0];
  if (!style) throw new Error("No animation styles are configured");
  return style.prompt;
}

export const LANGUAGES = [
  "English",
  "Hindi",
  "Hinglish (Hindi + English)",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Japanese",
  "Mandarin",
  "Arabic",
  "Bengali",
  "Tamil",
  "Telugu",
];

export const LANGUAGE_CODES: Record<string, string> = {
  English: "en-US",
  Hindi: "hi-IN",
  "Hinglish (Hindi + English)": "hi-IN",
  Spanish: "es-ES",
  French: "fr-FR",
  German: "de-DE",
  Portuguese: "pt-BR",
  Japanese: "ja-JP",
  Mandarin: "cmn-CN",
  Arabic: "ar-XA",
  Bengali: "bn-IN",
  Tamil: "ta-IN",
  Telugu: "te-IN",
};

export function languagePrompt(language: string): string {
  if (language === "Hinglish (Hindi + English)") {
    return "Hinglish: natural conversational code-switching between Hindi and English. Write Hindi phrases in Devanagari and English words/phrases in Latin script. Do not translate every line twice or make the speech purely Hindi or purely English.";
  }
  return language;
}

export interface VoiceOption {
  id: string;
  label: string;
}

// Gemini TTS prebuilt voice names.
export const VOICES: VoiceOption[] = [
  { id: "Kore", label: "Kore · warm" },
  { id: "Puck", label: "Puck · bright" },
  { id: "Charon", label: "Charon · deep" },
  { id: "Fenrir", label: "Fenrir · bold" },
  { id: "Aoede", label: "Aoede · breezy" },
  { id: "Zephyr", label: "Zephyr · airy" },
  { id: "Leda", label: "Leda · youthful" },
  { id: "Orus", label: "Orus · steady" },
  { id: "Algieba", label: "Algieba · smooth" },
  { id: "Gacrux", label: "Gacrux · mature" },
];

export const NARRATOR_VOICE = "Kore";

export type Mood = "warm" | "epic" | "playful" | "calm" | "mysterious";

export interface StoryboardCharacter {
  name: string;
  description: string;
  appearance: string;
}

export interface StoryboardDialogue {
  character: string;
  line: string;
  emotion: string;
}

export interface StoryboardScene {
  heading: string;
  description: string;
  imagePrompt: string;
  narration: string;
  dialogues: StoryboardDialogue[];
  emotion: string;
}

export interface StoryboardJson {
  title: string;
  logline: string;
  mood: Mood;
  characters: StoryboardCharacter[];
  scenes: StoryboardScene[];
}

export function sceneCountFor(targetSec: number): number {
  return Math.min(12, Math.max(3, Math.round(targetSec / 8)));
}

export function buildBasicScenes(content: string, count: number): StoryboardScene[] {
  const units = content
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const scenes = Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * units.length) / count);
    const end = Math.floor(((index + 1) * units.length) / count);
    const text =
      units.slice(start, end).join(" ") || content.trim() || "A quiet moment in the story.";
    return {
      heading: `Scene ${index + 1}`,
      description: text,
      imagePrompt: "NO_AI_FALLBACK",
      narration: "",
      dialogues: [],
      emotion: "calm" as Mood,
    };
  });
  return scenes;
}

export function assertStoryboardSceneCount(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(
      `The storyboard returned ${actual} scenes; ${expected} are required for this duration. Please try again.`,
    );
  }
}

const moodEnum = {
  type: "string",
  enum: ["warm", "epic", "playful", "calm", "mysterious"],
} as const;

const characterSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string", description: "Who they are, personality, role in the story" },
    appearance: {
      type: "string",
      description:
        "Detailed visual description: age, hair, clothing, colors, distinguishing features",
    },
  },
  required: ["name", "description", "appearance"],
  additionalProperties: false,
} as const;

const dialogueSchema = {
  type: "object",
  properties: {
    character: { type: "string", description: "Character name exactly as in characters list" },
    line: { type: "string" },
    emotion: { type: "string" },
  },
  required: ["character", "line", "emotion"],
  additionalProperties: false,
} as const;

const sceneSchema = {
  type: "object",
  properties: {
    heading: { type: "string", description: "Short scene title, e.g. 'EXT. MAGICAL FOREST - DAY'" },
    description: { type: "string", description: "What happens in the scene" },
    imagePrompt: {
      type: "string",
      description:
        "Detailed visual prompt for one 16:9 frame: setting, composition, lighting, characters present, action",
    },
    narration: {
      type: "string",
      description: "Voiceover narration for this scene, 1-3 sentences. Empty string if none.",
    },
    dialogues: { type: "array", items: dialogueSchema },
    emotion: moodEnum,
  },
  required: ["heading", "description", "imagePrompt", "narration", "dialogues", "emotion"],
  additionalProperties: false,
} as const;

export const STORYBOARD_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    logline: { type: "string", description: "One-sentence summary" },
    mood: moodEnum,
    characters: { type: "array", items: characterSchema, minItems: 1, maxItems: 6 },
    scenes: { type: "array", items: sceneSchema },
  },
  required: ["title", "logline", "mood", "characters", "scenes"],
  additionalProperties: false,
} as const;

export const STORYBOARD_SYSTEM_PROMPT = `You are a professional animation screenwriter and storyboard artist. You turn stories, scripts and prompts into production-ready animated storyboards.

Rules:
- Divide the content into the requested number of scenes. Pacing should fit the target duration: roughly 6-10 seconds of narration+dialogue per scene.
- Preserve the user's actual topic, named people/places, subject, and key events; do not substitute unrelated generic scenery or invent a different premise.
- Give every scene a concrete, topic-relevant location, background details, time/weather where useful, and visible action. Let scenery and props evolve with the story while maintaining continuity between adjacent scenes.
- Keep character names, appearance and personality perfectly consistent across every scene.
- imagePrompt must describe ONE detailed 16:9 animated-film frame tied to the exact scene: environment/background, foreground props, who is visible, what they are doing, camera framing, lighting and mood. Mention characters by name and repeat defining appearance details when visible. No text, letters or watermarks in the image.
- Every scene needs narration, dialogue, or both. Keep spoken lines short, natural, intelligible, and faithful to the submitted topic; dialogue must be assigned to a listed character.
- Use the requested language for title, narration, dialogues and description; keep character names recognizable.
- For Hinglish, naturally code-switch between Hindi and English; write Hindi phrases in Devanagari and English words/phrases in Latin script. Keep the language conversational, not a line-by-line translation.`;

export function buildStoryboardUserPrompt(input: {
  mode: VideoMode;
  content: string;
  targetDurationSec: number;
  language: string;
  sceneCount: number;
}): string {
  const modeWord =
    input.mode === "script"
      ? "The user provided a complete script — respect its structure, extract scene headings, character names, dialogue lines and actions."
      : input.mode === "story"
        ? "The user provided a story or rough idea — expand it into a complete screenplay."
        : "The user provided only a prompt — invent a compelling story around it.";
  return `MODE: ${modeWord}

CONTENT:
"""
${input.content.slice(0, 12000)}
"""

TARGET DURATION: ${input.targetDurationSec} seconds
LANGUAGE: ${languagePrompt(input.language)}
SCENE COUNT: exactly ${input.sceneCount} scenes

Return the storyboard JSON.`;
}
