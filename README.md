# ReadFlow AI

ReadFlow is a local-first PDF and EPUB reading workspace. It extracts text in the browser, organizes books into a personal library, and reads sentences aloud with synchronized highlighting.

## Project status

This is a functional local MVP. It does not require an account, API key, or server-side database. Books and reading data are stored in the current browser profile, so they do not sync between devices.

## Run locally

Requirements: Node.js 20.9 or later and npm. No `.env` file is required.

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

## What works

- Import multiple PDF or EPUB files by file picker or drag and drop. Files must be under 75 MB and pass a basic file-signature check.
- Extract PDF text page by page, with heuristic chapter headings and source page references. Extract EPUB metadata and chapters in spine order.
- Search the library by title or author, and search within the current reader chapter.
- Filter books by reading status or favorite, choose a grid or list view, and remove books from the browser.
- Read a chapter, navigate the table of contents, or click a sentence to start narration from that point.
- Use speech voices available from the browser or operating system. Adjust speed and volume; the active sentence is highlighted as it is spoken.
- Save narration progress, bookmarks, and notes. Reopen a book to continue from its last narrated sentence.
- Adjust text size, line spacing, high contrast, and light or dark appearance.
- Ask a question about the current book. The companion uses local keyword matching and returns a matching passage with its chapter and PDF page when available.

## Narration and companion behavior

Narration uses the browser’s Speech Synthesis API. It plays text aloud but does not create or export an MP3 or reusable audiobook file. The available voices and playback behavior depend on the browser and operating system.

The reading companion is a local text search, not a hosted language model or semantic RAG system. It searches the current book and reports a matching passage; it does not generate summaries, flashcards, or quizzes.

## Data and privacy

Extracted book text, metadata, bookmarks, progress, and listening totals are stored in IndexedDB. Reader preferences are stored in versioned local storage. The original PDF or EPUB is not retained after extraction. Removing a book or clearing the library deletes its extracted text and associated reading data from this browser.

Browser site-data cleanup also removes the local library. Browser-provided speech voices may have their own processing behavior, depending on the voice and operating system.

## Current limitations

- Scanned PDFs without an embedded text layer need OCR; OCR is not connected.
- The app does not bypass DRM or copy protection.
- There is no account system, cloud sync, hosted file storage, generated audio storage, subscription billing, or admin dashboard.
- Hosted AI/RAG, multi-book questions, summaries, flashcards, and quizzes are not connected.
- Library search covers titles and authors; in-book search covers the open chapter.

## Project structure

- `src/app/` — Next.js application shell, global styles, metadata, and icon.
- `src/components/readflow-app.tsx` — dashboard, library, reader, narration controls, bookmarks, and preferences.
- `src/lib/import-book.ts` — browser-side PDF.js and EPUB ZIP extraction.
- `src/lib/storage.ts` — IndexedDB book records and local preferences.
- `src/lib/sentences.ts` — sentence segmentation and reading-time formatting helpers.
- `src/lib/types.ts` — book, chapter, bookmark, and preference models.
- `scripts/copy-pdf-worker.mjs` — prepares PDF.js’s worker for Next.js public assets.

## Hosted integrations

Authentication, OCR, cloud storage and sync, generated audio, hosted AI/RAG, billing, and analytics need server-side services, provider credentials, and deployment configuration. They are not implemented in this local MVP; the Preferences page reports the services as disconnected rather than using sample data.
