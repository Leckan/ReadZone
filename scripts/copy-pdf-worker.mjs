import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerSource = path.join(projectRoot, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const publicDirectory = path.join(projectRoot, "public");
await mkdir(publicDirectory, { recursive: true });
await copyFile(workerSource, path.join(publicDirectory, "pdf.worker.min.mjs"));
