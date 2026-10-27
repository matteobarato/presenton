// Render one HyperFrames project directory to a silent MP4.
//
// Usage: node render.mjs <task.json>
//
// task.json: { "projectDir", "outputPath", "fps", "quality", "workers"?, "crf"? }
//
// Progress goes to stdout as `PROGRESS <percent> <message>` lines, which the
// FastAPI video service parses; everything else the producer logs is left on
// stderr/stdout for diagnostics. A failed render exits non-zero with the error
// on stderr.
import { readFile } from "node:fs/promises";

import { createRenderJob, executeRenderJob } from "@hyperframes/producer";

const QUALITIES = new Set(["draft", "standard", "high"]);

async function main() {
  const taskPath = process.argv[2];
  if (!taskPath) {
    throw new Error("Usage: node render.mjs <task.json>");
  }
  const task = JSON.parse(await readFile(taskPath, "utf8"));
  if (!task.projectDir || !task.outputPath) {
    throw new Error("task.json needs projectDir and outputPath");
  }
  const fps = Number(task.fps) || 30;
  const quality = QUALITIES.has(task.quality) ? task.quality : "standard";

  const config = { fps, quality, format: "mp4" };
  // Each worker is its own Chrome; left unset the producer sizes the pool
  // from the machine, which a shared server may want to cap.
  if (Number.isInteger(task.workers) && task.workers > 0) config.workers = task.workers;
  // The clip is re-encoded once more when narration is muxed in, so it is
  // rendered close to lossless to keep that second pass from compounding.
  if (Number.isInteger(task.crf) && task.crf >= 0) config.crf = task.crf;

  const job = createRenderJob(config);
  let lastReported = -1;
  await executeRenderJob(job, task.projectDir, task.outputPath, (current, message) => {
    const percent = Math.max(0, Math.min(100, Math.round(current.progress ?? 0)));
    if (percent === lastReported) return;
    lastReported = percent;
    process.stdout.write(`PROGRESS ${percent} ${String(message ?? "").replace(/\s+/g, " ")}\n`);
  });
  process.stdout.write("PROGRESS 100 done\n");
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
});
