import { authenticatedUserId, createRemoteBook, isRemoteStorageConfigured, listRemoteBooks, remoteBookErrorMessage } from "@/lib/server/remote-books";

export async function GET() {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in to access your cloud library." }, { status: 401 });
  if (!isRemoteStorageConfigured()) return Response.json({ error: remoteBookErrorMessage() }, { status: 503 });
  try {
    return Response.json({ books: await listRemoteBooks(userId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Couldn’t load your cloud library." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in to save a book to your cloud library." }, { status: 401 });
  if (!isRemoteStorageConfigured()) return Response.json({ error: remoteBookErrorMessage() }, { status: 503 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4 * 1024 * 1024) return Response.json({ error: "This book’s extracted text is too large for one cloud upload." }, { status: 413 });
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4 * 1024 * 1024) return Response.json({ error: "This book’s extracted text is too large for one cloud upload." }, { status: 413 });
    const payload = JSON.parse(raw) as { book?: unknown };
    const result = await createRemoteBook(userId, payload.book);
    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ book: result.book }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Couldn’t save this book to your cloud library." }, { status: 503 });
  }
}
