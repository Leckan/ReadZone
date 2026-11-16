import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getCurrentUser } from "@/lib/auth/server";
import type { BookRecord } from "@/lib/types";

const MAX_REMOTE_BOOK_BYTES = 4 * 1024 * 1024;
let storageClient: S3Client | undefined;
let database: NeonQueryFunction<false, false> | undefined;

export function isRemoteStorageConfigured() {
  return Boolean(
    process.env.DATABASE_URL && process.env.READFLOW_STORAGE_ENDPOINT && process.env.READFLOW_STORAGE_REGION &&
    process.env.READFLOW_STORAGE_ACCESS_KEY_ID && process.env.READFLOW_STORAGE_SECRET_ACCESS_KEY && process.env.READFLOW_STORAGE_BUCKET,
  );
}

function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Remote database is not configured.");
  if (!database) database = neon(url);
  return database;
}

function getStorage() {
  if (!storageClient) {
    const endpoint = process.env.READFLOW_STORAGE_ENDPOINT;
    const region = process.env.READFLOW_STORAGE_REGION;
    const accessKeyId = process.env.READFLOW_STORAGE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.READFLOW_STORAGE_SECRET_ACCESS_KEY;
    if (!endpoint || !region || !accessKeyId || !secretAccessKey) throw new Error("Remote object storage is not configured.");
    storageClient = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return storageClient;
}

function getBucket() {
  const bucket = process.env.READFLOW_STORAGE_BUCKET;
  if (!bucket) throw new Error("Remote object storage bucket is not configured.");
  return bucket;
}

export async function authenticatedUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

function contentKey(userId: string, bookId: string) {
  return `users/${userId}/books/${bookId}.json`;
}

function validateBook(value: unknown): value is BookRecord {
  if (!value || typeof value !== "object") return false;
  const book = value as Partial<BookRecord>;
  return typeof book.id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(book.id)
    && typeof book.title === "string" && book.title.trim().length > 0
    && typeof book.author === "string" && (book.format === "PDF" || book.format === "EPUB")
    && typeof book.fileName === "string" && typeof book.fileSize === "number"
    && Array.isArray(book.chapters) && Array.isArray(book.bookmarks)
    && typeof book.progressPercent === "number" && typeof book.listenedSeconds === "number"
    && typeof book.favorite === "boolean" && typeof book.wordCount === "number";
}

function toRemoteRecord(row: Record<string, unknown>, userId: string, chapters: BookRecord["chapters"] = []): BookRecord {
  const metadata = (row.book_data ?? {}) as Partial<BookRecord>;
  return {
    ...metadata,
    id: String(row.id),
    title: String(row.title),
    author: String(row.author),
    format: row.format as BookRecord["format"],
    fileName: String(row.file_name),
    fileSize: Number(row.file_size),
    wordCount: Number(row.word_count),
    pageCount: row.page_count == null ? undefined : Number(row.page_count),
    chapters,
    progressChapterId: row.progress_chapter_id ? String(row.progress_chapter_id) : undefined,
    progressParagraphId: row.progress_paragraph_id ? String(row.progress_paragraph_id) : undefined,
    progressPercent: Number(row.progress_percent ?? 0),
    listenedSeconds: Number(row.listened_seconds ?? 0),
    favorite: Boolean(row.favorite),
    bookmarks: Array.isArray(row.bookmarks) ? row.bookmarks as BookRecord["bookmarks"] : [],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    lastOpenedAt: row.last_opened_at ? new Date(String(row.last_opened_at)).toISOString() : undefined,
    remoteStored: true,
    remoteOwnerId: userId,
  };
}

const SELECT_COLUMNS = `id, owner_id, title, author, format, file_name, file_size, word_count, page_count,
  book_data, content_key, progress_chapter_id, progress_paragraph_id, progress_percent,
  listened_seconds, favorite, bookmarks, created_at, updated_at, last_opened_at`;

export async function listRemoteBooks(userId: string) {
  const sql = getDatabase();
  const rows = await sql`SELECT ${sql.unsafe(SELECT_COLUMNS)} FROM public.readflow_books WHERE owner_id = ${userId} ORDER BY updated_at DESC`;
  return rows.map((row) => toRemoteRecord(row as Record<string, unknown>, userId));
}

export async function createRemoteBook(userId: string, book: unknown) {
  if (!validateBook(book)) return { error: "This book record is incomplete or invalid.", status: 400 as const };
  const encoded = JSON.stringify(book);
  if (new TextEncoder().encode(encoded).byteLength > MAX_REMOTE_BOOK_BYTES) {
    return { error: "This book’s extracted text is too large for one cloud upload. It remains available in your local library.", status: 413 as const };
  }
  const key = contentKey(userId, book.id);
  const metadata = { ...book, chapters: [], bookmarks: [] };
  const sql = getDatabase();
  const client = getStorage();
  try {
    await client.send(new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: encoded, ContentType: "application/json" }));
    await sql`INSERT INTO public.readflow_books (
      id, owner_id, title, author, format, file_name, file_size, word_count, page_count, book_data, content_key,
      progress_chapter_id, progress_paragraph_id, progress_percent, listened_seconds, favorite, bookmarks,
      created_at, updated_at, last_opened_at
    ) VALUES (
      ${book.id}, ${userId}, ${book.title}, ${book.author}, ${book.format}, ${book.fileName}, ${book.fileSize},
      ${book.wordCount}, ${book.pageCount ?? null}, ${JSON.stringify(metadata)}::jsonb, ${key},
      ${book.progressChapterId ?? null}, ${book.progressParagraphId ?? null}, ${book.progressPercent},
      ${book.listenedSeconds}, ${book.favorite}, ${JSON.stringify(book.bookmarks)}::jsonb,
      ${book.createdAt}, ${book.updatedAt}, ${book.lastOpenedAt ?? null}
    ) ON CONFLICT (owner_id, id) DO UPDATE SET
      title = EXCLUDED.title, author = EXCLUDED.author, format = EXCLUDED.format,
      file_name = EXCLUDED.file_name, file_size = EXCLUDED.file_size, word_count = EXCLUDED.word_count,
      page_count = EXCLUDED.page_count, book_data = EXCLUDED.book_data, content_key = EXCLUDED.content_key,
      progress_chapter_id = EXCLUDED.progress_chapter_id, progress_paragraph_id = EXCLUDED.progress_paragraph_id,
      progress_percent = EXCLUDED.progress_percent, listened_seconds = EXCLUDED.listened_seconds,
      favorite = EXCLUDED.favorite, bookmarks = EXCLUDED.bookmarks, updated_at = EXCLUDED.updated_at,
      last_opened_at = EXCLUDED.last_opened_at`;
    return { book: { ...book, remoteStored: true, remoteOwnerId: userId } };
  } catch {
    await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key })).catch(() => undefined);
    throw new Error("Cloud storage is unavailable. The book remains saved on this device.");
  }
}

export async function getRemoteBook(userId: string, id: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) return null;
  const sql = getDatabase();
  const rows = await sql`SELECT ${sql.unsafe(SELECT_COLUMNS)} FROM public.readflow_books WHERE owner_id = ${userId} AND id = ${id} LIMIT 1`;
  if (!rows.length) return null;
  const row = rows[0] as Record<string, unknown>;
  const response = await getStorage().send(new GetObjectCommand({ Bucket: getBucket(), Key: String(row.content_key) }));
  const body = await response.Body?.transformToString();
  if (!body) throw new Error("Stored book content is unavailable.");
  const content = JSON.parse(body) as BookRecord;
  return toRemoteRecord(row, userId, content.chapters);
}

export async function updateRemoteBook(userId: string, id: string, value: unknown) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id) || !value || typeof value !== "object") return false;
  const patch = value as Partial<BookRecord>;
  const allowedPercent = typeof patch.progressPercent === "number" && Number.isFinite(patch.progressPercent)
    ? Math.min(100, Math.max(0, patch.progressPercent)) : null;
  const bookmarks = Array.isArray(patch.bookmarks) ? JSON.stringify(patch.bookmarks) : null;
  const chapterId = typeof patch.progressChapterId === "string" ? patch.progressChapterId : null;
  const paragraphId = typeof patch.progressParagraphId === "string" ? patch.progressParagraphId : null;
  const listenedSeconds = typeof patch.listenedSeconds === "number" && Number.isFinite(patch.listenedSeconds)
    ? Math.max(0, Math.floor(patch.listenedSeconds)) : null;
  const favorite = typeof patch.favorite === "boolean" ? patch.favorite : null;
  const lastOpenedAt = typeof patch.lastOpenedAt === "string" ? patch.lastOpenedAt : null;
  const sql = getDatabase();
  const rows = await sql`UPDATE public.readflow_books SET
    progress_percent = COALESCE(${allowedPercent}, progress_percent),
    progress_chapter_id = COALESCE(${chapterId}, progress_chapter_id),
    progress_paragraph_id = COALESCE(${paragraphId}, progress_paragraph_id),
    listened_seconds = COALESCE(${listenedSeconds}, listened_seconds),
    favorite = COALESCE(${favorite}, favorite),
    bookmarks = COALESCE(${bookmarks}::jsonb, bookmarks),
    last_opened_at = COALESCE(${lastOpenedAt}::timestamptz, last_opened_at),
    updated_at = NOW()
    WHERE owner_id = ${userId} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function deleteRemoteBook(userId: string, id: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) return false;
  const sql = getDatabase();
  const rows = await sql`DELETE FROM public.readflow_books WHERE owner_id = ${userId} AND id = ${id} RETURNING content_key`;
  if (!rows.length) return false;
  await getStorage().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: String(rows[0].content_key) }));
  return true;
}

export function remoteBookErrorMessage() {
  return "Cloud library is not configured. Add the server environment variables and database migration described in the README.";
}
