import { describe, expect, it } from "vitest";
import { extractScriptText } from "@/lib/script-parse";
import { assertStoryboardSceneCount, sceneCountFor } from "@/lib/storyboard";

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
