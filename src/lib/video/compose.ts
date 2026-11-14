// Browser-only video composition pipeline (ffmpeg.wasm + procedural background
// music). Import dynamically from event handlers — never into the SSR graph.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Mood } from "@/lib/storyboard";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

export interface ComposeSceneInput {
  sceneIndex: number;
  imagePath: string | null;
  heading?: string | null;
  description?: string;
  videoPath?: string | null;
  clipPaths: string[]; // narration first, then dialogue clips in order
}

export interface ComposeOptions {
  resolution: "720p" | "1080p";
  bgmEnabled: boolean;
  mood: Mood;
  onProgress?: (ratio: number, label: string) => void;
}

export interface ComposeResult {
  blob: Blob;
  durationSec: number;
  width: number;
  height: number;
}

const FPS = 24;

async function loadFFmpeg(onProgress?: (r: number, l: string) => void): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    if (Number.isFinite(progress))
      onProgress?.(0.05 + 0.9 * Math.min(1, Math.max(0, progress)), "Encoding video");
  });
  try {
    // Use a real ESM URL: the worker must dynamically import the module core.
    // A blob URL made from the UMD core has no ESM default export and fails here.
    // Let Vite bundle FFmpeg's own worker module (no external blob worker URL).
    await ffmpeg.load({
      coreURL: `${CORE_BASE}/ffmpeg-core.js`,
      wasmURL: `${CORE_BASE}/ffmpeg-core.wasm`,
    });
    return ffmpeg;
  } catch (error) {
    ffmpeg.terminate();
    throw error;
  }
}

async function downloadAsset(
  supabase: SupabaseClient<Database>,
  bucket: string,
  path: string,
): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data)
    throw new Error(`Could not download ${bucket}/${path}: ${error?.message ?? "Asset not found"}`);
  return data;
}

function placeholderImage(
  index: number,
  heading?: string | null,
  description?: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, "#1b1f3a");
  g.addColorStop(1, "#2c3f66");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(240, 200, 120, 0.85)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 70px Manrope, sans-serif";
  ctx.fillText((heading || `Scene ${index + 1}`).slice(0, 48), canvas.width / 2, 340);
  if (description?.trim()) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.font = "400 38px Manrope, sans-serif";
    const words = description.trim().split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > canvas.width * 0.78 && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
      if (lines.length >= 5) break;
    }
    if (line && lines.length < 5) lines.push(line);
    lines.forEach((text, lineIndex) => ctx.fillText(text, canvas.width / 2, 445 + lineIndex * 54));
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

async function measureAudio(blob: Blob): Promise<number> {
  const ctx = new (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  )();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buf.duration;
  } finally {
    void ctx.close();
  }
}

async function measureVideo(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read the generated scene video duration"));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error("The generated scene video has no valid duration");
    return video.duration;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Procedural background music (Web Audio) — warm pads + soft arpeggios.
// ---------------------------------------------------------------------------

const MOODS: Record<string, { root: number; chords: number[][]; step: number; padLevel: number }> =
  {
    warm: {
      root: 261.63,
      chords: [
        [0, 4, 7],
        [-5, 0, 4],
        [-3, 2, 5],
        [2, 5, 9],
      ],
      step: 0.5,
      padLevel: 0.11,
    },
    epic: {
      root: 293.66,
      chords: [
        [0, 3, 7],
        [-2, 3, 7],
        [-4, 0, 5],
        [-5, 2, 7],
      ],
      step: 0.4,
      padLevel: 0.13,
    },
    playful: {
      root: 392.0,
      chords: [
        [0, 4, 9],
        [2, 5, 9],
        [-3, 0, 4],
        [-1, 2, 7],
      ],
      step: 0.25,
      padLevel: 0.09,
    },
    calm: {
      root: 220.0,
      chords: [
        [0, 4, 7, 11],
        [-5, 0, 4, 9],
        [-7, 0, 5],
        [-3, 2, 7],
      ],
      step: 0.75,
      padLevel: 0.12,
    },
    mysterious: {
      root: 164.81,
      chords: [
        [0, 3, 7, 10],
        [-2, 3, 8],
        [-4, 1, 5],
        [-5, 3, 6],
      ],
      step: 0.6,
      padLevel: 0.13,
    },
  };

function encodeWav(buffer: AudioBuffer): Uint8Array {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const bytes = 44 + len * numCh * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const channel = chans[c];
      if (!channel) throw new Error("Could not read generated background audio");
      const v = Math.max(-1, Math.min(1, channel[i] ?? 0));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Uint8Array(view.buffer);
}

export async function generateBgm(mood: Mood, durationSec: number): Promise<Uint8Array> {
  const conf = MOODS[mood] ?? MOODS["warm"];
  if (!conf || conf.chords.length === 0)
    throw new Error("Background music configuration is incomplete");
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * durationSec), sr);
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  const chordLen = 4;
  let ci = 0;
  for (let t = 0; t < durationSec - 0.5; t += chordLen, ci++) {
    const chord = conf.chords[ci % conf.chords.length];
    if (!chord) throw new Error("Background music chord configuration is incomplete");
    chord.forEach((semi, j) => {
      const osc = ctx.createOscillator();
      osc.type = j === 0 ? "sine" : "triangle";
      osc.frequency.value = conf.root * Math.pow(2, semi / 12);
      osc.detune.value = (j - 1) * 5;
      const g = ctx.createGain();
      const t1 = Math.min(t + chordLen + 1.2, durationSec);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(conf.padLevel / chord.length, t + 1.3);
      g.gain.setValueAtTime(conf.padLevel / chord.length, Math.max(t + 1.3, t1 - 1.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t1 + 0.05);
    });
  }

  for (let t = 0.6; t < durationSec - 0.4; t += conf.step) {
    const chord = conf.chords[Math.floor(t / chordLen) % conf.chords.length];
    if (!chord || chord.length === 0)
      throw new Error("Background music chord configuration is incomplete");
    const chordNote = chord[Math.floor(t / conf.step) % chord.length];
    if (chordNote === undefined)
      throw new Error("Background music note configuration is incomplete");
    const semi = chordNote + 12;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = conf.root * Math.pow(2, semi / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.3, conf.step * 1.4));
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + conf.step * 1.6 + 0.2);
  }

  return encodeWav(await ctx.startRendering());
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export async function composeVideo(
  supabase: SupabaseClient<Database>,
  videoId: string,
  scenes: ComposeSceneInput[],
  opts: ComposeOptions,
): Promise<ComposeResult> {
  const W = opts.resolution === "1080p" ? 1920 : 1280;
  const H = opts.resolution === "1080p" ? 1080 : 720;
  const scenesSorted = [...scenes].sort((a, b) => a.sceneIndex - b.sceneIndex);
  if (scenesSorted.length === 0) throw new Error("There are no scenes to export");
  const report = (r: number, l: string) => opts.onProgress?.(r, l);

  report(0.01, "Downloading animated scenes");
  const imageFiles: { name: string; bytes: Uint8Array; sceneIdx: number }[] = [];
  const animationFiles: {
    name: string;
    bytes: Uint8Array;
    sceneIdx: number;
    dur: number;
  }[] = [];
  const animationDurationByScene: (number | null)[] = scenesSorted.map(() => null);
  for (let i = 0; i < scenesSorted.length; i++) {
    const scene = scenesSorted[i];
    if (!scene) throw new Error("Scene ordering is incomplete");
    if (scene.videoPath) {
      const blob = await downloadAsset(supabase, "scene-assets", scene.videoPath);
      const dur = await measureVideo(blob);
      animationDurationByScene[i] = dur;
      animationFiles.push({
        name: `motion${i}.mp4`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        sceneIdx: i,
        dur,
      });
    } else {
      const blob = scene.imagePath
        ? await downloadAsset(supabase, "scene-assets", scene.imagePath)
        : await placeholderImage(scene.sceneIndex, scene.heading, scene.description);
      imageFiles.push({
        name: `scene${i}.png`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        sceneIdx: i,
      });
    }
  }

  report(0.06, "Preparing synchronized scene audio");
  // Gather audio clips with durations
  const clipFiles: { name: string; bytes: Uint8Array; sceneIdx: number; dur: number }[] = [];
  let clipCounter = 0;
  const sceneClips: number[][] = scenesSorted.map(() => []);
  for (let i = 0; i < scenesSorted.length; i++) {
    const scene = scenesSorted[i];
    const clipIndexes = sceneClips[i];
    if (!scene || !clipIndexes) throw new Error("Scene audio data is incomplete");
    for (const p of scene.clipPaths) {
      const blob = await downloadAsset(supabase, "scene-assets", p);
      const dur = await measureAudio(blob);
      const k = clipCounter++;
      clipFiles.push({
        name: `clip${k}.mp3`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        sceneIdx: i,
        dur,
      });
      clipIndexes.push(k);
    }
  }

  // Scene durations & timeline. Animation audio supplies ambience; narration and
  // dialogue are separate voice tracks and must fit within their scene.
  const sceneDur: number[] = scenesSorted.map((_, i) => {
    const indexes = sceneClips[i];
    if (!indexes) throw new Error("Scene audio timeline is incomplete");
    const total = indexes.reduce((acc, k) => {
      const clip = clipFiles[k];
      if (!clip) throw new Error("Scene audio clip is missing from the timeline");
      return acc + clip.dur;
    }, 0);
    const animatedDuration = animationDurationByScene[i];
    return Math.min(
      30,
      Math.max(3, animatedDuration ?? 0, indexes.length > 0 ? total + 0.9 : 4.5),
    );
  });
  const sceneStart: number[] = [];
  let cursor = 0;
  for (const d of sceneDur) {
    sceneStart.push(cursor);
    cursor += d;
  }
  const totalSec = cursor;

  // Background music
  const bgm = opts.bgmEnabled ? await generateBgm(opts.mood, totalSec) : null;

  const ffmpeg = await loadFFmpeg((r, l) => report(r, l));
  const encoderLogs: string[] = [];
  ffmpeg.on("log", ({ message }) => {
    const line = message.trim();
    if (!line) return;
    encoderLogs.push(line);
    if (encoderLogs.length > 50) encoderLogs.shift();
  });

  try {
    report(0.12, "Preparing encoder");
    for (const f of imageFiles) await ffmpeg.writeFile(f.name, f.bytes);
    for (const f of animationFiles) await ffmpeg.writeFile(f.name, f.bytes);
    for (const f of clipFiles) await ffmpeg.writeFile(f.name, f.bytes);
    if (bgm) await ffmpeg.writeFile("bgm.wav", bgm);

    // Add one FFmpeg input for every image, animated scene, voice clip, then music.
    const args: string[] = ["-y"];
    for (const file of imageFiles) {
      const duration = sceneDur[file.sceneIdx];
      if (duration === undefined) throw new Error("Scene duration is missing from the timeline");
      args.push(
        "-loop",
        "1",
        "-framerate",
        String(FPS),
        "-t",
        duration.toFixed(3),
        "-i",
        file.name,
      );
    }
    for (const file of animationFiles) args.push("-i", file.name);
    for (const file of clipFiles) args.push("-i", file.name);
    if (bgm) args.push("-i", "bgm.wav");

    // Build normalized video and audio filter graphs using explicit input indexes.
    const IW = Math.round(W * 1.35);
    const IH = Math.round(H * 1.35);
    const parts: string[] = [];
    const vLabels: string[] = [];
    scenesSorted.forEach((_, i) => {
      const duration = sceneDur[i];
      if (duration === undefined) throw new Error("Scene duration is missing from the timeline");
      const animationFileIndex = animationFiles.findIndex((file) => file.sceneIdx === i);
      if (animationFileIndex >= 0) {
        const inputIndex = imageFiles.length + animationFileIndex;
        parts.push(
          `[${inputIndex}:v]fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,tpad=stop_mode=clone:stop_duration=${duration.toFixed(3)},trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
        );
        vLabels.push(`[v${i}]`);
        return;
      }
      const imageFileIndex = imageFiles.findIndex((file) => file.sceneIdx === i);
      if (imageFileIndex < 0)
        throw new Error("A scene has neither an animated clip nor a fallback image");
      const frames = Math.max(1, Math.round(duration * FPS));
      const rate = (0.22 / frames).toFixed(6);
      let motion: string;
      switch (i % 3) {
        case 0:
          motion = `z='min(1+${rate}*on,1.22)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
          break;
        case 1:
          motion = `z='1.18':x='(iw-iw/zoom)*min(1\\,on/${frames})':y='ih/2-(ih/zoom/2)'`;
          break;
        default:
          motion = `z='max(1.22-${rate}*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
      }
      parts.push(
        `[${imageFileIndex}:v]scale=${IW}:${IH}:force_original_aspect_ratio=increase,crop=${IW}:${IH},zoompan=${motion}:d=1:s=${W}x${H}:fps=${FPS},setsar=1[v${i}]`,
      );
      vLabels.push(`[v${i}]`);
    });
    parts.push(
      `${vLabels.join("")}concat=n=${scenesSorted.length}:v=1:a=0[vcat]`,
      `[vcat]fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, totalSec - 1.2).toFixed(2)}:d=1.2,format=yuv420p[vout]`,
    );

    // Audio chain
    const aLabels: string[] = [];
    clipFiles.forEach((f, k) => {
      const start = sceneStart[f.sceneIdx];
      const sceneClipIndexes = sceneClips[f.sceneIdx];
      const duration = sceneDur[f.sceneIdx];
      if (start === undefined || !sceneClipIndexes || duration === undefined) {
        throw new Error("Voiceover clip has no matching scene timeline");
      }
      const clipPosition = sceneClipIndexes.indexOf(k);
      if (clipPosition < 0) throw new Error("Voiceover clip is missing from its scene timeline");
      const precedingDuration = sceneClipIndexes.slice(0, clipPosition).reduce((sum, clipIndex) => {
        const precedingClip = clipFiles[clipIndex];
        if (!precedingClip) throw new Error("A preceding voiceover clip is missing");
        return sum + precedingClip.dur;
      }, 0);
      const delayMs = Math.round((start + 0.35 + precedingDuration) * 1000);
      parts.push(
        `[${imageFiles.length + animationFiles.length + k}:a]aresample=44100,adelay=${delayMs}:all=1,apad=whole_dur=${duration.toFixed(3)}[a${k}]`,
      );
      aLabels.push(`[a${k}]`);
    });
    let bgmIdx = -1;
    if (bgm) {
      bgmIdx = imageFiles.length + animationFiles.length + clipFiles.length;
      parts.push(`[${bgmIdx}:a]volume=0.16[abgm]`);
      aLabels.push("[abgm]");
    }
    if (aLabels.length === 0) {
      // Silent audio fallback (lavfi source inside the filter graph)
      parts.push(`anullsrc=r=44100:cl=stereo,atrim=0:${totalSec.toFixed(2)}[aout]`);
    } else {
      parts.push(
        `${aLabels.join("")}amix=inputs=${aLabels.length}:duration=longest:normalize=0,atrim=0:${totalSec.toFixed(2)}[aout]`,
      );
    }

    args.push("-filter_complex", parts.join(";"), "-map", "[vout]", "-map", "[aout]");

    report(0.15, "Encoding video");
    const diagnostics = () =>
      encoderLogs
        .filter((line) => /error|failed|invalid|not found|unable|cannot/i.test(line))
        .slice(-4)
        .join(" | ")
        .slice(0, 360);
    let exitCode: number;
    try {
      exitCode = await ffmpeg.exec([
        ...args,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "24",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        "out.mp4",
      ]);
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "unknown encoder error";
      const log = diagnostics();
      throw new Error(`The video encoder stopped unexpectedly: ${reason}${log ? ` — ${log}` : ""}`);
    }
    if (exitCode !== 0) {
      const log = diagnostics();
      throw new Error(
        `FFmpeg could not encode the video (exit code ${exitCode}).${log ? ` ${log}` : ""}`,
      );
    }

    report(0.97, "Finalizing");
    const data = await ffmpeg.readFile("out.mp4");
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "video/mp4" });
    return { blob, durationSec: totalSec, width: W, height: H };
  } finally {
    ffmpeg.terminate();
  }
}
