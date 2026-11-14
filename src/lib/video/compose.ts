// Browser-only video composition pipeline (ffmpeg.wasm + procedural background
// music). Import dynamically from event handlers — never into the SSR graph.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Mood } from "@/lib/storyboard";
import { calculateSceneTimeline } from "@/lib/video/timeline";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

export interface ComposeSceneInput {
  sceneIndex: number;
  imagePath: string | null;
  heading?: string | null;
  description?: string;
  videoPath?: string | null;
  topicImageSearch?: boolean;
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
const SCENE_TRANSITION_SECONDS = 0.45;

interface TopicPhoto {
  blob: Blob;
  attribution: string;
}

interface OpenverseImageResult {
  title?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  mature?: boolean;
}

const topicPhotoCache = new Map<string, Promise<TopicPhoto | null>>();

function findTopicPhoto(query: string): Promise<TopicPhoto | null> {
  const normalizedQuery = query.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!normalizedQuery) return Promise.resolve(null);
  const cached = topicPhotoCache.get(normalizedQuery);
  if (cached) return cached;

  const request = (async (): Promise<TopicPhoto | null> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const endpoint = new URL("https://api.openverse.org/v1/images/");
      endpoint.searchParams.set("q", normalizedQuery);
      endpoint.searchParams.set("page_size", "6");
      endpoint.searchParams.set("license", "cc0,pdm,by");
      endpoint.searchParams.set("mature", "false");
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { results?: OpenverseImageResult[] };
      const candidate = (payload.results ?? [])
        .filter(
          (item) =>
            item.mature !== true &&
            typeof item.thumbnail === "string" &&
            typeof item.license === "string" &&
            ["cc0", "pdm", "by"].includes(item.license) &&
            typeof item.license_url === "string",
        )
        .sort((a, b) => {
          const aspectA = Math.abs((a.width ?? 1) / Math.max(a.height ?? 1, 1) - 16 / 9);
          const aspectB = Math.abs((b.width ?? 1) / Math.max(b.height ?? 1, 1) - 16 / 9);
          return aspectA - aspectB;
        })[0];
      if (!candidate?.thumbnail) return null;

      const thumbnailUrl = new URL(candidate.thumbnail);
      if (thumbnailUrl.protocol !== "https:" || thumbnailUrl.hostname !== "api.openverse.org")
        return null;
      const imageResponse = await fetch(thumbnailUrl, {
        credentials: "omit",
        signal: controller.signal,
      });
      if (!imageResponse.ok) return null;
      const blob = await imageResponse.blob();
      if (!blob.type.startsWith("image/") || blob.size > 1_500_000) return null;

      const sourceHost = candidate.foreign_landing_url
        ? new URL(candidate.foreign_landing_url).hostname
        : "Openverse";
      const licenseCode = candidate.license ?? "cc0";
      const license = `${licenseCode.toUpperCase()}${candidate.license_version ? ` ${candidate.license_version}` : ""}`;
      const attribution = `Photo: “${candidate.title || "Untitled"}” by ${candidate.creator || "creator unknown"} · ${license} · ${sourceHost} · ${candidate.license_url}`;
      return { blob, attribution };
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  topicPhotoCache.set(normalizedQuery, request);
  void request.then((photo) => {
    if (!photo) topicPhotoCache.delete(normalizedQuery);
  });
  return request;
}

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

async function placeholderImage(
  index: number,
  heading?: string | null,
  description?: string,
  totalScenes = index + 1,
  photo?: TopicPhoto | null,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 864;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare a basic scene card");

  const palettes = [
    ["#111827", "#263b5a", "#f4bd70"],
    ["#142b36", "#27505a", "#79d2c1"],
    ["#241d3d", "#45396c", "#d9a7ff"],
    ["#2c2020", "#634033", "#ffc17c"],
    ["#102a43", "#28527a", "#86c5ff"],
    ["#263226", "#465942", "#d4dc91"],
  ];
  const palette = palettes[index % palettes.length] ?? palettes[0]!;
  if (photo) {
    const bitmap = await createImageBitmap(photo.blob);
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    ctx.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    bitmap.close();
    const overlay = ctx.createLinearGradient(0, 0, canvas.width, 0);
    overlay.addColorStop(0, "rgba(10,15,29,0.94)");
    overlay.addColorStop(0.58, "rgba(10,15,29,0.72)");
    overlay.addColorStop(1, "rgba(10,15,29,0.28)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    background.addColorStop(0, palette[0]!);
    background.addColorStop(1, palette[1]!);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const glow = ctx.createRadialGradient(1220, 170, 20, 1220, 170, 720);
  glow.addColorStop(0, `${palette[2]}44`);
  glow.addColorStop(1, `${palette[2]}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(500, 0, 1036, 760);

  // Layered abstract scenery adds depth without external assets or AI calls.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = palette[2]!;
  ctx.lineWidth = 2;
  for (let ring = 0; ring < 6; ring++) {
    ctx.beginPath();
    ctx.arc(1240, 430, 120 + ring * 82, -1.2, 1.35);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = palette[2]!;
  for (let dot = 0; dot < 28; dot++) {
    const x = 980 + ((dot * 137) % 500);
    const y = 90 + ((dot * 83) % 590);
    ctx.beginPath();
    ctx.arc(x, y, dot % 4 === 0 ? 4 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const left = 148;
  const right = 1110;
  ctx.fillStyle = palette[2]!;
  ctx.fillRect(left, 136, 7, 524);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette[2]!;
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText(`STORYREEL  /  SCENE ${String(index + 1).padStart(2, "0")}`, left + 38, 150);

  const wrap = (text: string, font: string, maxWidth: number, maxLines: number) => {
    ctx.font = font;
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    let truncated = false;
    for (const [wordIndex, word] of words.entries()) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length === maxLines && wordIndex < words.length - 1) {
          truncated = true;
          break;
        }
      } else {
        line = candidate;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (truncated && lines.length > 0) {
      const last = lines.length - 1;
      const current = lines[last] ?? "";
      let clipped = current;
      while (clipped && ctx.measureText(`${clipped}…`).width > maxWidth)
        clipped = clipped.slice(0, -1);
      lines[last] = `${clipped}…`;
    }
    return lines;
  };

  const title = (heading || `Scene ${index + 1}`).trim();
  const titleFont = "700 76px system-ui, sans-serif";
  const titleLines = wrap(title, titleFont, right - left - 88, 2);
  ctx.font = titleFont;
  ctx.fillStyle = "#fffaf0";
  titleLines.forEach((line, lineIndex) => ctx.fillText(line, left + 38, 260 + lineIndex * 92));

  const descriptionLines = wrap(
    description || "A new moment in the story unfolds.",
    "400 36px system-ui, sans-serif",
    right - left - 104,
    4,
  );
  ctx.font = "400 36px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255, 250, 240, 0.82)";
  const descriptionY = 400 + Math.max(0, titleLines.length - 1) * 84;
  descriptionLines.forEach((line, lineIndex) =>
    ctx.fillText(line, left + 40, descriptionY + lineIndex * 55),
  );

  if (photo) {
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(left + 28, 662, 1260, 48);
    ctx.font = "500 14px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.84)";
    const creditLines = wrap(photo.attribution, "500 14px system-ui, sans-serif", 1230, 2);
    creditLines.forEach((line, lineIndex) => ctx.fillText(line, left + 38, 675 + lineIndex * 16));
  }

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(left + 38, 722, 1240, 2);
  ctx.fillStyle = palette[2]!;
  ctx.fillRect(left + 38, 722, (1240 * (index + 1)) / Math.max(totalScenes, 1), 4);
  ctx.fillStyle = "rgba(255,255,255,0.64)";
  ctx.font = "500 20px system-ui, sans-serif";
  ctx.fillText("A story told one scene at a time", left + 38, 780);
  ctx.textAlign = "right";
  ctx.fillText(String(index + 1).padStart(2, "0"), 1378, 780);

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

  report(0.01, "Preparing scene visuals");
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
      let topicPhoto: TopicPhoto | null = null;
      if (!scene.imagePath && scene.topicImageSearch) {
        report(
          0.02 + (0.035 * i) / scenesSorted.length,
          `Finding a topic picture · scene ${i + 1} of ${scenesSorted.length}`,
        );
        topicPhoto = await findTopicPhoto(`${scene.heading ?? ""} ${scene.description ?? ""}`);
      }
      const blob = scene.imagePath
        ? await downloadAsset(supabase, "scene-assets", scene.imagePath)
        : await placeholderImage(
            scene.sceneIndex,
            scene.heading,
            scene.description,
            scenesSorted.length,
            topicPhoto,
          );
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
    return Math.min(30, Math.max(3, animatedDuration ?? 0, indexes.length > 0 ? total + 0.9 : 4.5));
  });
  const timeline = calculateSceneTimeline(sceneDur, SCENE_TRANSITION_SECONDS);
  const sceneStart = timeline.starts;
  const transitionDuration = timeline.transitionDuration;
  const totalSec = timeline.totalDuration;

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
    const IW = Math.round(W * 1.06);
    const IH = Math.round(H * 1.06);
    const parts: string[] = [];
    const vLabels: string[] = [];
    scenesSorted.forEach((_, i) => {
      const duration = sceneDur[i];
      if (duration === undefined) throw new Error("Scene duration is missing from the timeline");
      const animationFileIndex = animationFiles.findIndex((file) => file.sceneIdx === i);
      if (animationFileIndex >= 0) {
        const inputIndex = imageFiles.length + animationFileIndex;
        parts.push(
          `[${inputIndex}:v]fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p,settb=AVTB,tpad=stop_mode=clone:stop_duration=${duration.toFixed(3)},trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
        );
        vLabels.push(`[v${i}]`);
        return;
      }
      const imageFileIndex = imageFiles.findIndex((file) => file.sceneIdx === i);
      if (imageFileIndex < 0)
        throw new Error("A scene has neither an animated clip nor a fallback image");
      const frames = Math.max(1, Math.round(duration * FPS));
      const rate = (0.08 / frames).toFixed(6);
      let motion: string;
      switch (i % 4) {
        case 0:
          motion = `z='min(1+${rate}*on,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
          break;
        case 1:
          motion = `z='1.08':x='(iw-iw/zoom)*min(1\\,on/${frames})':y='ih/2-(ih/zoom/2)'`;
          break;
        case 2:
          motion = `z='max(1.08-${rate}*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
          break;
        default:
          motion = `z='1.06':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*min(1\\,on/${frames})'`;
      }
      parts.push(
        `[${imageFileIndex}:v]scale=${IW}:${IH}:force_original_aspect_ratio=increase,crop=${IW}:${IH},zoompan=${motion}:d=1:s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS,trim=duration=${duration.toFixed(3)}[v${i}]`,
      );
      vLabels.push(`[v${i}]`);
    });
    let combinedVideo = vLabels[0];
    let combinedDuration = sceneDur[0];
    if (!combinedVideo || combinedDuration === undefined)
      throw new Error("The video timeline has no first scene");
    const transitionStyles = ["fade", "smoothleft", "wipeleft", "circleopen"];
    for (let index = 1; index < vLabels.length; index++) {
      const nextVideo = vLabels[index];
      const nextDuration = sceneDur[index];
      if (!nextVideo || nextDuration === undefined)
        throw new Error("A video scene is missing from the transition timeline");
      const outputLabel = index === vLabels.length - 1 ? "vcat" : `vx${index}`;
      const style = transitionStyles[(index - 1) % transitionStyles.length] ?? "fade";
      parts.push(
        `${combinedVideo}${nextVideo}xfade=transition=${style}:duration=${transitionDuration.toFixed(3)}:offset=${Math.max(0, combinedDuration - transitionDuration).toFixed(3)}[${outputLabel}]`,
      );
      combinedVideo = `[${outputLabel}]`;
      combinedDuration += nextDuration - transitionDuration;
    }
    parts.push(
      `${combinedVideo}fade=t=in:st=0:d=0.45,fade=t=out:st=${Math.max(0, totalSec - 0.8).toFixed(2)}:d=0.8,format=yuv420p[vout]`,
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
