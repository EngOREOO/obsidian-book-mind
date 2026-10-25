/**
 * Book metadata lookup. OpenLibrary (no key) is the default; Google Books is only queried with the user's
 * own API key because anonymous Google Books requests have no quota. Uses `requestUrl` (no CORS, mobile-safe).
 */
import { requestUrl } from "obsidian";
import type { MetadataResult } from "../types";

const isbnOf = (q: string): string => {
  const s = q.replace(/[\s-]/g, "");
  return /^(97[89])?\d{9}[\dXx]$/.test(s) ? s.toUpperCase() : "";
};

interface OLDoc {
  title?: string; author_name?: string[]; first_publish_year?: number; number_of_pages_median?: number;
  subject?: string[]; cover_i?: number; isbn?: string[]; publisher?: string[]; language?: string[]; key?: string;
}

async function openLibrary(query: string): Promise<MetadataResult[]> {
  const isbn = isbnOf(query);
  const fields = "title,author_name,first_publish_year,number_of_pages_median,subject,cover_i,isbn,publisher,language,key";
  const url = "https://openlibrary.org/search.json?limit=8&fields=" + fields + "&q=" + encodeURIComponent(isbn || query);
  const res = await requestUrl({ url, throw: false });
  if (res.status !== 200) throw new Error("OpenLibrary " + res.status);
  const docs = ((res.json as { docs?: OLDoc[] }).docs || []);
  return docs.filter(d => d.title).map(d => ({
    source: "openlibrary" as const,
    title: d.title || "",
    author: (d.author_name || []).slice(0, 3).join(", "),
    year: d.first_publish_year ? String(d.first_publish_year) : "",
    pages: d.number_of_pages_median || 0,
    publisher: (d.publisher || [])[0] || "",
    genre: (d.subject || []).filter(s => s.length < 40).slice(0, 3),
    cover: d.cover_i ? "https://covers.openlibrary.org/b/id/" + d.cover_i + "-L.jpg" : "",
    isbn: isbn || (d.isbn || []).find(x => x.length === 13) || (d.isbn || [])[0] || "",
    language: (d.language || [])[0] || "",
    url: d.key ? "https://openlibrary.org" + d.key : "",
  }));
}

interface GVolume {
  volumeInfo?: {
    title?: string; subtitle?: string; authors?: string[]; publisher?: string; publishedDate?: string; pageCount?: number;
    categories?: string[]; language?: string; imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type: string; identifier: string }[]; infoLink?: string;
  };
}

async function googleBooks(query: string, key: string): Promise<MetadataResult[]> {
  const isbn = isbnOf(query);
  const url = "https://www.googleapis.com/books/v1/volumes?maxResults=8&key=" + encodeURIComponent(key) + "&q=" + encodeURIComponent(isbn ? "isbn:" + isbn : query);
  const res = await requestUrl({ url, throw: false });
  if (res.status !== 200) throw new Error("Google Books " + res.status);
  const items = ((res.json as { items?: GVolume[] }).items || []);
  return items.map(i => i.volumeInfo || {}).filter(v => v.title).map(v => {
    const ids = v.industryIdentifiers || [];
    const thumb = (v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || "").replace(/^http:/, "https:").replace("&edge=curl", "");
    return {
      source: "google" as const,
      title: v.title + (v.subtitle ? ": " + v.subtitle : ""),
      author: (v.authors || []).slice(0, 3).join(", "),
      year: (v.publishedDate || "").slice(0, 4),
      pages: v.pageCount || 0,
      publisher: v.publisher || "",
      genre: (v.categories || []).slice(0, 3),
      cover: thumb,
      isbn: isbn || (ids.find(x => x.type === "ISBN_13") || ids.find(x => x.type === "ISBN_10") || { identifier: "" }).identifier,
      language: v.language || "",
      url: v.infoLink || "",
    };
  });
}

export async function searchBooks(query: string, googleKey: string): Promise<MetadataResult[]> {
  const q = query.trim();
  if (!q) return [];
  const results: MetadataResult[] = [];
  let lastError: unknown = null;
  try { results.push(...await openLibrary(q)); } catch (e) { lastError = e; }
  if (googleKey.trim()) {
    try { results.push(...await googleBooks(q, googleKey.trim())); } catch (e) { lastError = lastError || e; }
  }
  if (!results.length && lastError) throw lastError;
  return results;
}

/** Frontmatter patch in Reading Journey's schema. */
export function toFrontmatter(r: MetadataResult): Record<string, unknown> {
  const fm: Record<string, unknown> = { rj: "book", author: r.author, pages: r.pages || undefined, year: r.year, publisher: r.publisher, genre: r.genre, cover: r.cover, isbn: r.isbn, language: r.language, url: r.url };
  for (const k of Object.keys(fm)) if (fm[k] === undefined || fm[k] === "" || (Array.isArray(fm[k]) && !(fm[k] as unknown[]).length)) delete fm[k];
  return fm;
}
