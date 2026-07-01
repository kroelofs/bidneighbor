/**
 * Client-side image downscaling. If a photo is larger than `maxBytes`, re-encode it via a
 * canvas (shrinking the longest edge and lowering JPEG quality until it fits) so oversized
 * uploads succeed instead of bouncing off the server's size limit. Runs entirely in the
 * browser — the network only ever sees the smaller file.
 *
 * Only re-encodes JPEG/PNG/WebP. GIFs (which can be animated) and anything else pass
 * through untouched.
 */

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // aim for ~2 MB — comfortably under the 10 MB server cap
const DEFAULT_MAX_DIMENSION = 1600; // longest edge, px
const RECODABLE = /^image\/(jpeg|png|webp)$/;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

async function decode(file: File): Promise<{ width: number; height: number; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  // createImageBitmap is fast and available in all evergreen browsers; fall back to <img>.
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return {
      width: bmp.width,
      height: bmp.height,
      draw: (c, w, h) => c.drawImage(bmp, 0, 0, w, h),
      close: () => bmp.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (c, w, h) => c.drawImage(img, 0, 0, w, h),
      close: () => {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(
  file: File,
  opts: { maxBytes?: number; maxDimension?: number } = {},
): Promise<File> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;

  if (!RECODABLE.test(file.type) || file.size <= maxBytes) return file;

  let src: Awaited<ReturnType<typeof decode>>;
  try {
    src = await decode(file);
  } catch {
    return file; // undecodable → let the server decide
  }

  try {
    let dimension = maxDimension;
    // Two passes on dimension: try the max edge, then a smaller edge if quality alone can't get it under.
    for (let attempt = 0; attempt < 2; attempt++) {
      const scale = Math.min(1, dimension / Math.max(src.width, src.height));
      const w = Math.max(1, Math.round(src.width * scale));
      const h = Math.max(1, Math.round(src.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      src.draw(ctx, w, h);

      // Lower JPEG quality until it fits (or we bottom out).
      for (let q = 0.85; q >= 0.4; q -= 0.15) {
        const blob = await canvasToBlob(canvas, "image/jpeg", q);
        if (blob && blob.size <= maxBytes) {
          return new File([blob], renameToJpg(file.name), { type: "image/jpeg", lastModified: Date.now() });
        }
      }
      dimension = Math.round(dimension * 0.6); // shrink further and retry
    }
    // Couldn't get under target — return the smallest JPEG we produced at the smallest size.
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, dimension / Math.max(src.width, src.height));
    canvas.width = Math.max(1, Math.round(src.width * scale));
    canvas.height = Math.max(1, Math.round(src.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    src.draw(ctx, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.4);
    return blob ? new File([blob], renameToJpg(file.name), { type: "image/jpeg", lastModified: Date.now() }) : file;
  } finally {
    src.close();
  }
}

function renameToJpg(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, "") + ".jpg";
}
