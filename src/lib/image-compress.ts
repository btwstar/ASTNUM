/**
 * Shared client-side image → data-URL compression (canvas pipeline).
 *
 * Used by the image attach flows:
 *  - body progress photos (src/components/body/photos.tsx)
 *  - note image attachments (src/components/notes/note-editor.tsx)
 *  - food photos (src/components/nutrition/food-search-sheet.tsx)
 *
 * Pipeline: createImageBitmap (EXIF-oriented) → canvas resize to maxDim →
 * JPEG at quality, retried once at (quality - 0.12) if the data URL still
 * exceeds maxDataUrl. Throws `too-large` when even the retry exceeds the
 * cap so callers can show a friendly message.
 *
 * Note attachments are a PAIR: the full image (detail route) + a small
 * thumbnail (list routes) — lists never pay the full-image payload.
 */

export interface CompressOptions {
  /** longest edge cap in px (default 1280) */
  maxDim?: number;
  /** initial JPEG quality 0..1 (default 0.78) */
  quality?: number;
  /** hard cap on the produced data-URL length in chars (default 600 * 1024) */
  maxDataUrl?: number;
}

export async function compressImageToDataUrl(
  file: File,
  opts: CompressOptions = {}
): Promise<string> {
  const { dataUrl } = await withDecodedSource(file, (source, width, height) =>
    encodeScaled(source, width, height, opts)
  );
  return dataUrl;
}

/* ── internals ──────────────────────────────────────────────────── */

interface DecodedSource {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/** Decode once (bitmap w/ EXIF orientation, img fallback) and always release. */
async function withDecodedSource<T>(
  file: File,
  fn: (source: CanvasImageSource, width: number, height: number) => Promise<T>
): Promise<T> {
  let width = 0;
  let height = 0;
  let source: CanvasImageSource;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    width = bitmap.width;
    height = bitmap.height;
    source = bitmap;
  } catch {
    // fallback for browsers without createImageBitmap options
    const url = URL.createObjectURL(file);
    try {
      const img = document.createElement("img");
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load failed"));
        img.src = url;
      });
      width = img.naturalWidth;
      height = img.naturalHeight;
      source = img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  try {
    return await fn(source, width, height);
  } finally {
    // ImageBitmaps hold significant native memory — close when we can.
    const closable = source as { close?: () => void };
    if (typeof closable.close === "function") closable.close();
  }
}

async function encodeScaled(
  source: CanvasImageSource,
  width: number,
  height: number,
  opts: CompressOptions
): Promise<{ dataUrl: string }> {
  const maxDim = opts.maxDim ?? 1280;
  const quality = opts.quality ?? 0.78;
  const maxDataUrl = opts.maxDataUrl ?? 600 * 1024;

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(source, 0, 0, w, h);

  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  if (dataUrl.length >= maxDataUrl) {
    dataUrl = canvas.toDataURL("image/jpeg", Math.max(0.4, quality - 0.12));
  }
  if (dataUrl.length >= maxDataUrl) {
    throw new Error("too-large");
  }
  return { dataUrl };
}

/* ── note image pair ────────────────────────────────────────────── */

/** Full-size note attachment: ≤1280px JPEG, data URL ≤ 500KB. */
export const NOTE_IMAGE_MAX_CHARS = 500 * 1024;
/** List thumbnail: ≤320px JPEG, data URL ≤ 48KB. */
export const NOTE_THUMB_MAX_CHARS = 48 * 1024;

const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function isDataImageUnder(value: unknown, cap: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= cap &&
    DATA_IMAGE_RE.test(value)
  );
}

/** Server-side guards shared by the notes routes (web + offline adapter). */
export function isValidNoteImage(value: unknown): value is string {
  return isDataImageUnder(value, NOTE_IMAGE_MAX_CHARS);
}
export function isValidNoteThumb(value: unknown): value is string {
  return isDataImageUnder(value, NOTE_THUMB_MAX_CHARS);
}

/**
 * Shared pair resolution for the notes routes: `image` + `imageThumb` always
 * travel together (both set, both null to remove, or both absent).
 *  - "absent"  → the request doesn't touch the pair (PATCH: not touched,
 *                POST: create without an image)
 *  - "remove"  → clear the pair
 *  - "set"     → store both validated data URLs
 *  - "invalid" → partial pair / malformed / over-cap → 400 VALIDATION
 */
export type NoteImageResolution =
  | { kind: "absent" }
  | { kind: "remove" }
  | { kind: "set"; image: string; imageThumb: string }
  | { kind: "invalid" };

export function resolveNoteImagePair(
  image: unknown,
  imageThumb: unknown
): NoteImageResolution {
  const imageSent = image !== undefined;
  const thumbSent = imageThumb !== undefined;
  if (!imageSent && !thumbSent) return { kind: "absent" };
  if (imageSent !== thumbSent) return { kind: "invalid" };
  if (image === null && imageThumb === null) return { kind: "remove" };
  if (isValidNoteImage(image) && isValidNoteThumb(imageThumb)) {
    return { kind: "set", image, imageThumb };
  }
  return { kind: "invalid" };
}

/**
 * Decode the picked file ONCE and produce the note attachment pair from the
 * same bitmap: full image (≤1280px) + list thumbnail (≤320px). Both caps
 * enforced; throws `too-large` if the full image can't fit its budget.
 */
export async function compressNoteImagePair(
  file: File
): Promise<{ image: string; imageThumb: string }> {
  return withDecodedSource(file, async (source, width, height) => {
    const { dataUrl: image } = await encodeScaled(source, width, height, {
      maxDim: 1280,
      quality: 0.78,
      maxDataUrl: NOTE_IMAGE_MAX_CHARS,
    });
    const { dataUrl: imageThumb } = await encodeScaled(source, width, height, {
      maxDim: 320,
      quality: 0.62,
      maxDataUrl: NOTE_THUMB_MAX_CHARS,
    });
    return { image, imageThumb };
  });
}

/* ── food photo pair ────────────────────────────────────────────── */

/** Full food photo: ≤1280px JPEG, data URL ≤ 500KB (detail/editor only). */
export const FOOD_IMAGE_MAX_CHARS = 500 * 1024;
/** List thumbnail: ≤320px JPEG, data URL ≤ 48KB (carried by list routes). */
export const FOOD_THUMB_MAX_CHARS = 48 * 1024;

/** Server-side guards shared by the nutrition foods routes (web + offline). */
export function isValidFoodImage(value: unknown): value is string {
  return isDataImageUnder(value, FOOD_IMAGE_MAX_CHARS);
}
export function isValidFoodThumb(value: unknown): value is string {
  return isDataImageUnder(value, FOOD_THUMB_MAX_CHARS);
}

/**
 * Shared pair resolution for the foods routes (web + offline adapter):
 * `image` + `imageThumb` always travel together (both set, both null to
 * remove, or both absent) — same contract as the notes pair.
 */
export type FoodImageResolution =
  | { kind: "absent" }
  | { kind: "remove" }
  | { kind: "set"; image: string; imageThumb: string }
  | { kind: "invalid" };

export function resolveFoodImagePair(
  image: unknown,
  imageThumb: unknown
): FoodImageResolution {
  const imageSent = image !== undefined;
  const thumbSent = imageThumb !== undefined;
  if (!imageSent && !thumbSent) return { kind: "absent" };
  if (imageSent !== thumbSent) return { kind: "invalid" };
  if (image === null && imageThumb === null) return { kind: "remove" };
  if (isValidFoodImage(image) && isValidFoodThumb(imageThumb)) {
    return { kind: "set", image, imageThumb };
  }
  return { kind: "invalid" };
}

/**
 * Decode the picked file ONCE and produce the food photo pair from the same
 * bitmap: full photo (≤1280px) + list thumbnail (≤320px). Throws "too-large"
 * if the full photo can't fit its budget.
 */
export async function compressFoodImagePair(
  file: File
): Promise<{ image: string; imageThumb: string }> {
  return withDecodedSource(file, async (source, width, height) => {
    const { dataUrl: image } = await encodeScaled(source, width, height, {
      maxDim: 1280,
      quality: 0.78,
      maxDataUrl: FOOD_IMAGE_MAX_CHARS,
    });
    const { dataUrl: imageThumb } = await encodeScaled(source, width, height, {
      maxDim: 320,
      quality: 0.62,
      maxDataUrl: FOOD_THUMB_MAX_CHARS,
    });
    return { image, imageThumb };
  });
}

/* ── exercise-form media (image / GIF / video) ───────────────────── */

/** Static exercise image: ≤640px JPEG, data URL ≤ 300KB. */
export const EX_IMAGE_MAX_CHARS = 300 * 1024;
/** Animated GIF: stored verbatim (canvas re-encode would kill the animation). */
export const EX_GIF_MAX_CHARS = 1500 * 1024;
/** Short form video (mp4/webm/quicktime), stored as a data URL. */
export const EX_VIDEO_MAX_CHARS = 2500 * 1024;
/** List thumbnail: ≤320px JPEG, data URL ≤ 48KB. */
export const EX_THUMB_MAX_CHARS = 48 * 1024;

const DATA_EX_IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const DATA_EX_GIF_RE = /^data:image\/gif;base64,[A-Za-z0-9+/=]+$/;
const DATA_EX_VIDEO_RE = /^data:video\/(mp4|webm|quicktime);base64,[A-Za-z0-9+/=]+$/;

/** Which media family a validated exercise `image` data URL belongs to. */
export type ExerciseMediaKind = "image" | "gif" | "video";

export function exerciseMediaKind(value: string): ExerciseMediaKind | null {
  if (DATA_EX_VIDEO_RE.test(value)) return "video";
  if (DATA_EX_GIF_RE.test(value)) return "gif";
  if (DATA_EX_IMAGE_RE.test(value) && value.length <= EX_IMAGE_MAX_CHARS) return "image";
  return null;
}

/** Server-side guard (web + offline adapter): the full media data URL. */
export function isValidExerciseImage(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (DATA_EX_VIDEO_RE.test(value)) return value.length <= EX_VIDEO_MAX_CHARS;
  if (DATA_EX_GIF_RE.test(value)) return value.length <= EX_GIF_MAX_CHARS;
  return DATA_EX_IMAGE_RE.test(value) && value.length <= EX_IMAGE_MAX_CHARS;
}

/** Server-side guard: the list thumbnail (always a small static image). */
export function isValidExerciseThumb(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= EX_THUMB_MAX_CHARS &&
    DATA_EX_IMAGE_RE.test(value)
  );
}

/**
 * Shared pair resolution for the exercise media routes (web + offline):
 *  - "absent"  → request doesn't touch the pair
 *  - "remove"  → clear both
 *  - "set"     → image validated; thumb validated OR null (a video whose
 *                frame-grab failed legitimately has no thumb — the list then
 *                renders a play-badge placeholder)
 *  - "invalid" → partial pair / malformed / over-cap → 400 VALIDATION
 */
export type ExerciseMediaResolution =
  | { kind: "absent" }
  | { kind: "remove" }
  | { kind: "set"; image: string; imageThumb: string | null }
  | { kind: "invalid" };

export function resolveExerciseMediaPair(
  image: unknown,
  imageThumb: unknown
): ExerciseMediaResolution {
  const imageSent = image !== undefined;
  const thumbSent = imageThumb !== undefined;
  if (!imageSent && !thumbSent) return { kind: "absent" };
  if (imageSent !== thumbSent) return { kind: "invalid" };
  if (image === null && imageThumb === null) return { kind: "remove" };
  if (isValidExerciseImage(image) && (imageThumb === null || isValidExerciseThumb(imageThumb))) {
    return { kind: "set", image, imageThumb };
  }
  return { kind: "invalid" };
}

/* ── client-side pick pipeline ───────────────────────────────────── */

/** Read a File as a data URL (used for GIF/video where canvas re-encode
 *  would destroy the media). Rejects with a precise error kind on caps. */
function fileToDataUrl(file: File, cap: number, error: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || result.length === 0) {
        reject(new Error("read-failed"));
        return;
      }
      if (result.length > cap) {
        reject(new Error(error));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

/** Best-effort first-frame JPEG thumb of a video data URL (≤320px, ≤48KB).
 *  Any failure (no metadata, no seek, no canvas) → null → play-placeholder. */
async function videoFirstFrameThumb(dataUrl: string): Promise<string | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = dataUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("timeout")), 4000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("meta-failed"));
      };
    });
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("timeout")), 4000);
      video.onseeked = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("seek-failed"));
      };
      video.currentTime = Math.min(0.2, (video.duration || 1) / 2);
    });
    const w = video.videoWidth || 320;
    const h = video.videoHeight || 320;
    const scale = Math.min(1, 320 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", 0.62);
    return out.length <= EX_THUMB_MAX_CHARS ? out : null;
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * Pick pipeline for exercise-form media. Branches by mime type:
 *  - video/*  → stored verbatim (≤2.5MB) + best-effort frame thumb
 *  - image/gif→ stored verbatim (≤1.5MB, animation preserved) + static thumb
 *  - image/*   → decoded once, full ≤640px JPEG + list thumb ≤320px
 * Throws ("image-too-large" | "gif-too-large" | "video-too-large" | …) —
 * callers map the errors to localized toasts.
 */
export async function compressExerciseMedia(
  file: File
): Promise<{ image: string; imageThumb: string | null; kind: ExerciseMediaKind }> {
  const mime = file.type || "";
  if (mime.startsWith("video/")) {
    const image = await fileToDataUrl(file, EX_VIDEO_MAX_CHARS, "video-too-large");
    const imageThumb = await videoFirstFrameThumb(image);
    return { image, imageThumb, kind: "video" };
  }
  if (mime === "image/gif") {
    const image = await fileToDataUrl(file, EX_GIF_MAX_CHARS, "gif-too-large");
    let imageThumb: string | null = null;
    try {
      imageThumb = await compressImageToDataUrl(file, {
        maxDim: 320,
        quality: 0.62,
        maxDataUrl: EX_THUMB_MAX_CHARS,
      });
    } catch {
      imageThumb = null; // placeholder tile in lists — GIF itself still valid
    }
    return { image, imageThumb, kind: "gif" };
  }
  if (mime.startsWith("image/")) {
    return withDecodedSource(file, async (source, width, height) => {
      const { dataUrl: image } = await encodeScaled(source, width, height, {
        maxDim: 640,
        quality: 0.78,
        maxDataUrl: EX_IMAGE_MAX_CHARS,
      });
      const { dataUrl: imageThumb } = await encodeScaled(source, width, height, {
        maxDim: 320,
        quality: 0.62,
        maxDataUrl: EX_THUMB_MAX_CHARS,
      });
      return { image, imageThumb, kind: "image" as ExerciseMediaKind };
    });
  }
  throw new Error("unsupported-type");
}
