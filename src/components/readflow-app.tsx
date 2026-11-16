"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudUpload,
  FileText,
  Heart,
  Headphones,
  Highlighter,
  LibraryBig,
  LogIn,
  LogOut,
  List,
  LoaderCircle,
  Menu,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useAppAuth } from "@/components/auth-boundary";
import { importBook } from "@/lib/import-book";
import { splitSentences, estimatedDuration, formatDuration } from "@/lib/sentences";
import { getBooks, getPreferences, removeBook, saveBook, savePreferences } from "@/lib/storage";
import { DEFAULT_PREFERENCES, type AppPreferences, type BookChapter, type BookRecord, type Bookmark as BookBookmark } from "@/lib/types";

type Page = "dashboard" | "library" | "bookmarks" | "settings" | "reader";
type ShelfFilter = "all" | "in-progress" | "complete" | "favorites";
type ReaderSentence = {
  chapterId: string;
  chapterTitle: string;
  paragraphId: string;
  paragraphIndex: number;
  sentenceIndex: number;
  sentence: string;
  page?: number;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const COVER_TONES = ["cover-lilac", "cover-sand", "cover-sage", "cover-rose", "cover-blue", "cover-amber"];
const REMOTE_STORAGE_ENABLED = process.env.NEXT_PUBLIC_READFLOW_REMOTE_STORAGE_ENABLED === "true";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function totalWords(book: BookRecord) {
  return book.chapters.reduce((sum, chapter) => sum + chapter.paragraphs.reduce((count, paragraph) => count + paragraph.text.split(/\s+/).filter(Boolean).length, 0), 0);
}

function makeQueue(book: BookRecord, chapter: BookChapter, paragraphId?: string, sentenceIndex = 0): ReaderSentence[] {
  const queue: ReaderSentence[] = [];
  chapter.paragraphs.forEach((paragraph, paragraphIndex) => {
    splitSentences(paragraph.text).forEach((sentence, index) => {
      queue.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        paragraphId: paragraph.id,
        paragraphIndex,
        sentenceIndex: index,
        sentence,
        page: paragraph.page,
      });
    });
  });
  if (!paragraphId) return queue;
  const targetIndex = queue.findIndex((item) => item.paragraphId === paragraphId && item.sentenceIndex === sentenceIndex);
  return targetIndex > 0 ? queue.slice(targetIndex) : queue;
}

function BookCover({ book, compact = false }: { book: BookRecord; compact?: boolean }) {
  const tone = COVER_TONES[(book.title.length + book.wordCount) % COVER_TONES.length];
  return (
    <div className={`book-cover ${tone}${compact ? " book-cover-compact" : ""}`} aria-label={`${book.title} cover`}>
      <span className="cover-mark"><BookOpen size={compact ? 15 : 17} strokeWidth={1.8} /></span>
      <span className="cover-title">{book.title}</span>
      <span className="cover-author">{book.author}</span>
      <span className="cover-spine" />
    </div>
  );
}

function BookCard({
  book,
  list = false,
  onOpen,
  onFavorite,
  onDelete,
  onUpload,
  canUpload,
}: {
  book: BookRecord;
  list?: boolean;
  onOpen: (book: BookRecord) => void;
  onFavorite: (book: BookRecord) => void;
  onDelete: (book: BookRecord) => void;
  onUpload: (book: BookRecord) => void;
  canUpload: boolean;
}) {
  return (
    <article className={`book-card${list ? " book-card-list" : ""}`}>
      <button className="book-card-open" onClick={() => onOpen(book)} aria-label={`Open ${book.title}`}>
        <BookCover book={book} />
      </button>
      <div className="book-card-info">
        <div className="book-card-heading">
          <button className="book-title-button" onClick={() => onOpen(book)}>{book.title}</button>
          <button className={`icon-button subtle ${book.favorite ? "is-favorite" : ""}`} aria-label={book.favorite ? "Remove from favorites" : "Add to favorites"} onClick={() => onFavorite(book)}>
            <Heart size={17} fill={book.favorite ? "currentColor" : "none"} />
          </button>
        </div>
        <p className="book-author">{book.author}</p>
        <div className="book-meta-line">
          <span>{book.format}</span><span className="meta-dot" />
          <span>{formatDuration(estimatedDuration(book.wordCount))}</span>
          {book.remoteStored && <><span className="meta-dot" /><span className="cloud-synced-label">Synced</span></>}
        </div>
        <div className="book-progress-row">
          <div className="progress-track"><span style={{ width: `${book.progressPercent}%` }} /></div>
          <span>{Math.round(book.progressPercent)}%</span>
        </div>
        <div className="book-card-footer">
          <button className="text-link" onClick={() => onOpen(book)}>{book.progressPercent > 0 ? "Continue reading" : "Start reading"}<ArrowRight size={14} /></button>
          {canUpload && !book.remoteStored && <button className="icon-button subtle cloud-upload-button" aria-label={`Upload ${book.title} to cloud storage`} title="Upload this book to your account" onClick={() => onUpload(book)}><CloudUpload size={15} /></button>}
          <button className="icon-button subtle danger-on-hover" aria-label={`Delete ${book.title}`} onClick={() => onDelete(book)}><Trash2 size={15} /></button>
        </div>
      </div>
    </article>
  );
}

function StatCard({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: string }) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </article>
  );
}

function ReadflowApp() {
  const auth = useAppAuth();
  const cloudEnabled = auth.enabled && REMOTE_STORAGE_ENABLED;
  const [books, setBooks] = useState<BookRecord[]>([]);
  const booksRef = useRef<BookRecord[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const activeBookIdRef = useRef<string | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [activeParagraphId, setActiveParagraphId] = useState<string | null>(null);
  const [activeSentenceKey, setActiveSentenceKey] = useState("");
  const [currentSentence, setCurrentSentence] = useState<ReaderSentence | null>(null);
  const queueRef = useRef<ReaderSentence[]>([]);
  const queueIndexRef = useRef(0);
  const shouldPlayRef = useRef(false);
  const speakNextRef = useRef<() => void>(() => {});
  const [isPlaying, setIsPlaying] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importingName, setImportingName] = useState("");
  const [importError, setImportError] = useState("");
  const [search, setSearch] = useState("");
  const [readerSearch, setReaderSearch] = useState("");
  const [filter, setFilter] = useState<ShelfFilter>("all");
  const [listView, setListView] = useState(false);
  const [toast, setToast] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState<{ text: string; citation: string } | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cloudSyncTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  useEffect(() => {
    activeBookIdRef.current = activeBookId;
  }, [activeBookId]);

  useEffect(() => {
    if (!ready || !auth.enabled || auth.loading) return;
    const userId = auth.user?.id;
    const active = booksRef.current.find((book) => book.id === activeBookIdRef.current);
    if (active?.remoteStored && active.remoteOwnerId !== userId) {
      shouldPlayRef.current = false;
      window.speechSynthesis?.cancel();
      setIsPlaying(false);
      setActiveBookId(null);
      setPage("dashboard");
    }
    const scoped = booksRef.current.filter((book) => !book.remoteStored || book.remoteOwnerId === userId);
    booksRef.current = scoped;
    setBooks(scoped);
    if (!userId || !REMOTE_STORAGE_ENABLED) return;

    let cancelled = false;
    void fetch("/api/books", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return null;
      return await response.json() as { books: BookRecord[] };
    }).then(async (result) => {
      if (!result || cancelled) return;
      const cache = new Map(booksRef.current.filter((book) => book.remoteOwnerId === userId).map((book) => [book.id, book]));
      const remoteBooks = result.books.map((remote) => {
        const cached = cache.get(remote.id);
        return {
          ...remote,
          chapters: cached?.chapters ?? [],
          lastOpenedAt: remote.lastOpenedAt ?? cached?.lastOpenedAt,
        };
      });
      const localBooks = booksRef.current.filter((book) => !book.remoteStored);
      const merged = [...remoteBooks, ...localBooks].sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt));
      booksRef.current = merged;
      setBooks(merged);
      await Promise.all(remoteBooks.map((book) => saveBook(book)));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [auth.enabled, auth.loading, auth.user?.id, ready]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBooks(), Promise.resolve(getPreferences())]).then(([storedBooks, storedPreferences]) => {
      if (cancelled) return;
      const sorted = storedBooks.sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt));
      booksRef.current = sorted;
      setBooks(sorted);
      setPreferences(storedPreferences);
      setReady(true);
    }).catch(() => setReady(true));

    const updateVoices = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      updateVoices();
      window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPage("library");
        window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".global-search input")?.focus());
      }
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        if (!importingName) setImportOpen(false);
        setNoteModalOpen(false);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [importingName]);

  const authUserId = auth.user?.id;
  const visibleBooks = useMemo(() => auth.enabled
    ? books.filter((book) => !book.remoteStored || (authUserId && book.remoteOwnerId === authUserId))
    : books, [auth.enabled, authUserId, books]);
  const activeBook = visibleBooks.find((book) => book.id === activeBookId) ?? null;
  const activeChapter = activeBook?.chapters.find((chapter) => chapter.id === activeChapterId) ?? activeBook?.chapters[0] ?? null;
  const activeParagraph = activeChapter?.paragraphs.find((paragraph) => paragraph.id === activeParagraphId) ?? activeChapter?.paragraphs[0] ?? null;
  const saveBookChange = useCallback((bookId: string, change: (book: BookRecord) => BookRecord) => {
    const nextBooks = booksRef.current.map((book) => book.id === bookId ? change(book) : book);
    booksRef.current = nextBooks;
    setBooks(nextBooks);
    const changed = nextBooks.find((book) => book.id === bookId);
    if (changed) {
      void saveBook(changed);
      if (cloudEnabled && auth.user && changed.remoteStored && changed.remoteOwnerId === auth.user.id) {
        const previous = cloudSyncTimers.current.get(bookId);
        if (previous) window.clearTimeout(previous);
        const timer = window.setTimeout(() => {
          void fetch(`/api/books/${encodeURIComponent(bookId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              progressChapterId: changed.progressChapterId,
              progressParagraphId: changed.progressParagraphId,
              progressPercent: changed.progressPercent,
              listenedSeconds: changed.listenedSeconds,
              favorite: changed.favorite,
              bookmarks: changed.bookmarks,
              lastOpenedAt: changed.lastOpenedAt,
            }),
          }).catch(() => undefined);
          cloudSyncTimers.current.delete(bookId);
        }, 1400);
        cloudSyncTimers.current.set(bookId, timer);
      }
    }
  }, [auth.user, cloudEnabled]);

  const changePreference = useCallback(<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    savePreferences(next);
  }, [preferences]);

  const stopNarration = useCallback(() => {
    shouldPlayRef.current = false;
    window.speechSynthesis?.cancel();
    queueRef.current = [];
    queueIndexRef.current = 0;
    setCurrentSentence(null);
    setIsPlaying(false);
  }, []);

  const openBook = useCallback(async (book: BookRecord, chapterId?: string, paragraphId?: string) => {
    let bookToOpen = book;
    const userId = auth.user?.id;
    if (userId && book.remoteStored && book.remoteOwnerId === userId && !book.chapters.length && cloudEnabled) {
      setToast("Loading your book from cloud storage…");
      try {
        const response = await fetch(`/api/books/${encodeURIComponent(book.id)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Cloud book could not be loaded.");
        const data = await response.json() as { book: BookRecord };
        bookToOpen = { ...data.book, remoteStored: true, remoteOwnerId: userId };
        const nextBooks = booksRef.current.map((item) => item.id === book.id ? bookToOpen : item);
        booksRef.current = nextBooks;
        setBooks(nextBooks);
        await saveBook(bookToOpen);
      } catch {
        setToast("Couldn’t load this book from cloud storage. Check your connection and try again.");
        return;
      }
    }
    if (!bookToOpen.chapters.length) {
      setToast("This book has no cached text yet. Reconnect to cloud storage to open it.");
      return;
    }
    if (activeBookId && activeBookId !== book.id) stopNarration();
    const chapter = bookToOpen.chapters.find((item) => item.id === chapterId)
      ?? bookToOpen.chapters.find((item) => item.id === bookToOpen.progressChapterId)
      ?? bookToOpen.chapters[0];
    const paragraph = chapter?.paragraphs.find((item) => item.id === paragraphId)
      ?? chapter?.paragraphs.find((item) => item.id === bookToOpen.progressParagraphId)
      ?? chapter?.paragraphs[0];
    setActiveBookId(bookToOpen.id);
    setActiveChapterId(chapter?.id ?? null);
    setActiveParagraphId(paragraph?.id ?? null);
    setPage("reader");
    saveBookChange(bookToOpen.id, (current) => ({ ...current, lastOpenedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    setMobileNavOpen(false);
  }, [activeBookId, auth.user, cloudEnabled, saveBookChange, stopNarration]);

  const speakNext = useCallback(() => {
    const target = queueRef.current[queueIndexRef.current];
    if (!target || !shouldPlayRef.current) {
      if (!target && shouldPlayRef.current) {
        const book = booksRef.current.find((item) => item.id === activeBookId);
        const lastSentence = queueRef.current.at(-1);
        const lastChapter = book?.chapters.at(-1);
        const lastParagraph = lastChapter?.paragraphs.at(-1);
        if (book && lastSentence && lastChapter?.id === lastSentence.chapterId && lastParagraph?.id === lastSentence.paragraphId && splitSentences(lastParagraph.text).length - 1 === lastSentence.sentenceIndex) {
          saveBookChange(book.id, (current) => ({ ...current, progressPercent: 100, progressChapterId: lastSentence.chapterId, progressParagraphId: lastSentence.paragraphId, updatedAt: new Date().toISOString() }));
        }
        shouldPlayRef.current = false;
        setIsPlaying(false);
      }
      return;
    }
    setActiveChapterId(target.chapterId);
    setActiveParagraphId(target.paragraphId);
    setActiveSentenceKey(`${target.paragraphId}:${target.sentenceIndex}`);
    setCurrentSentence(target);
    setIsPlaying(true);
    const utterance = new SpeechSynthesisUtterance(target.sentence);
    const selectedVoice = voices.find((voice) => voice.voiceURI === preferences.voiceURI);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = preferences.speed;
    utterance.volume = preferences.volume;
    utterance.onend = () => {
      if (!shouldPlayRef.current) return;
      const book = booksRef.current.find((item) => item.id === activeBookId);
      if (book) {
        const previousWords = book.chapters.reduce((sum, chapter) => {
          if (chapter.id === target.chapterId) return sum + chapter.paragraphs.slice(0, target.paragraphIndex).reduce((count, paragraph) => count + paragraph.text.split(/\s+/).filter(Boolean).length, 0);
          if (book.chapters.findIndex((item) => item.id === chapter.id) < book.chapters.findIndex((item) => item.id === target.chapterId)) return sum + chapter.paragraphs.reduce((count, paragraph) => count + paragraph.text.split(/\s+/).filter(Boolean).length, 0);
          return sum;
        }, 0);
        const sentenceWords = target.sentence.split(/\s+/).filter(Boolean).length;
        const percent = Math.min(99, ((previousWords + sentenceWords) / Math.max(1, totalWords(book))) * 100);
        saveBookChange(book.id, (current) => ({
          ...current,
          progressPercent: Math.max(current.progressPercent, percent),
          progressChapterId: target.chapterId,
          progressParagraphId: target.paragraphId,
          listenedSeconds: current.listenedSeconds + Math.max(1, Math.round(sentenceWords * 60 / (170 * preferences.speed))),
          updatedAt: new Date().toISOString(),
        }));
      }
      queueIndexRef.current += 1;
      if (shouldPlayRef.current) speakNextRef.current();
    };
    utterance.onerror = (event) => {
      if (event.error !== "canceled" && event.error !== "interrupted") {
        shouldPlayRef.current = false;
        setIsPlaying(false);
        setToast("Narration stopped. Try choosing another voice in settings.");
      }
    };
    window.speechSynthesis.speak(utterance);
  }, [activeBookId, preferences, saveBookChange, voices]);

  useEffect(() => {
    speakNextRef.current = speakNext;
  }, [speakNext]);

  const startPlayback = useCallback((book: BookRecord, chapter: BookChapter, paragraphId?: string, sentenceIndex = 0) => {
    if (!("speechSynthesis" in window)) {
      setToast("This browser doesn’t support spoken narration.");
      return;
    }
    const queue = makeQueue(book, chapter, paragraphId, sentenceIndex);
    if (!queue.length) {
      setToast("This section doesn’t contain readable text.");
      return;
    }
    window.speechSynthesis.cancel();
    queueRef.current = queue;
    queueIndexRef.current = 0;
    shouldPlayRef.current = true;
    setActiveBookId(book.id);
    setActiveChapterId(chapter.id);
    setPage("reader");
    speakNext();
  }, [speakNext]);

  const togglePlayback = useCallback(() => {
    if (!activeBook || !activeChapter) return;
    if (!("speechSynthesis" in window)) {
      setToast("This browser doesn’t support spoken narration.");
      return;
    }
    if (isPlaying) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
      return;
    }
    if (window.speechSynthesis?.paused && queueRef.current.length) {
      window.speechSynthesis.resume();
      setIsPlaying(true);
      return;
    }
    startPlayback(activeBook, activeChapter, activeParagraph?.id);
  }, [activeBook, activeChapter, activeParagraph, isPlaying, startPlayback]);

  const skipSentence = useCallback((direction: -1 | 1) => {
    if (!queueRef.current.length) {
      togglePlayback();
      return;
    }
    const nextIndex = Math.max(0, Math.min(queueRef.current.length - 1, queueIndexRef.current + direction));
    window.speechSynthesis.cancel();
    queueIndexRef.current = nextIndex;
    shouldPlayRef.current = true;
    speakNext();
  }, [speakNext, togglePlayback]);

  const changeChapter = useCallback((direction: -1 | 1) => {
    if (!activeBook || !activeChapter) return;
    const currentIndex = activeBook.chapters.findIndex((chapter) => chapter.id === activeChapter.id);
    const nextChapter = activeBook.chapters[currentIndex + direction];
    if (!nextChapter) return;
    const shouldResume = isPlaying || window.speechSynthesis?.paused;
    window.speechSynthesis?.cancel();
    shouldPlayRef.current = false;
    queueRef.current = [];
    queueIndexRef.current = 0;
    setCurrentSentence(null);
    setIsPlaying(false);
    setActiveChapterId(nextChapter.id);
    setActiveParagraphId(nextChapter.paragraphs[0]?.id ?? null);
    setActiveSentenceKey("");
    if (shouldResume) startPlayback(activeBook, nextChapter);
  }, [activeBook, activeChapter, isPlaying, startPlayback]);

  useEffect(() => {
    if (page !== "reader" || !activeSentenceKey) return;
    const escapedKey = activeSentenceKey.replace(/"/g, "\\\"");
    document.querySelector(`[data-sentence-key="${escapedKey}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSentenceKey, page]);

  const filteredBooks = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return visibleBooks.filter((book) => {
      const matchesSearch = !normalized || `${book.title} ${book.author}`.toLowerCase().includes(normalized);
      const matchesFilter = filter === "all"
        || (filter === "favorites" && book.favorite)
        || (filter === "complete" && book.progressPercent >= 99)
        || (filter === "in-progress" && book.progressPercent > 0 && book.progressPercent < 99);
      return matchesSearch && matchesFilter;
    });
  }, [visibleBooks, filter, search]);

  const totalListeningSeconds = visibleBooks.reduce((total, book) => total + book.listenedSeconds, 0);
  const totalListeningHours = totalListeningSeconds > 0 ? (totalListeningSeconds / 3600).toFixed(1) : "0";
  const recentBooks = [...visibleBooks].sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)).slice(0, 3);
  const continueBook = visibleBooks.find((book) => book.progressPercent > 0 && book.progressPercent < 100) ?? recentBooks[0] ?? null;

  async function createCloudCopy(book: BookRecord) {
    const response = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book }),
    });
    const result = await response.json().catch(() => ({})) as { book?: BookRecord; error?: string };
    if (!response.ok || !result.book) return { error: result.error ?? "Cloud storage is unavailable." };
    return { book: { ...result.book, remoteStored: true, remoteOwnerId: auth.user?.id } as BookRecord };
  }

  async function uploadBook(book: BookRecord) {
    if (!cloudEnabled || !auth.user) return;
    setToast(`Uploading “${book.title}” to your private library…`);
    try {
      const result = await createCloudCopy(book);
      if (!result.book) {
        setToast(result.error ?? "Cloud upload failed. Your local copy is unchanged.");
        return;
      }
      const next = booksRef.current.map((item) => item.id === book.id ? { ...book, ...result.book, chapters: book.chapters } : item);
      booksRef.current = next;
      setBooks(next);
      await saveBook(next.find((item) => item.id === book.id)!);
      setToast(`“${book.title}” is now in your cloud library.`);
    } catch {
      setToast("Cloud upload failed. Your local copy is unchanged.");
    }
  }

  async function processFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;
    setImportError("");
    setImportOpen(true);
    let failed = false;
    for (const file of selected) {
      setImportingName(file.name);
      try {
        const newBook = await importBook(file);
        const duplicate = booksRef.current.find((book) => book.fileName === newBook.fileName && book.fileSize === newBook.fileSize);
        if (duplicate) {
          setToast(`${newBook.title} is already in your library.`);
          continue;
        }
        let bookToSave = newBook;
        let cloudError = "";
        if (cloudEnabled && auth.user) {
          try {
            const result = await createCloudCopy(newBook);
            if (result.book) bookToSave = result.book;
            else cloudError = result.error ?? "Cloud sync is unavailable.";
          } catch {
            cloudError = "Cloud sync is unavailable.";
          }
        }
        await saveBook(bookToSave);
        const next = [bookToSave, ...booksRef.current];
        booksRef.current = next;
        setBooks(next);
        setToast(cloudError
          ? `“${newBook.title}” is saved on this device. ${cloudError}`
          : bookToSave.remoteStored ? `“${newBook.title}” is saved in your cloud library.` : `“${newBook.title}” is ready to read.`);
      } catch (error) {
        failed = true;
        setImportError(error instanceof Error ? error.message : "We couldn’t process this file.");
        break;
      }
    }
    setImportingName("");
    if (!failed) setImportOpen(false);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void processFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files.length) void processFiles(event.dataTransfer.files);
  }

  function toggleFavorite(book: BookRecord) {
    saveBookChange(book.id, (current) => ({ ...current, favorite: !current.favorite, updatedAt: new Date().toISOString() }));
  }

  async function deleteBook(book: BookRecord) {
    if (!window.confirm(book.remoteStored
      ? `Remove “${book.title}” and its saved reading data from your account and this browser?`
      : `Remove “${book.title}” and its saved reading data from this browser?`)) return;
    if (book.remoteStored && auth.user?.id === book.remoteOwnerId && cloudEnabled) {
      try {
        const response = await fetch(`/api/books/${encodeURIComponent(book.id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Could not remove the cloud copy.");
      } catch {
        setToast("Couldn’t remove the cloud copy. Your book is still in the library.");
        return;
      }
    }
    await removeBook(book.id);
    const next = booksRef.current.filter((item) => item.id !== book.id);
    booksRef.current = next;
    setBooks(next);
    if (activeBookId === book.id) {
      stopNarration();
      setActiveBookId(null);
      setPage("library");
    }
    setToast(book.remoteStored ? "Book removed from your account and this browser." : "Book removed from this browser.");
  }

  function saveBookmark(note = "") {
    if (!activeBook || !activeChapter || !activeParagraph) return;
    const bookmark: BookBookmark = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      chapterId: activeChapter.id,
      paragraphId: activeParagraph.id,
      quote: currentSentence?.sentence ?? activeParagraph.text,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    saveBookChange(activeBook.id, (current) => ({ ...current, bookmarks: [bookmark, ...current.bookmarks], updatedAt: new Date().toISOString() }));
    setNoteDraft("");
    setNoteModalOpen(false);
    setToast("Saved to your bookmarks.");
  }

  function jumpToBookmark(book: BookRecord, bookmark: BookBookmark) {
    stopNarration();
    openBook(book, bookmark.chapterId, bookmark.paragraphId);
  }

  function answerBookQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeBook || !assistantQuestion.trim()) return;
    const query = assistantQuestion.trim();
    const terms = [...new Set(query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((term) => term.length > 2))];
    const candidates: Array<{ score: number; text: string; citation: string }> = [];
    for (const chapter of activeBook.chapters) {
      for (const paragraph of chapter.paragraphs) {
        for (const sentence of splitSentences(paragraph.text)) {
          const lower = sentence.toLowerCase();
          const score = terms.reduce((count, term) => count + (lower.includes(term) ? 1 : 0), 0);
          if (score > 0) candidates.push({
            score,
            text: sentence,
            citation: `${activeBook.title} · ${chapter.title}${paragraph.page ? ` · page ${paragraph.page}` : ""}`,
          });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const match = candidates[0];
    if (match) {
      setAssistantAnswer({
        text: `Here’s the closest passage in this book: “${match.text}”\n\nI found it by matching your question to the book text stored in this browser.`,
        citation: match.citation,
      });
    } else {
      setAssistantAnswer({
        text: "I couldn’t find a passage that matches those terms in this book. Try a phrase, name, or keyword used by the author.",
        citation: "No matching passage found",
      });
    }
  }

  function explainSelection() {
    const selection = window.getSelection()?.toString().trim();
    if (!selection) {
      setToast("Select a passage in the reader first.");
      return;
    }
    setAssistantQuestion(`Explain this passage: ${selection.slice(0, 260)}`);
    document.querySelector(".assistant-input")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function cyclePlaybackSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(preferences.speed) + 1) % SPEEDS.length];
    changePreference("speed", next);
    if (isPlaying) {
      const target = queueRef.current[queueIndexRef.current];
      if (target && activeBook && activeChapter) startPlayback(activeBook, activeChapter, target.paragraphId, target.sentenceIndex);
    }
  }

  function setReaderChapter(chapter: BookChapter) {
    stopNarration();
    setActiveChapterId(chapter.id);
    setActiveParagraphId(chapter.paragraphs[0]?.id ?? null);
    setActiveSentenceKey("");
    setAssistantAnswer(null);
  }

  function changePage(nextPage: Page) {
    setPage(nextPage);
    setMobileNavOpen(false);
    if (nextPage !== "reader") setReaderSearch("");
  }

  const chaptersForReader = activeBook?.chapters ?? [];
  const chapterIndex = activeChapter ? chaptersForReader.findIndex((chapter) => chapter.id === activeChapter.id) : -1;
  const matchingParagraphCount = activeChapter?.paragraphs.filter((paragraph) => paragraph.text.toLowerCase().includes(readerSearch.toLowerCase())).length ?? 0;

  if (!ready || (auth.enabled && auth.loading)) {
    return <div className="app-loading"><span className="brand-mark"><BookOpen size={19} /></span><LoaderCircle className="loading-spinner" size={20} />Preparing your reading space…</div>;
  }

  return (
    <main className={`app-shell${preferences.theme === "dark" ? " theme-dark" : ""}${preferences.highContrast ? " high-contrast" : ""}`}>
      <aside className={`sidebar${mobileNavOpen ? " sidebar-open" : ""}`}>
        <div className="brand-row">
          <span className="brand-mark"><BookOpen size={20} strokeWidth={2.1} /></span>
          <span className="brand-name">readflow<span>ai</span></span>
          <button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={19} /></button>
        </div>
        <div className="workspace-pill"><span className="workspace-avatar">{auth.user?.name.slice(0, 1).toUpperCase() ?? "L"}</span><span><b>{auth.user ? `${auth.user.name}’s library` : "My workspace"}</b><small>{auth.user ? "ReadFlow account" : "Personal library"}</small></span><ChevronDown size={15} /></div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={`nav-item${page === "dashboard" ? " nav-active" : ""}`} onClick={() => changePage("dashboard")}><span className="nav-icon"><Settings2 size={17} /></span>Overview</button>
          <button className={`nav-item${page === "library" ? " nav-active" : ""}`} onClick={() => changePage("library")}><span className="nav-icon"><LibraryBig size={17} /></span>My library<span className="nav-count">{visibleBooks.length || "—"}</span></button>
          <button className={`nav-item${page === "bookmarks" ? " nav-active" : ""}`} onClick={() => changePage("bookmarks")}><span className="nav-icon"><Bookmark size={17} /></span>Bookmarks<span className="nav-count">{visibleBooks.reduce((n, book) => n + book.bookmarks.length, 0) || "—"}</span></button>
        </nav>
        <div className="sidebar-label secondary-label">YOUR SPACE</div>
        <nav className="primary-nav">
          <button className={`nav-item${page === "settings" ? " nav-active" : ""}`} onClick={() => changePage("settings")}><span className="nav-icon"><Settings2 size={17} /></span>Preferences</button>
          <button className="nav-item" onClick={() => setImportOpen(true)}><span className="nav-icon"><Plus size={17} /></span>Add a book</button>
        </nav>
        <div className="sidebar-spacer" />
        {continueBook && (
          <div className="sidebar-listening">
            <div className="sidebar-listening-heading"><span className="live-dot" /> PICK UP WHERE YOU LEFT OFF</div>
            <button className="sidebar-book" onClick={() => openBook(continueBook)}>
              <BookCover book={continueBook} compact />
              <span className="sidebar-book-copy"><b>{continueBook.title}</b><small>{Math.round(continueBook.progressPercent)}% complete</small></span>
              <Play size={14} fill="currentColor" />
            </button>
          </div>
        )}
        <div className="sidebar-footer">
          <div className="privacy-note"><span className="privacy-lock">✳</span><span><b>Your library stays yours</b><small>{cloudEnabled ? "Private account and device storage." : "Books are saved on this device."}</small></span></div>
          <button className="user-row" onClick={() => changePage("settings")}><span className="user-avatar">{auth.user?.name.slice(0, 1).toUpperCase() ?? "R"}</span><span className="user-meta"><b>{auth.user?.name ?? "Reader"}</b><small>{auth.user?.email ?? "Local account"}</small></span><MoreHorizontal size={18} /></button>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><b>{page === "reader" ? activeBook?.title ?? "Reader" : page === "dashboard" ? "Overview" : page === "library" ? "My library" : page === "bookmarks" ? "Bookmarks" : "Preferences"}</b></div>
          <div className="topbar-actions">
            {page === "library" && <label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your library" aria-label="Search your library" /><kbd>⌘ K</kbd></label>}
            <button className="topbar-help" onClick={() => setToast("Import a PDF or EPUB to get started. Your files stay on this device.")}><CircleHelp size={17} /><span>Help</span></button>
            {auth.enabled && (auth.user
              ? <button className="button button-light button-small" onClick={() => { void auth.signOut(); }}><LogOut size={14} />Sign out</button>
              : <Link className="button button-light button-small" href="/auth/sign-in"><LogIn size={14} />Sign in</Link>)}
            <button className="button button-primary button-small" onClick={() => setImportOpen(true)}><Upload size={15} />Add a book</button>
          </div>
        </header>

        <div className={`page-content${page === "reader" ? " reader-page-content" : ""}`}>
          {page === "dashboard" && (
            <div className="dashboard-view">
              <section className="welcome-row">
                <div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR PERSONAL READING SPACE</div><h1>{greeting()}, reader<span className="heading-period">.</span></h1><p>Make room for a good story. Pick up where you left off or add something new.</p></div>
                <button className="button button-dark" onClick={() => setImportOpen(true)}><Plus size={17} />Add your first book</button>
              </section>

              <section className="stats-grid" aria-label="Reading statistics">
                <StatCard icon={<BookOpen size={18} />} label="Books in library" value={String(visibleBooks.length)} note={visibleBooks.length ? "Your personal collection" : "Your shelf is ready"} tone="stat-purple" />
                <StatCard icon={<Headphones size={18} />} label="Listening time" value={`${totalListeningHours}h`} note="Tracked in this browser" tone="stat-blue" />
                <StatCard icon={<Highlighter size={18} />} label="Saved passages" value={String(visibleBooks.reduce((n, book) => n + book.bookmarks.length, 0))} note="Bookmarks and notes" tone="stat-coral" />
                <StatCard icon={<Clock3 size={18} />} label="Reading streak" value={visibleBooks.some((book) => book.lastOpenedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)) ? "1 day" : "—"} note="A little reading goes far" tone="stat-mint" />
              </section>

              {continueBook ? (
                <section className="continue-card">
                  <div className="continue-art"><div className="continue-orbit orbit-one" /><div className="continue-orbit orbit-two" /><div className="continue-book-wrap"><BookCover book={continueBook} /></div><span className="continue-spark spark-one">✦</span><span className="continue-spark spark-two">✧</span></div>
                  <div className="continue-copy"><div className="continue-kicker"><span className="live-dot" /> CONTINUE YOUR JOURNEY</div><h2>Every page takes you<br />somewhere new.</h2><p>Pick up right where you left off in <strong>{continueBook.title}</strong>.</p><div className="continue-progress"><div className="progress-track"><span style={{ width: `${continueBook.progressPercent}%` }} /></div><span>{Math.round(continueBook.progressPercent)}%</span></div><button className="button button-primary" onClick={() => openBook(continueBook)}><Play size={15} fill="currentColor" />Continue reading</button></div>
                  <div className="continue-side-note"><Sparkles size={16} /><span>Your words, your pace.</span></div>
                </section>
              ) : (
                <section className="onboarding-card">
                  <div className="onboarding-visual"><div className="onboarding-book"><BookOpen size={24} /><span>YOUR NEXT<br />CHAPTER</span></div><span className="onboarding-spark onboarding-spark-a">✦</span><span className="onboarding-spark onboarding-spark-b">✧</span><span className="onboarding-orbit" /></div>
                  <div className="onboarding-copy"><div className="eyebrow"><Sparkles size={14} /> A LITTLE SPACE FOR BIG IDEAS</div><h2>Your next chapter<br />starts here.</h2><p>Bring a PDF or EPUB you love. Read it, listen along, and keep the passages worth remembering close.</p><button className="button button-primary" onClick={() => setImportOpen(true)}><Upload size={15} />Add a book to begin</button><span className="support-caption"><FileText size={13} />PDF and EPUB · up to 75 MB</span></div>
                  <div className="onboarding-footnote"><span className="privacy-lock">✳</span> Your books stay on this device</div>
                </section>
              )}

              <section className="section-block">
                <div className="section-heading"><div><div className="section-eyebrow">YOUR COLLECTION</div><h2>{visibleBooks.length ? "Recently opened" : "A shelf with potential"}</h2></div><button className="text-link" onClick={() => changePage("library")}>View library<ArrowRight size={15} /></button></div>
                {recentBooks.length ? <div className="book-grid dashboard-books">{recentBooks.map((book) => <BookCard key={book.id} book={book} onOpen={openBook} onFavorite={toggleFavorite} onDelete={deleteBook} onUpload={uploadBook} canUpload={cloudEnabled && Boolean(auth.user)} />)}</div> : <div className="empty-shelf"><div className="empty-shelf-icon"><LibraryBig size={20} /></div><div><b>Nothing on your shelf yet</b><p>When you add a book, it’ll show up here ready for your next reading session.</p></div><button className="button button-light" onClick={() => setImportOpen(true)}>Browse files<ArrowRight size={14} /></button></div>}
              </section>
              <div className="dashboard-footer-note"><span>✳</span> Thoughtful reading, made a little easier.</div>
            </div>
          )}

          {page === "library" && (
            <div className="library-view">
              <div className="page-heading-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR PERSONAL COLLECTION</div><h1>My library<span className="heading-period">.</span></h1><p>All your books, ready when you are.</p></div><button className="button button-primary" onClick={() => setImportOpen(true)}><Upload size={16} />Upload a book</button></div>
              <div className="library-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filter books">{([ ["all", "All books"], ["in-progress", "In progress"], ["complete", "Finished"], ["favorites", "Favorites"] ] as [ShelfFilter, string][]).map(([key, label]) => <button key={key} className={`filter-tab${filter === key ? " filter-tab-active" : ""}`} onClick={() => setFilter(key)} role="tab" aria-selected={filter === key}>{label}<span>{key === "all" ? visibleBooks.length : key === "favorites" ? visibleBooks.filter((book) => book.favorite).length : key === "complete" ? visibleBooks.filter((book) => book.progressPercent >= 99).length : visibleBooks.filter((book) => book.progressPercent > 0 && book.progressPercent < 99).length}</span></button>)}</div><div className="library-tools"><button className="tool-select" onClick={() => setToast("Books are sorted by most recently opened.")}><ArrowDownUp size={15} />Recently opened<ChevronDown size={14} /></button><div className="view-toggle"><button className={listView ? "" : "selected"} aria-label="Grid view" onClick={() => setListView(false)}><span className="grid-view-icon"><i /><i /><i /><i /></span></button><button className={listView ? "selected" : ""} aria-label="List view" onClick={() => setListView(true)}><List size={17} /></button></div></div></div>
              {filteredBooks.length ? <div className={`book-grid${listView ? " list-layout" : ""}`}>{filteredBooks.map((book) => <BookCard key={book.id} book={book} list={listView} onOpen={openBook} onFavorite={toggleFavorite} onDelete={deleteBook} onUpload={uploadBook} canUpload={cloudEnabled && Boolean(auth.user)} />)}</div> : <div className="library-empty"><div className="library-empty-art"><BookOpen size={29} /></div><h2>{visibleBooks.length ? "No books match this view" : "Your library is a blank page"}</h2><p>{visibleBooks.length ? "Try another filter or search for a different title." : "Add a PDF or EPUB and ReadFlow will prepare its chapters for you."}</p><button className="button button-primary" onClick={() => setImportOpen(true)}><Plus size={16} />Add a book</button></div>}
            </div>
          )}

          {page === "reader" && activeBook && activeChapter && (
            <div className="reader-layout">
              <aside className="reader-sidebar">
                <div className="reader-book-overview"><BookCover book={activeBook} compact /><div><b>{activeBook.title}</b><small>{activeBook.author}</small></div><button className="icon-button subtle" aria-label="Book options" onClick={() => setToast(`${activeBook.format} · ${activeBook.wordCount.toLocaleString()} words${activeBook.pageCount ? ` · ${activeBook.pageCount} pages` : ""}`)}><MoreHorizontal size={17} /></button></div>
                <div className="reader-sidebar-title">TABLE OF CONTENTS <span>{chaptersForReader.length}</span></div>
                <div className="chapter-list">{chaptersForReader.map((chapter, index) => <button key={chapter.id} className={`chapter-list-item${chapter.id === activeChapter.id ? " chapter-active" : ""}`} onClick={() => setReaderChapter(chapter)}><span className="chapter-number">{String(index + 1).padStart(2, "0")}</span><span className="chapter-name">{chapter.title}</span>{chapter.id === activeChapter.id && <span className="chapter-current-dot" />}</button>)}</div>
                <div className="reader-sidebar-bottom"><div className="sidebar-label">BOOK DETAILS</div><div className="book-detail-row"><span>Format</span><b>{activeBook.format}</b></div><div className="book-detail-row"><span>Length</span><b>{activeBook.wordCount.toLocaleString()} words</b></div><div className="book-detail-row"><span>Read time</span><b>{formatDuration(estimatedDuration(activeBook.wordCount))}</b></div><div className="reader-book-progress"><div className="progress-track"><span style={{ width: `${activeBook.progressPercent}%` }} /></div><span>{Math.round(activeBook.progressPercent)}% read</span></div></div>
              </aside>
              <section className="reader-main">
                <div className="reader-toolbar"><div className="reader-location"><button className="text-link" onClick={() => changePage("library")}><ArrowLeft size={14} />Library</button><span className="breadcrumb-divider">/</span><span>{activeChapter.title}</span></div><div className="reader-toolbar-actions"><label className="reader-search"><Search size={15} /><input value={readerSearch} onChange={(event) => setReaderSearch(event.target.value)} placeholder="Find in book" aria-label="Find in this book" />{readerSearch && <span className="search-result-count">{matchingParagraphCount}</span>}</label><button className="icon-button subtle" aria-label="Save bookmark" onClick={() => setNoteModalOpen(true)}><Bookmark size={17} /></button><button className="icon-button subtle" aria-label="Explain selected text" onClick={explainSelection}><Sparkles size={17} /></button></div></div>
                <div className="reader-scroll" key={activeChapter.id}>
                  <div className="reader-content">
                    <div className="reader-chapter-label">{activeBook.title}<span>•</span> Chapter {chapterIndex + 1} of {chaptersForReader.length}</div>
                    <h1>{activeChapter.title}</h1>
                    <div className="chapter-reading-meta"><span>{activeChapter.paragraphs.reduce((words, paragraph) => words + paragraph.text.split(/\s+/).filter(Boolean).length, 0).toLocaleString()} words</span><span>•</span><span>{formatDuration(estimatedDuration(activeChapter.paragraphs.reduce((words, paragraph) => words + paragraph.text.split(/\s+/).filter(Boolean).length, 0)))}</span><button className="text-link chapter-play" onClick={() => startPlayback(activeBook, activeChapter)}><Play size={13} fill="currentColor" />Listen to chapter</button></div>
                    <div className="reader-divider"><span /><BookOpen size={14} /><span /></div>
                    <div className="reader-text" style={{ fontSize: `${preferences.fontSize}px`, lineHeight: preferences.lineHeight }}>
                      {activeChapter.paragraphs.map((paragraph) => {
                        const sentences = splitSentences(paragraph.text);
                        const containsQuery = !readerSearch || paragraph.text.toLowerCase().includes(readerSearch.toLowerCase());
                        return <p key={paragraph.id} className={`${activeParagraphId === paragraph.id ? "paragraph-current" : ""}${readerSearch && containsQuery ? " paragraph-match" : ""}`}>
                          {sentences.map((sentence, index) => {
                            const sentenceKey = `${paragraph.id}:${index}`;
                            const isCurrent = activeSentenceKey === sentenceKey;
                            const dimmed = readerSearch && !containsQuery;
                            return <span key={sentenceKey} data-sentence-key={sentenceKey} className={`reader-sentence${isCurrent ? " sentence-current" : ""}${dimmed ? " sentence-dimmed" : ""}`} onClick={() => { setActiveParagraphId(paragraph.id); startPlayback(activeBook, activeChapter, paragraph.id, index); }} role="button" tabIndex={0} aria-label={`Play sentence: ${sentence.slice(0, 90)}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveParagraphId(paragraph.id); startPlayback(activeBook, activeChapter, paragraph.id, index); } }}>{sentence}{" "}</span>;
                          })}
                          {paragraph.page && <span className="page-reference">p. {paragraph.page}</span>}
                        </p>;
                      })}
                    </div>
                    {!activeChapter.paragraphs.length && <div className="chapter-empty">There isn’t readable text in this section.</div>}
                    <div className="chapter-end"><span /><span>✳</span><span /></div>
                    <div className="reader-chapter-nav"><button className="button button-light" disabled={chapterIndex <= 0} onClick={() => changeChapter(-1)}><ChevronLeft size={15} />Previous chapter</button><button className="button button-light" disabled={chapterIndex >= chaptersForReader.length - 1} onClick={() => changeChapter(1)}>Next chapter<ChevronRight size={15} /></button></div>
                  </div>
                </div>
                <div className="reader-status"><span><span className="status-check"><Check size={11} /></span>Progress saved on this device</span><span>{activeParagraph?.page ? `Page ${activeParagraph.page}` : `Section ${chapterIndex + 1}`}</span></div>
              </section>
              <aside className="assistant-panel">
                <div className="assistant-panel-heading"><div className="assistant-icon"><Sparkles size={16} /></div><div><b>Reading companion</b><small>Grounded in this book</small></div><button className="icon-button subtle" aria-label="Assistant information" onClick={() => setToast("Answers search only this book’s locally stored text and include a source location.")}><CircleHelp size={16} /></button></div>
                <div className="assistant-context"><span className="context-book-icon"><BookOpen size={15} /></span><span><small>ASKING ABOUT</small><b>{activeBook.title}</b></span><ChevronDown size={14} /></div>
                <div className="assistant-prompt"><div className="assistant-prompt-avatar"><Sparkles size={15} /></div><div><b>What would you like to explore?</b><p>Ask about an idea, a person, or a passage from this book.</p></div></div>
                <div className="suggestion-label">A FEW IDEAS</div>
                <div className="suggestion-list"><button onClick={() => setAssistantQuestion("What is the main idea of this chapter?")}>What’s the main idea here?<ArrowRight size={14} /></button><button onClick={() => setAssistantQuestion("Find the most important lessons")}>Find key lessons<ArrowRight size={14} /></button><button onClick={() => setAssistantQuestion("Explain this chapter simply")}>Explain this chapter simply<ArrowRight size={14} /></button></div>
                {assistantAnswer && <div className="assistant-answer"><div className="answer-label"><Sparkles size={13} /> BOOK SEARCH RESULT</div><p>{assistantAnswer.text}</p><div className="answer-citation"><BookOpen size={13} />{assistantAnswer.citation}</div></div>}
                <form className="assistant-form" onSubmit={answerBookQuestion}><label htmlFor="assistant-question">YOUR QUESTION</label><div className="assistant-input-wrap"><textarea id="assistant-question" className="assistant-input" rows={3} value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="Ask a question about this book…" /><button type="submit" aria-label="Search book text" disabled={!assistantQuestion.trim()}><ArrowRight size={16} /></button></div><div className="assistant-disclaimer">Local text search · No external AI service</div></form>
                <div className="assistant-bottom-tip"><span>✧</span> Select any passage to ask about it.</div>
              </aside>
            </div>
          )}

          {page === "bookmarks" && (
            <div className="bookmarks-view">
              <div className="page-heading-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR SAVED MOMENTS</div><h1>Bookmarks<span className="heading-period">.</span></h1><p>Passages and notes you wanted to keep close.</p></div></div>
              {visibleBooks.some((book) => book.bookmarks.length) ? <div className="bookmark-list">{visibleBooks.flatMap((book) => book.bookmarks.map((bookmark) => ({ book, bookmark }))).sort((a, b) => b.bookmark.createdAt.localeCompare(a.bookmark.createdAt)).map(({ book, bookmark }) => {
                const chapter = book.chapters.find((item) => item.id === bookmark.chapterId);
                return <article className="bookmark-card" key={bookmark.id}><div className="bookmark-card-icon"><Bookmark size={17} /></div><div className="bookmark-card-copy"><div className="bookmark-citation">{book.title}<span>·</span>{chapter?.title ?? "Saved passage"}</div><blockquote>“{bookmark.quote}”</blockquote>{bookmark.note && <p>{bookmark.note}</p>}<div className="bookmark-date">Saved {new Date(bookmark.createdAt).toLocaleDateString()}</div></div><button className="button button-light" onClick={() => jumpToBookmark(book, bookmark)}>Open passage<ArrowRight size={14} /></button><button className="icon-button subtle danger-on-hover" aria-label="Delete bookmark" onClick={() => saveBookChange(book.id, (current) => ({ ...current, bookmarks: current.bookmarks.filter((item) => item.id !== bookmark.id) }))}><Trash2 size={15} /></button></article>;
              })}</div> : <div className="library-empty"><div className="library-empty-art"><Bookmark size={27} /></div><h2>Keep the passages that stay with you</h2><p>Open a book and bookmark a sentence or add a note as you read.</p><button className="button button-primary" onClick={() => changePage("library")}>Go to my library<ArrowRight size={15} /></button></div>}
            </div>
          )}

          {page === "settings" && (
            <div className="settings-view">
              <div className="page-heading-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> MAKE IT YOURS</div><h1>Preferences<span className="heading-period">.</span></h1><p>A reading space that feels right to you.</p></div></div>
              <div className="settings-grid">
                <section className="settings-card settings-wide"><div className="settings-card-title"><span className="settings-icon settings-violet"><LogIn size={17} /></span><div><h2>ReadFlow account</h2><p>{auth.enabled ? "Sign in to access your private library across devices." : "Account access can be enabled with the Neon settings in the README."}</p></div></div>{auth.user ? <div className="storage-summary"><div><b>{auth.user.name}</b><small>{auth.user.email}</small></div><button className="button button-light" onClick={() => { void auth.signOut(); }}><LogOut size={15} />Sign out</button></div> : auth.enabled ? <div className="storage-summary"><div><b>Not signed in</b><small>{cloudEnabled ? "Your cloud library will appear after sign-in." : "Cloud storage still needs server configuration."}</small></div><Link className="button button-primary" href="/auth/sign-in"><LogIn size={15} />Sign in</Link></div> : <div className="storage-summary"><div><b>Local mode</b><small>Your library remains on this device until account access is configured.</small></div></div>}</section>
                <section className="settings-card"><div className="settings-card-title"><span className="settings-icon settings-violet"><Volume2 size={17} /></span><div><h2>Narration</h2><p>Set the voice and pace for reading aloud.</p></div></div><label className="setting-field"><span>Voice</span><select value={preferences.voiceURI} onChange={(event) => changePreference("voiceURI", event.target.value)}><option value="">System default</option>{voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select><small>Uses voices available in your browser.</small></label><label className="setting-field"><span>Reading speed <b>{preferences.speed.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}×</b></span><input type="range" min="0.5" max="3" step="0.25" value={preferences.speed} onChange={(event) => changePreference("speed", Number(event.target.value))} /><div className="range-labels"><span>Slower</span><span>Faster</span></div></label><label className="setting-field"><span>Volume <b>{Math.round(preferences.volume * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={preferences.volume} onChange={(event) => changePreference("volume", Number(event.target.value))} /></label></section>
                <section className="settings-card"><div className="settings-card-title"><span className="settings-icon settings-blue"><BookOpen size={17} /></span><div><h2>Reading comfort</h2><p>Adjust the page to suit your eyes.</p></div></div><label className="setting-field"><span>Text size <b>{preferences.fontSize}px</b></span><input type="range" min="15" max="25" step="1" value={preferences.fontSize} onChange={(event) => changePreference("fontSize", Number(event.target.value))} /></label><label className="setting-field"><span>Line spacing <b>{preferences.lineHeight.toFixed(2)}×</b></span><input type="range" min="1.45" max="2.15" step="0.05" value={preferences.lineHeight} onChange={(event) => changePreference("lineHeight", Number(event.target.value))} /></label><div className="setting-field"><span>Appearance</span><div className="appearance-choices"><button className={preferences.theme === "light" ? "appearance-active" : ""} onClick={() => changePreference("theme", "light")}><Sun size={16} />Light</button><button className={preferences.theme === "dark" ? "appearance-active" : ""} onClick={() => changePreference("theme", "dark")}><Moon size={16} />Dark</button></div></div><label className="setting-toggle"><span><b>High contrast</b><small>Increase text and control contrast.</small></span><input type="checkbox" checked={preferences.highContrast} onChange={(event) => changePreference("highContrast", event.target.checked)} /><span className="toggle-track" /></label></section>
                <section className="settings-card settings-wide"><div className="settings-card-title"><span className="settings-icon settings-green"><LibraryBig size={17} /></span><div><h2>Your data</h2><p>Books are kept in this browser for offline reading{cloudEnabled ? " and synced to your private account when signed in." : "."}</p></div></div><div className="storage-summary"><div><b>{visibleBooks.length} {visibleBooks.length === 1 ? "book" : "books"}</b><small>Stored on this device</small></div><button className="button button-light danger-button" onClick={() => { if (window.confirm("Clear every local book and reading cache from this browser? Cloud copies in your account will remain.")) { const remoteMetadata = visibleBooks.filter((book) => book.remoteStored).map((book) => ({ ...book, chapters: [] })); void Promise.all(visibleBooks.map((book) => removeBook(book.id))).then(() => { booksRef.current = remoteMetadata; setBooks(remoteMetadata); stopNarration(); setActiveBookId(null); setPage("dashboard"); setToast("Local library cleared. Cloud books remain in your account."); }); } }}><Trash2 size={15} />Clear local library</button></div><div className="settings-footnote"><span>✳</span> Original files are not retained after text extraction. Removing a book deletes its text, notes, bookmarks, and progress from this browser.</div></section>
                <section className="settings-card settings-wide"><div className="settings-card-title"><span className="settings-icon settings-amber"><Sparkles size={17} /></span><div><h2>Connected services</h2><p>Account access and private storage are provided by the selected Neon project.</p></div></div><div className="service-status-list"><div><span className="service-indicator service-local" /><span><b>Document extraction</b><small>PDF and EPUB · on device</small></span><em>Ready</em></div><div><span className="service-indicator service-local" /><span><b>Spoken narration</b><small>Browser text-to-speech voices</small></span><em>Ready</em></div><div><span className={`service-indicator ${auth.enabled ? "service-local" : "service-muted"}`} /><span><b>User authentication</b><small>Neon Auth email and Google sign-in</small></span><em className={auth.enabled ? "" : "service-disabled"}>{auth.enabled ? "Enabled" : "Not configured"}</em></div><div><span className={`service-indicator ${cloudEnabled ? "service-local" : "service-muted"}`} /><span><b>Private cloud library</b><small>Book text and reading progress · owner-scoped</small></span><em className={cloudEnabled ? "" : "service-disabled"}>{cloudEnabled ? "Enabled" : "Not configured"}</em></div></div></section>
              </div>
            </div>
          )}
        </div>
      </section>

      {activeBook && (
        <div className="mini-player" role="region" aria-label="Audio player">
          <div className="mini-player-book"><BookCover book={activeBook} compact /><div><b>{activeBook.title}</b><small>{currentSentence?.chapterTitle ?? activeChapter?.title ?? "Ready to play"}</small></div></div>
          <div className="player-controls"><div className="player-control-buttons"><button aria-label="Previous chapter" className="player-skip" onClick={() => changeChapter(-1)} disabled={!activeChapter || activeBook.chapters[0]?.id === activeChapter.id}><ChevronLeft size={17} /><ChevronLeft className="double-chevron" size={17} /></button><button aria-label="Previous sentence" className="player-skip" onClick={() => skipSentence(-1)}><ArrowLeft size={15} /></button><button className="player-play" onClick={togglePlayback} aria-label={isPlaying ? "Pause narration" : "Play narration"}>{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button aria-label="Next sentence" className="player-skip" onClick={() => skipSentence(1)}><ArrowRight size={15} /></button><button aria-label="Next chapter" className="player-skip" onClick={() => changeChapter(1)} disabled={!activeChapter || activeBook.chapters.at(-1)?.id === activeChapter.id}><ChevronRight className="double-chevron" size={17} /><ChevronRight size={17} /></button></div><div className="player-timeline"><span className="timeline-progress" style={{ width: `${activeBook.progressPercent}%` }} /><span className="timeline-thumb" style={{ left: `${activeBook.progressPercent}%` }} /></div><div className="player-caption">{isPlaying ? "Narrating · sentence highlight on" : "Ready when you are"}</div></div>
          <div className="mini-player-options"><button className="player-speed" onClick={cyclePlaybackSpeed}>{preferences.speed}×</button><button className="player-open-reader" aria-label="Open reader" onClick={() => changePage("reader")}><BookOpen size={17} /></button></div>
        </div>
      )}

      {importOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !importingName) { setImportOpen(false); setImportError(""); } }}><section className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><button className="modal-close icon-button" aria-label="Close upload dialog" onClick={() => { if (!importingName) { setImportOpen(false); setImportError(""); } }}><X size={19} /></button><div className="modal-icon"><Upload size={20} /></div><div className="eyebrow">A NEW BOOK ON YOUR SHELF</div><h2 id="upload-title">Bring your next read.</h2><p>Choose a PDF or EPUB and we’ll prepare it for reading and spoken narration.</p><div className={`drop-zone${dragActive ? " drop-zone-active" : ""}${importingName ? " drop-zone-loading" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={onDrop}><div className="drop-zone-icon">{importingName ? <LoaderCircle className="loading-spinner" size={22} /> : <FileText size={21} />}</div>{importingName ? <><b>Preparing your book…</b><span>{importingName}</span><small>Extracting chapters and paragraphs on this device</small></> : <><b>Drop your book here</b><span>or choose a file from your device</span><button className="button button-light" onClick={openFilePicker}>Browse files<ArrowRight size={14} /></button></>}</div><input ref={fileInputRef} type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" multiple hidden onChange={onFileChange} /><div className="upload-format-row"><span><FileText size={14} />PDF</span><span><BookOpen size={14} />EPUB</span><span>Up to 75 MB</span><span>Private to this device</span></div>{importError && <div className="upload-error" role="alert"><span>{importError}</span><button onClick={() => setImportError("")} aria-label="Dismiss error"><X size={15} /></button></div>}<div className="upload-modal-footnote">Text is extracted in your browser. The original file is not saved.</div></section></div>}

      {noteModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNoteModalOpen(false); }}><section className="note-modal" role="dialog" aria-modal="true" aria-labelledby="note-title"><button className="modal-close icon-button" aria-label="Close note dialog" onClick={() => setNoteModalOpen(false)}><X size={18} /></button><div className="modal-icon modal-icon-soft"><Bookmark size={19} /></div><div className="eyebrow">SAVE THIS MOMENT</div><h2 id="note-title">A passage worth keeping.</h2><blockquote>{currentSentence?.sentence ?? activeParagraph?.text ?? "Choose a passage in the reader."}</blockquote><label htmlFor="note-draft">Add a note <span>optional</span></label><textarea id="note-draft" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Why did this stand out to you?" rows={3} /><div className="note-modal-actions"><button className="button button-light" onClick={() => setNoteModalOpen(false)}>Cancel</button><button className="button button-primary" onClick={() => saveBookmark(noteDraft)}><Bookmark size={15} />Save bookmark</button></div></section></div>}

      {toast && <div className="toast-message" role="status"><span className="toast-check"><Check size={13} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={14} /></button></div>}
    </main>
  );
}

export default ReadflowApp;
