import JSZip from "jszip";
import type { BookChapter, BookFormat, BookParagraph, BookRecord } from "@/lib/types";

const MAX_FILE_SIZE = 75 * 1024 * 1024;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function paragraphsFromText(text: string, page?: number): BookParagraph[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  const blocks = cleaned.split(/\n\s*\n/).flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return [block.trim()];
    return [lines.join(" ")];
  });
  return blocks
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 1)
    .map((value) => ({ id: makeId(), text: value, ...(page ? { page } : {}) }));
}

function countWords(chapters: BookChapter[]) {
  return chapters.reduce(
    (total, chapter) => total + chapter.paragraphs.reduce((count, paragraph) => count + paragraph.text.split(/\s+/).filter(Boolean).length, 0),
    0,
  );
}

function chapterTitleFromText(text: string, fallback: string) {
  return text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").trim() || fallback;
}

function textItemsToLines(items: Array<{ str?: string; transform?: number[]; width?: number }>) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of items) {
    const value = item.str?.trim();
    if (!value) continue;
    const y = Math.round(item.transform?.[5] ?? 0);
    const row = rows.get(y) ?? [];
    row.push({ x: item.transform?.[4] ?? 0, text: value });
    rows.set(y, row);
  }
  const orderedRows = [...rows.entries()].sort((a, b) => b[0] - a[0]);
  const lines: string[] = [];
  let previousY: number | undefined;
  for (const [y, row] of orderedRows) {
    if (previousY !== undefined && Math.abs(previousY - y) > 20) lines.push("");
    row.sort((a, b) => a.x - b.x);
    lines.push(row.map((item) => item.text).join(" "));
    previousY = y;
  }
  return lines.join("\n");
}

function isChapterHeading(text: string) {
  return /^(chapter|part|section|book)\s+([\divxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(text)
    || /^\d{1,2}[.)]\s+[A-Z][\w\s:,'’–-]{3,70}$/.test(text);
}

async function parsePdf(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data, useWorkerFetch: false }).promise;
  const metadata = await pdf.getMetadata().catch(() => null);
  const info = metadata?.info as { Title?: string; Author?: string } | undefined;
  const chapters: BookChapter[] = [{ id: makeId(), title: "Opening pages", paragraphs: [] }];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = textItemsToLines(content.items as Array<{ str?: string; transform?: number[]; width?: number }>);
    const pageParagraphs = paragraphsFromText(text, pageNumber);
    for (const paragraph of pageParagraphs) {
      if (isChapterHeading(paragraph.text) && chapters.at(-1)?.paragraphs.length) {
        chapters.push({ id: makeId(), title: paragraph.text, paragraphs: [] });
      } else if (chapters.length === 1 && chapters[0].title === "Opening pages" && isChapterHeading(paragraph.text)) {
        chapters[0].title = paragraph.text;
      } else {
        chapters.at(-1)?.paragraphs.push(paragraph);
      }
    }
  }
  const validChapters = chapters.filter((chapter) => chapter.paragraphs.length);
  return {
    title: info?.Title?.trim() || file.name.replace(/\.pdf$/i, ""),
    author: info?.Author?.trim() || "Unknown author",
    chapters: validChapters,
    pageCount: pdf.numPages,
  };
}

function zipPath(baseDirectory: string, target: string) {
  const resolved = new URL(target, `https://epub.local/${baseDirectory}`);
  return decodeURIComponent(resolved.pathname.replace(/^\//, ""));
}

async function parseEpub(file: File) {
  const zip = await JSZip.loadAsync(file);
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("This EPUB is missing its package index.");
  const container = new DOMParser().parseFromString(await containerFile.async("text"), "application/xml");
  const packagePath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!packagePath) throw new Error("We couldn’t find the EPUB package metadata.");
  const packageXml = new DOMParser().parseFromString(await zip.file(packagePath)!.async("text"), "application/xml");
  const metadata = packageXml.getElementsByTagName("metadata")[0];
  const getMeta = (localName: string) => {
    const found = metadata ? Array.from(metadata.getElementsByTagName("*")).find((node) => node.localName === localName) : undefined;
    return found?.textContent?.trim() ?? "";
  };
  const manifest = new Map<string, string>();
  for (const item of Array.from(packageXml.getElementsByTagName("item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, href);
  }
  const baseDirectory = packagePath.includes("/") ? packagePath.slice(0, packagePath.lastIndexOf("/") + 1) : "";
  const spineItems = Array.from(packageXml.getElementsByTagName("itemref"));
  const chapters: BookChapter[] = [];
  for (const [index, itemref] of spineItems.entries()) {
    const href = manifest.get(itemref.getAttribute("idref") ?? "");
    if (!href) continue;
    const chapterFile = zip.file(zipPath(baseDirectory, href));
    if (!chapterFile) continue;
    const source = await chapterFile.async("text");
    const document = new DOMParser().parseFromString(source, "text/html");
    document.querySelectorAll("script,style,svg,nav,head").forEach((node) => node.remove());
    const heading = document.querySelector("h1,h2,h3,h4")?.textContent?.trim();
    const blockNodes = Array.from(document.querySelectorAll("h1,h2,h3,h4,p,blockquote,li,pre"));
    const paragraphs = blockNodes
      .filter((node) => !node.parentElement?.closest("li") || node.tagName.toLowerCase() === "li")
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((text) => text.length > 1)
      .map((text) => ({ id: makeId(), text }));
    if (paragraphs.length) {
      chapters.push({
        id: makeId(),
        title: heading || chapterTitleFromText(source, `Chapter ${index + 1}`),
        paragraphs,
      });
    }
  }
  if (!chapters.length) throw new Error("No readable chapters were found in this EPUB.");
  return {
    title: getMeta("title") || file.name.replace(/\.epub$/i, ""),
    author: getMeta("creator") || "Unknown author",
    chapters,
    pageCount: undefined,
  };
}

export async function importBook(file: File): Promise<BookRecord> {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension !== "pdf" && extension !== "epub") throw new Error("Choose a PDF or EPUB file to continue.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Files must be smaller than 75 MB.");
  if (!file.size) throw new Error("This file is empty.");
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf = signature[0] === 0x25 && signature[1] === 0x50 && signature[2] === 0x44 && signature[3] === 0x46;
  const isZip = signature[0] === 0x50 && signature[1] === 0x4b;
  if ((extension === "pdf" && !isPdf) || (extension === "epub" && !isZip)) {
    throw new Error("The file contents don’t match its extension. Choose a valid PDF or EPUB.");
  }
  const format: BookFormat = extension === "pdf" ? "PDF" : "EPUB";
  const parsed = format === "PDF" ? await parsePdf(file) : await parseEpub(file);
  if (!parsed.chapters.length) throw new Error("We couldn’t find readable text in this file. Scanned PDFs need OCR, which isn’t enabled in this local build.");
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: parsed.title,
    author: parsed.author,
    format,
    fileName: file.name,
    fileSize: file.size,
    createdAt: now,
    updatedAt: now,
    chapters: parsed.chapters,
    wordCount: countWords(parsed.chapters),
    pageCount: parsed.pageCount,
    progressPercent: 0,
    listenedSeconds: 0,
    favorite: false,
    bookmarks: [],
  };
}
