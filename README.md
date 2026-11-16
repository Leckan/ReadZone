# ReadFlow AI

ReadFlow is a local-first PDF and EPUB reading workspace. It extracts text in the browser, organizes books into a personal library, and reads sentences aloud with synchronized highlighting. Optional Neon Auth and Neon Object Storage support accounts and a private cloud library.

## Project status

The local reading experience works without any service credentials. With account and storage configuration enabled, users can sign up or sign in with email/password or Google, upload books to their private account, and sync bookmarks, favorites, and reading progress. Existing books remain on the device until the user selects **Upload to cloud**.

The selected Neon project is ThinkZone (`aws-us-east-2`). Managed Auth is enabled, and this workspace is configured to use the dedicated `readflow` database with its ReadFlow table and private `readflow-books` bucket already provisioned. Local connection settings live in ignored `.env.local`; they are not committed.

## Run locally

Requirements: Node.js 20.9 or later and npm. No environment file is needed for local-only use.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other project commands:

```bash
npm run build
npm run start
npm run lint
```

The `predev`, `prebuild`, and `prestart` scripts copy PDF.js’s worker from `node_modules` into `public/` before Next.js starts.

## Enable accounts and cloud storage

1. Copy `.env.example` to `.env.local`. The Neon Auth and Object Storage endpoints are set to the selected ThinkZone project; keep all credentials server-side.
2. In the ThinkZone project's `main` branch, create a **private** Neon Object Storage bucket named `readflow-books` in `us-east-2` if it is not already present. Buckets can be created in the Neon Console, CLI, or with the S3 `CreateBucket` API.
3. Create a Neon S3 credential scoped to `storage:read` and `storage:write`. Put its access key and secret in `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env.local`.
4. Apply `db/migrations/0001_readflow_books.sql` to the `readflow` database using an owner/migration connection if it is not already applied. It adds only the `public.readflow_books` table and its owner/update index. Managed Auth is hosted separately, so `owner_id` stores the verified Auth UUID without a cross-database foreign key.
5. Set `DATABASE_URL` to a server-only Postgres role that can read and write `public.readflow_books`. Avoid using a superuser/owner URL at runtime. For example, after applying the migration as the owner:

   ```sql
   CREATE ROLE readflow_app LOGIN PASSWORD 'use-a-unique-password';
   GRANT USAGE ON SCHEMA public TO readflow_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON public.readflow_books TO readflow_app;
   ```

6. After all credentials and the migration are ready, set `NEXT_PUBLIC_NEON_AUTH_ENABLED=true` and `NEXT_PUBLIC_READFLOW_REMOTE_STORAGE_ENABLED=true` in `.env.local`, then restart Next.js. Localhost is already allowed by the selected Neon Auth configuration. Add the production app origin to Neon Auth's trusted domains before deploying.

Generate a cookie secret of at least 32 characters and never commit `.env.local`:

```bash
openssl rand -base64 32
```

The server environment variables are:

| Variable | Purpose |
| --- | --- |
| `NEON_AUTH_BASE_URL` | Neon Managed Auth URL for ThinkZone. |
| `NEON_AUTH_COOKIE_SECRET` | Secret used by the Next.js auth proxy to sign session cookies. |
| `DATABASE_URL` | Restricted Postgres connection for ReadFlow book records. |
| `AWS_ENDPOINT_URL_S3` | ThinkZone branch's Neon Object Storage S3 endpoint. |
| `AWS_REGION` | `us-east-2` for the selected project. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Scoped S3 credential for private object access. |
| `READFLOW_STORAGE_BUCKET` | `readflow-books`. |
| `NEXT_PUBLIC_NEON_AUTH_ENABLED` | Turns on the account UI and Neon Auth client. |
| `NEXT_PUBLIC_READFLOW_REMOTE_STORAGE_ENABLED` | Turns on app sync and remote book endpoints. |

Books and chapters are uploaded as one JSON object. Cloud uploads are currently limited to 4 MiB of extracted JSON per book to fit typical serverless request limits. Larger books remain fully available in the local library and can be uploaded after a future chunked-transfer implementation. The original PDF/EPUB is not uploaded or retained.

## What works

- Import multiple PDF or EPUB files by file picker or drag and drop. Files must be under 75 MB and pass a basic file-signature check.
- Extract PDF text page by page, with heuristic chapter headings and source page references. Extract EPUB metadata and chapters in spine order.
- Search the library by title or author, and search within the current reader chapter.
- Filter books by reading status or favorite, choose a grid or list view, and remove books from the browser or account.
- Read a chapter, navigate the table of contents, or click a sentence to start narration from that point.
- Use speech voices available from the browser or operating system. Adjust speed and volume; the active sentence is highlighted as it is spoken.
- Save narration progress, bookmarks, and notes. Reopen a book to continue from its last narrated sentence.
- Adjust text size, line spacing, high contrast, and light or dark appearance.
- Ask a question about the current book. The companion uses local keyword matching and returns a matching passage with its chapter and PDF page when available.
- Optionally sign in with Neon Auth and sync account-owned book text and reading state through private Neon Object Storage.

## Narration and companion behavior

Narration uses the browser’s Speech Synthesis API. It plays text aloud but does not create or export an MP3 or reusable audiobook file. Available voices and playback behavior depend on the browser and operating system.

The reading companion is a local text search, not a hosted language model or semantic RAG system. It searches the current book and reports a matching passage; it does not generate summaries, flashcards, or quizzes.

## Data and privacy

Extracted book text and reading data are stored in IndexedDB for offline reading. Reader preferences are stored in versioned local storage. The original PDF or EPUB is not retained after extraction. When cloud storage is enabled, the extracted text is stored in a private object owned by the signed-in Neon Auth user; metadata and reading state are stored in `public.readflow_books` with owner-filtered server queries. A sign-out hides remote account caches from the active library. Removing a cloud book deletes its remote row/object and its local cache.

Remote API routes verify the Neon Auth session server-side and include the authenticated user ID in every database read, update, and delete. Never expose `DATABASE_URL` or S3 credentials through a `NEXT_PUBLIC_` variable.

## Current limitations

- Scanned PDFs without an embedded text layer need OCR; OCR is not connected.
- The app does not bypass DRM or copy protection.
- Cloud uploads currently accept extracted book JSON under 4 MiB per book; larger books remain local.
- Hosted AI/RAG, generated audio, billing, analytics, and admin tools are not connected.
- Library search covers titles and authors; in-book search covers the open chapter.

## Project structure

- `src/app/` — Next.js application shell, auth page, and API routes.
- `src/components/readflow-app.tsx` — dashboard, library, reader, narration controls, bookmarks, preferences, and cloud actions.
- `src/components/auth-boundary.tsx` — Neon Auth session state for client components.
- `src/lib/auth/` — Neon Auth client and server configuration.
- `src/lib/server/remote-books.ts` — owner-scoped Postgres and private S3 access.
- `src/lib/import-book.ts` — browser-side PDF.js and EPUB ZIP extraction.
- `src/lib/storage.ts` — IndexedDB book records and local preferences.
- `src/lib/sentences.ts` — sentence segmentation and reading-time formatting helpers.
- `src/lib/types.ts` — book, chapter, bookmark, and preference models.
- `db/migrations/` — ReadFlow-owned database schema changes.
- `scripts/copy-pdf-worker.mjs` — prepares PDF.js’s worker for Next.js public assets.
