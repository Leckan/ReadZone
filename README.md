# ReadFlow AI

ReadFlow is a local-first PDF and EPUB reading workspace. It extracts text in the browser, organizes books into a personal library, and reads sentences aloud with synchronized highlighting. Better Auth provides optional email/password and Google sign-in. Neon Object Storage keeps uploaded book text private, while Postgres stores account-owned metadata and reading progress.

## Project status

The local reading experience works without service credentials. With account and storage configuration enabled, users can create an account or sign in with email/password or Google, upload books to their private account, and sync bookmarks, favorites, and reading progress. Existing books remain on the device until the user selects **Upload to cloud**.

The app uses the ThinkZone Neon project in `aws-us-east-2`, its dedicated `readflow` Postgres database, and the private `readflow-books` Object Storage bucket. Better Auth stores users and sessions in the `better_auth` schema of the `readflow` database. Local connection settings belong in ignored `.env.local` and are not committed.

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

The `predev`, `prebuild`, and `prestart` scripts copy PDF.js's worker from `node_modules` into `public/` before Next.js starts.

## Enable Better Auth and cloud storage

1. Copy `.env.example` to `.env.local`. Set `BETTER_AUTH_DATABASE_URL` to the `readflow` database using a restricted auth runtime role, and set `BETTER_AUTH_SECRET` to a random value of at least 32 characters.
2. Apply `db/migrations/0001_readflow_books.sql` and `db/migrations/0002_better_auth.sql` to the `readflow` database using an owner/migration connection. The second migration creates the `better_auth` schema and Better Auth's user, session, account, and verification tables.
3. Give the book API and Better Auth separate restricted runtime roles. For example, after applying both migrations as the owner:

   ```sql
   CREATE ROLE readflow_app LOGIN PASSWORD 'use-a-unique-password';
   GRANT USAGE ON SCHEMA public TO readflow_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON public.readflow_books TO readflow_app;

   CREATE ROLE readflow_auth_app LOGIN PASSWORD 'use-a-different-unique-password';
   GRANT USAGE ON SCHEMA better_auth TO readflow_auth_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA better_auth TO readflow_auth_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA better_auth
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO readflow_auth_app;
   ```

   Set `BETTER_AUTH_DATABASE_URL` to this role's connection string. Keep `DATABASE_URL` as a separate restricted role for `public.readflow_books`.
4. Create a Google OAuth client and add these **Authorized redirect URIs**:

   ```text
   http://localhost:3000/api/auth/callback/google
   https://readflow.thinkzone.tech/api/auth/callback/google
   https://readzone.vercel.app/api/auth/callback/google
   ```

   Set its client ID in `GOOGLE_CLIENT_ID` and secret in `GOOGLE_CLIENT_SECRET`. The production host allowlist in `src/lib/auth/server.ts` contains these two domains. Add a hostname there and to the Google OAuth client if another deployment needs sign-in.
5. Set the feature flags below to `true` and restart Next.js:

   ```dotenv
   NEXT_PUBLIC_BETTER_AUTH_ENABLED=true
   NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true
   NEXT_PUBLIC_READFLOW_REMOTE_STORAGE_ENABLED=true
   ```

   Email/password sign-in works with Better Auth configured. The Google button is shown only when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.
6. If cloud book storage is enabled, create a private Neon Object Storage bucket named `readflow-books` in `us-east-2` if it does not already exist. Create an S3 credential scoped to `storage:read` and `storage:write`, then set the `READFLOW_STORAGE_*` values in `.env.local`.

Generate a Better Auth secret and never commit `.env.local`:

```bash
openssl rand -base64 32
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_DATABASE_URL` | Postgres connection for the `better_auth` schema; use a restricted runtime role. |
| `BETTER_AUTH_SECRET` | Server-only signing/encryption secret, at least 32 characters. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Server-side Google OAuth client credentials. |
| `DATABASE_URL` | Restricted Postgres connection for `public.readflow_books`. |
| `READFLOW_STORAGE_ENDPOINT` | ThinkZone branch's Neon Object Storage S3 endpoint. |
| `READFLOW_STORAGE_REGION` | `us-east-2` for the selected project. |
| `READFLOW_STORAGE_ACCESS_KEY_ID` / `READFLOW_STORAGE_SECRET_ACCESS_KEY` | Scoped S3 credential for private object access. |
| `READFLOW_STORAGE_BUCKET` | `readflow-books`. |
| `NEXT_PUBLIC_BETTER_AUTH_ENABLED` | Turns on account UI and the Better Auth client. |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | Shows the Google sign-in button. |
| `NEXT_PUBLIC_READFLOW_REMOTE_STORAGE_ENABLED` | Turns on app sync and remote book endpoints. |

### Vercel and AWS Amplify

Set `BETTER_AUTH_DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in each deployment's server environment. Also set the three `NEXT_PUBLIC_*` flags above. Set the existing `DATABASE_URL` and `READFLOW_STORAGE_*` credentials if that deployment should use the cloud library.

AWS Amplify reserves environment variable names beginning with `AWS`; the app uses `READFLOW_STORAGE_*` instead. `amplify.yml` writes only the Google client ID, storage location, and public feature flags to `.env.production` before the Next.js build. Keep database URLs, `BETTER_AUTH_SECRET`, the Google client secret, and the storage keys in Amplify's secret store. The server reads Gen 1 Hosting secrets from Amplify's `process.env.secrets` JSON and also accepts direct runtime environment variables.

## Accounts and existing cloud books

Better Auth creates its own accounts and sessions in the ReadFlow database; it does not use Neon Auth. Existing Neon Auth users and sessions do not migrate automatically. Existing `readflow_books` rows and stored objects remain untouched, but their owner IDs refer to the old Neon Auth users, so they will not appear under newly created Better Auth accounts unless an explicit account and owner-ID migration is performed. Existing local browser libraries remain available.

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
- Sign in with Better Auth and sync account-owned book text and reading state through private Neon Object Storage.

## Narration and companion behavior

Narration uses the browser's Speech Synthesis API. It plays text aloud but does not create or export an MP3 or reusable audiobook file. Available voices and playback behavior depend on the browser and operating system.

The reading companion is a local text search, not a hosted language model or semantic RAG system. It searches the current book and reports a matching passage; it does not generate summaries, flashcards, or quizzes.

## Data and privacy

Extracted book text and reading data are stored in IndexedDB for offline reading. Reader preferences are stored in versioned local storage. The original PDF or EPUB is not retained after extraction. When cloud storage is enabled, extracted text is stored in a private object owned by the signed-in Better Auth user; metadata and reading state are stored in `public.readflow_books` with owner-filtered server queries. A sign-out hides remote account caches from the active library. Removing a cloud book deletes its remote row/object and its local cache.

Remote API routes verify the Better Auth session server-side and include the authenticated user ID in every database read, update, and delete. Never expose `BETTER_AUTH_DATABASE_URL`, `BETTER_AUTH_SECRET`, `DATABASE_URL`, Google client secrets, or S3 credentials through a `NEXT_PUBLIC_` variable.

## Current limitations

- Scanned PDFs without an embedded text layer need OCR; OCR is not connected.
- The app does not bypass DRM or copy protection.
- Cloud uploads currently accept extracted book JSON under 4 MiB per book; larger books remain local.
- Hosted AI/RAG, generated audio, billing, analytics, and admin tools are not connected.
- Library search covers titles and authors; in-book search covers the open chapter.

## Project structure

- `src/app/` — Next.js application shell, auth page, and API routes.
- `src/components/readflow-app.tsx` — dashboard, library, reader, narration controls, bookmarks, preferences, and cloud actions.
- `src/components/auth-boundary.tsx` — Better Auth session state for client components.
- `src/lib/auth/` — Better Auth client and server configuration.
- `src/lib/server/remote-books.ts` — owner-scoped Postgres and private S3 access.
- `src/lib/import-book.ts` — browser-side PDF.js and EPUB ZIP extraction.
- `src/lib/storage.ts` — IndexedDB book records and local preferences.
- `src/lib/sentences.ts` — sentence segmentation and reading-time formatting helpers.
- `src/lib/types.ts` — book, chapter, bookmark, and preference models.
- `db/migrations/` — ReadFlow-owned database schema changes.
- `scripts/copy-pdf-worker.mjs` — prepares PDF.js's worker for Next.js public assets.
