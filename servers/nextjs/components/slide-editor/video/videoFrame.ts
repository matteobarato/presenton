const frameCache = new Map<string, Promise<HTMLCanvasElement | null>>();

const FRAME_TIMEOUT_MS = 20_000;
// Avatar videos often open on a black or half-faded frame.
const FRAME_TIME_SECONDS = 0.5;

/**
 * A still of the video, drawn on a canvas of the video's own size so it can be
 * laid out like an image. The video may come from another origin; the canvas
 * is then tainted, which only matters to code reading its pixels back.
 */
export function loadVideoFrame(src: string): Promise<HTMLCanvasElement | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const cached = frameCache.get(src);
  if (cached) return cached;

  const promise = new Promise<HTMLCanvasElement | null>((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const done = (frame: HTMLCanvasElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      if (!frame) frameCache.delete(src);
      resolve(frame);
    };
    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) {
        done(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      done(canvas);
    };
    const timeout = window.setTimeout(() => done(null), FRAME_TIMEOUT_MS);

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      const time = Number.isFinite(video.duration)
        ? Math.min(FRAME_TIME_SECONDS, video.duration / 2)
        : 0;
      if (time > 0) {
        video.currentTime = time;
      } else {
        capture();
      }
    };
    video.onseeked = capture;
    video.onerror = () => done(null);
    video.src = src;
  });
  frameCache.set(src, promise);
  return promise;
}
