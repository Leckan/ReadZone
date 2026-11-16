import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { DEFAULT_PREFERENCES, type AppPreferences, type BookRecord } from "@/lib/types";

interface ReadflowDatabase extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
    indexes: { "by-updated": string };
  };
}

let databasePromise: Promise<IDBPDatabase<ReadflowDatabase>> | undefined;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDB<ReadflowDatabase>("readflow-local", 1, {
      upgrade(database) {
        const store = database.createObjectStore("books", { keyPath: "id" });
        store.createIndex("by-updated", "updatedAt");
      },
    });
  }
  return databasePromise;
}

export async function getBooks() {
  const database = await getDatabase();
  return database.getAll("books");
}

export async function saveBook(book: BookRecord) {
  const database = await getDatabase();
  await database.put("books", book);
  return book;
}

export async function removeBook(id: string) {
  const database = await getDatabase();
  await database.delete("books", id);
}

const PREFERENCES_KEY = "readflow-preferences-v1";

export function getPreferences(): AppPreferences {
  try {
    const stored = window.localStorage.getItem(PREFERENCES_KEY);
    if (stored) return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
  } catch {
    // The reader can still start with defaults when browser storage is unavailable.
  }
  return DEFAULT_PREFERENCES;
}

export function savePreferences(preferences: AppPreferences) {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are optional; the current session remains usable.
  }
}

