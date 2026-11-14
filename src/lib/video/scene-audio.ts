export interface DialogueAudioPath {
  audio_path?: string | null | undefined;
}

export function sceneClipPaths(
  narrationPath: string | null,
  dialogues: readonly DialogueAudioPath[],
): string[] {
  return [narrationPath, ...dialogues.map((dialogue) => dialogue.audio_path ?? null)].filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );
}
