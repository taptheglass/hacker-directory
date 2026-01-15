/// <reference lib="deno.unstable" />
import { crypto } from "https://deno.land/std@0.216.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.216.0/encoding/hex.ts";
import type { Link } from "./scraper.ts";

export interface StoredLink extends Link {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// Use local file for dev, undefined uses Deno Deploy's managed KV in production
function getKvPath(): string | undefined {
  if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
    return undefined; // Use Deno Deploy's managed KV
  }
  // Get absolute path relative to this module
  const moduleDir = new URL(".", import.meta.url).pathname;
  return `${moduleDir}../data/kv.db`;
}

async function openKv(): Promise<Deno.Kv> {
  return await Deno.openKv(getKvPath());
}

function generateId(commentUrl: string, extractedLink: string): string {
  // Create a deterministic ID from the unique constraint fields
  return btoa(`${commentUrl}:${extractedLink}`).replace(/[/+=]/g, "_");
}

export async function saveLinks(links: Link[]): Promise<number> {
  const kv = await openKv();
  let newCount = 0;
  const now = new Date().toISOString();

  for (const link of links) {
    const id = generateId(link.commentUrl, link.extractedLink);
    const existing = await kv.get<StoredLink>(["links", id]);

    if (existing.value) {
      // Update timestamp on existing record
      await kv.set(["links", id], {
        ...existing.value,
        updatedAt: now,
      });
    } else {
      // Insert new record
      const storedLink: StoredLink = {
        id,
        author: link.author,
        commentUrl: link.commentUrl,
        extractedLink: link.extractedLink,
        createdAt: now,
        updatedAt: now,
      };

      await kv.set(["links", id], storedLink);

      // Also index by author for search
      await kv.set(["by_author", link.author.toLowerCase(), id], id);

      newCount++;
    }
  }

  // Update total count
  const countResult = await kv.get<number>(["meta", "count"]);
  const currentCount = countResult.value || 0;
  await kv.set(["meta", "count"], currentCount + newCount);

  kv.close();
  return newCount;
}

export type SortField = "author" | "clicks" | "updated";
export type SortOrder = "asc" | "desc";

export interface QueryOptions {
  page: number;
  perPage: number;
  search?: string;
  sort?: SortField;
  order?: SortOrder;
}

export interface QueryResult {
  links: StoredLink[];
  total: number;
  totalPages: number;
}

export async function getLinks(
  options: QueryOptions,
  clickCounts?: Map<string, number>
): Promise<QueryResult> {
  const kv = await openKv();
  const { page, perPage, search, sort = "updated", order = "desc" } = options;

  const allLinks: StoredLink[] = [];

  // Fetch all links
  const iter = kv.list<StoredLink>({ prefix: ["links"] });
  for await (const entry of iter) {
    allLinks.push(entry.value);
  }

  // Filter by search if provided
  let filteredLinks = allLinks;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredLinks = allLinks.filter(
      (link) =>
        link.author.toLowerCase().includes(searchLower) ||
        link.extractedLink.toLowerCase().includes(searchLower)
    );
  }

  // For clicks sorting, we need to fetch click counts if not provided
  let clicks = clickCounts;
  if (sort === "clicks" && !clicks) {
    const urls = filteredLinks.map((l) => l.extractedLink);
    clicks = await getClickCountsInternal(kv, urls);
  }

  // Sort based on field and order
  const multiplier = order === "desc" ? -1 : 1;
  filteredLinks.sort((a, b) => {
    switch (sort) {
      case "author":
        return multiplier * a.author.localeCompare(b.author);
      case "clicks": {
        const aClicks = clicks?.get(a.extractedLink) || 0;
        const bClicks = clicks?.get(b.extractedLink) || 0;
        return multiplier * (aClicks - bClicks);
      }
      case "updated":
      default:
        return multiplier * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    }
  });

  const total = filteredLinks.length;
  const totalPages = Math.ceil(total / perPage);

  // Paginate
  const offset = (page - 1) * perPage;
  const links = filteredLinks.slice(offset, offset + perPage);

  kv.close();

  return { links, total, totalPages };
}

async function getClickCountsInternal(kv: Deno.Kv, urls: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const url of urls) {
    const hash = await md5(url);
    const result = await kv.get<number>(["clicks", hash]);
    counts.set(url, result.value || 0);
  }
  return counts;
}

export async function getTotalCount(): Promise<number> {
  const kv = await openKv();
  const countResult = await kv.get<number>(["meta", "count"]);
  kv.close();
  return countResult.value || 0;
}

/** Hash a string using MD5. Used for generating short keys, not for security. */
async function md5(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("MD5", data);
  return encodeHex(hash);
}

export async function trackClick(url: string): Promise<void> {
  const kv = await openKv();
  const hash = await md5(url);
  const today = new Date().toISOString().slice(0, 10);

  // Increment total clicks
  const totalKey = ["clicks", hash];
  const totalResult = await kv.get<number>(totalKey);
  await kv.set(totalKey, (totalResult.value || 0) + 1);

  // Increment daily clicks
  const dailyKey = ["clicks_daily", hash, today];
  const dailyResult = await kv.get<number>(dailyKey);
  await kv.set(dailyKey, (dailyResult.value || 0) + 1);

  // Store URL mapping for reference
  await kv.set(["click_urls", hash], url);

  kv.close();
}

export async function getClickCount(url: string): Promise<number> {
  const kv = await openKv();
  const hash = await md5(url);
  const result = await kv.get<number>(["clicks", hash]);
  kv.close();
  return result.value || 0;
}

export async function getClickCounts(urls: string[]): Promise<Map<string, number>> {
  const kv = await openKv();
  const counts = new Map<string, number>();

  for (const url of urls) {
    const hash = await md5(url);
    const result = await kv.get<number>(["clicks", hash]);
    counts.set(url, result.value || 0);
  }

  kv.close();
  return counts;
}

export async function getAllLinks(): Promise<StoredLink[]> {
  const kv = await openKv();
  const links: StoredLink[] = [];

  const iter = kv.list<StoredLink>({ prefix: ["links"] });
  for await (const entry of iter) {
    links.push(entry.value);
  }

  kv.close();

  // Sort by ID (insertion order approximation)
  return links.sort((a, b) => a.id.localeCompare(b.id));
}
