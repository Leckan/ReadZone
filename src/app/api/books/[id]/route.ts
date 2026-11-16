import { authenticatedUserId, deleteRemoteBook, getRemoteBook, isRemoteStorageConfigured, remoteBookErrorMessage, updateRemoteBook } from "@/lib/server/remote-books";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in to access your cloud library." }, { status: 401 });
  if (!isRemoteStorageConfigured()) return Response.json({ error: remoteBookErrorMessage() }, { status: 503 });
  try {
    const { id } = await context.params;
    const book = await getRemoteBook(userId, id);
    return book
      ? Response.json({ book }, { headers: { "Cache-Control": "private, no-store" } })
      : Response.json({ error: "Book not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Couldn’t load this book from cloud storage." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: Context) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in to update your cloud library." }, { status: 401 });
  if (!isRemoteStorageConfigured()) return Response.json({ error: remoteBookErrorMessage() }, { status: 503 });
  try {
    const { id } = await context.params;
    const updated = await updateRemoteBook(userId, id, await request.json());
    return updated ? Response.json({ ok: true }) : Response.json({ error: "Book not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Couldn’t update your cloud reading progress." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ error: "Sign in to update your cloud library." }, { status: 401 });
  if (!isRemoteStorageConfigured()) return Response.json({ error: remoteBookErrorMessage() }, { status: 503 });
  try {
    const { id } = await context.params;
    const deleted = await deleteRemoteBook(userId, id);
    return deleted ? Response.json({ ok: true }) : Response.json({ error: "Book not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Couldn’t remove this book from cloud storage." }, { status: 503 });
  }
}
