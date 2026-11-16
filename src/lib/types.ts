export type BookFormat = "PDF" | "EPUB";

export type BookParagraph = {
  id: string;
  text: string;
  page?: number;
};

export type BookChapter = {
  id: string;
  title: string;
  paragraphs: BookParagraph[];
};

export type Bookmark = {
  id: string;
  chapterId: string;
  paragraphId: string;
  quote: string;
  note?: string;
  createdAt: string;
};

export type BookRecord = {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  fileName: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  chapters: BookChapter[];
  wordCount: number;
  pageCount?: number;
  progressChapterId?: string;
  progressParagraphId?: string;
  progressPercent: number;
  listenedSeconds: number;
  favorite: boolean;
  bookmarks: Bookmark[];
};

export type AppPreferences = {
  voiceURI: string;
  speed: number;
  volume: number;
  fontSize: number;
  lineHeight: number;
  theme: "light" | "dark";
  highContrast: boolean;
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  voiceURI: "",
  speed: 1,
  volume: 1,
  fontSize: 18,
  lineHeight: 1.85,
  theme: "light",
  highContrast: false,
};
