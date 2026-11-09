import { describe, expect, it } from "vitest";
import { extractScriptText } from "@/lib/script-parse";
import {
  assertStoryboardSceneCount,
  buildBasicScenes,
  buildStoryboardUserPrompt,
  LANGUAGE_CODES,
  LANGUAGES,
  languagePrompt,
  sceneCountFor,
} from "@/lib/storyboard";

describe("script upload", () => {
  it("reads plain-text scripts", async () => {
    const file = new File(["A short screenplay."], "story.txt", { type: "text/plain" });
    await expect(extractScriptText(file)).resolves.toBe("A short screenplay.");
  });

  it("rejects unsupported file types with an actionable message", async () => {
    const file = new File(["not a script"], "notes.csv", { type: "text/csv" });
    await expect(extractScriptText(file)).rejects.toThrow("Upload a TXT, DOCX or PDF script");
  });
});

describe("storyboard scene count", () => {
  it("derives a bounded scene count from the target duration", () => {
    expect(sceneCountFor(10)).toBe(3);
    expect(sceneCountFor(60)).toBe(8);
    expect(sceneCountFor(240)).toBe(12);
  });

  it("accepts only the requested number of scenes", () => {
    expect(() => assertStoryboardSceneCount(8, 8)).not.toThrow();
    expect(() => assertStoryboardSceneCount(7, 8)).toThrow("returned 7 scenes; 8 are required");
  });
});

describe("Hinglish language support", () => {
  const hinglish = "Hinglish (Hindi + English)";

  it("offers Hinglish and maps speech generation to the Hindi locale", () => {
    expect(LANGUAGES).toContain(hinglish);
    expect(LANGUAGE_CODES[hinglish]).toBe("hi-IN");
  });

  it("asks for natural Hindi-English code-switching in storyboard prompts", () => {
    const languageInstruction = languagePrompt(hinglish);
    const userPrompt = buildStoryboardUserPrompt({
      mode: "story",
      content: "A child meets a friendly robot.",
      targetDurationSec: 30,
      language: hinglish,
      sceneCount: 4,
    });

    expect(languageInstruction).toContain("code-switching between Hindi and English");
    expect(languageInstruction).toContain("Devanagari");
    expect(userPrompt).toContain(languageInstruction);
  });
});

describe("basic no-AI scenes", () => {
  it("splits supplied text into the requested number of renderable text-card scenes", () => {
    const scenes = buildBasicScenes("First event. Second event. Third event.", 3);

    expect(scenes).toHaveLength(3);
    expect(scenes.map((scene) => scene.description)).toEqual([
      "First event.",
      "Second event.",
      "Third event.",
    ]);
    expect(scenes.every((scene) => scene.imagePrompt === "NO_AI_FALLBACK")).toBe(true);
    expect(scenes.every((scene) => scene.dialogues.length === 0 && !scene.narration)).toBe(true);
  });
});
