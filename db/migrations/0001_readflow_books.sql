-- Account-scoped ReadFlow library records. Extracted book chapters are stored
-- as private JSON objects in Neon Object Storage. Auth identities live in the
-- separate Managed Auth database, so owner_id is validated by the server API.
CREATE TABLE IF NOT EXISTS public.readflow_books (
  id text NOT NULL,
  owner_id uuid NOT NULL,
  title text NOT NULL,
  author text NOT NULL DEFAULT 'Unknown author',
  format text NOT NULL CHECK (format IN ('PDF', 'EPUB')),
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  word_count integer NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  page_count integer CHECK (page_count IS NULL OR page_count >= 0),
  book_data jsonb NOT NULL,
  content_key text NOT NULL,
  progress_chapter_id text,
  progress_paragraph_id text,
  progress_percent real NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  listened_seconds integer NOT NULL DEFAULT 0 CHECK (listened_seconds >= 0),
  favorite boolean NOT NULL DEFAULT false,
  bookmarks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS readflow_books_owner_updated_idx
  ON public.readflow_books (owner_id, updated_at DESC);
