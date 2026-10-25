export type Lang = "en" | "ar";

/** Reading Journey's status vocabulary (see its STATUS_MAP). */
export type BookStatus = "want" | "reading" | "paused" | "finished" | "dropped";

export type BookFormat = "paper" | "ebook" | "audio" | string;

export interface Session {
  id: string;
  date: string;
  fromPage: number;
  toPage: number;
  pages: number;
  hours: number;
  notes: string;
}

export interface Book {
  path: string;
  name: string;
  author: string;
  pages: number;
  startPage: number;
  /** Highest page reached (start page or latest checkpoint). */
  current: number;
  /** Status written in the note ("" when absent). */
  rawStatus: BookStatus | "";
  /** Effective status (falls back to progress like Reading Journey does). */
  state: BookStatus;
  format: BookFormat;
  genre: string[];
  started: string;
  finished: string;
  rating: number;
  cover: string;
  quotes: string[];
  ideas: string[];
  sessions: Session[];
  log: { date: string; page: number }[];
  /** Pages read per date, derived from checkpoints the way Reading Journey does. */
  daily: Record<string, number>;
  series: string;
  volume: number;
  seriesTotal: number;
  mood: string;
  impact: number;
  /** Most recent day with any activity (checkpoint, session or file edit). */
  lastActivity: string;
}

export interface Highlight {
  id: string;
  bookPath: string;
  bookName: string;
  author: string;
  text: string;
  source: "frontmatter" | "body";
}

export interface ReviewState {
  ease: number;
  interval: number;
  due: string;
  reps: number;
  lapses: number;
  last: string;
}

export type Grade = 0 | 1 | 2 | 3;

export interface ActiveSession {
  bookPath: string;
  startPage: number;
  startedAt: number;
  pausedAt: number | null;
  pausedMs: number;
  notes: string[];
}

export interface Flashcard {
  question: string;
  answer: string;
  bookPath: string;
  bookName: string;
}

export interface BMSettings {
  useReadingJourney: boolean;
  booksFolder: string;
  yearGoal: number;
  dailyHighlights: number;
  stalledDays: number;
  googleApiKey: string;
  downloadCovers: boolean;
  coversFolder: string;
  reportsFolder: string;
  cardsFolder: string;
  flashcardsFolder: string;
  conceptsFolder: string;
  showStatusBar: boolean;
}

export const DEFAULT_SETTINGS: BMSettings = {
  useReadingJourney: true,
  booksFolder: "Books",
  yearGoal: 24,
  dailyHighlights: 3,
  stalledDays: 14,
  googleApiKey: "",
  downloadCovers: false,
  coversFolder: "Books/Covers",
  reportsFolder: "Reports",
  cardsFolder: "Quote Cards",
  flashcardsFolder: "Flashcards",
  conceptsFolder: "",
  showStatusBar: true,
};

export type Tab = "today" | "shelf" | "series" | "insights";

export interface BMData {
  version: number;
  lang: Lang;
  settings: BMSettings;
  reviews: Record<string, ReviewState>;
  reviewedToday: { date: string; ids: string[] };
  session: ActiveSession | null;
  snoozed: Record<string, string>;
  /** Hours logged while Reading Journey is not installed. */
  standaloneHours: Record<string, number>;
  ui: { tab: Tab };
}

export interface MetadataResult {
  source: "openlibrary" | "google";
  title: string;
  author: string;
  year: string;
  pages: number;
  publisher: string;
  genre: string[];
  cover: string;
  isbn: string;
  language: string;
  url: string;
}
