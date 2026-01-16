import { Pool, type PoolClient } from "@db/postgres";
import type { Link } from "./scraper.ts";

export interface StoredLink extends Link {
  id: string;
  createdAt: string;
  updatedAt: string;
}

const DATABASE_URL = Deno.env.get("DB_URL") ?? Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) {
  throw new Error("Missing DB_URL environment variable");
}

const pool = new Pool(DATABASE_URL, 3, true);
let schemaInit: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (!schemaInit) {
    schemaInit = (async () => {
      const client = await pool.connect();
      try {
        await client.queryArray(`
          CREATE TABLE IF NOT EXISTS links (
            id TEXT PRIMARY KEY,
            author TEXT NOT NULL,
            comment_url TEXT NOT NULL,
            extracted_link TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
        `);
        await client.queryArray(
          "CREATE UNIQUE INDEX IF NOT EXISTS links_comment_extracted_idx ON links (comment_url, extracted_link);",
        );
        await client.queryArray(`
          CREATE TABLE IF NOT EXISTS clicks (
            url_hash TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            total BIGINT NOT NULL DEFAULT 0
          );
        `);
        await client.queryArray(`
          CREATE TABLE IF NOT EXISTS clicks_daily (
            url_hash TEXT NOT NULL,
            day DATE NOT NULL,
            count BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (url_hash, day)
          );
        `);
        await client.queryArray(`
          CREATE TABLE IF NOT EXISTS likes (
            url_hash TEXT PRIMARY KEY,
            total BIGINT NOT NULL DEFAULT 0
          );
        `);
        await client.queryArray(`
          CREATE TABLE IF NOT EXISTS liked_by (
            url_hash TEXT NOT NULL,
            visitor_id TEXT NOT NULL,
            PRIMARY KEY (url_hash, visitor_id)
          );
        `);
        await client.queryArray(`
          CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value BIGINT NOT NULL DEFAULT 0
          );
        `);
      } finally {
        client.release();
      }
    })();
  }
  await schemaInit;
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

function generateId(commentUrl: string, extractedLink: string): string {
  // Create a deterministic ID from the unique constraint fields.
  return btoa(`${commentUrl}:${extractedLink}`).replace(/[/+=]/g, "_");
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return new Date(value as string).toISOString();
}

export async function saveLinks(links: Link[]): Promise<number> {
  if (links.length === 0) {
    return 0;
  }

  return await withClient(async (client) => {
    let newCount = 0;
    const now = new Date().toISOString();

    await client.queryArray("BEGIN");
    try {
      for (const link of links) {
        const id = generateId(link.commentUrl, link.extractedLink);
        const result = await client.queryObject<{ inserted: boolean }>({
          text:
            "INSERT INTO links (id, author, comment_url, extracted_link, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at RETURNING (xmax = 0) AS inserted",
          args: [
            id,
            link.author,
            link.commentUrl,
            link.extractedLink,
            now,
            now,
          ],
        });

        if (result.rows[0]?.inserted) {
          newCount++;
        }
      }

      await client.queryArray("COMMIT");
    } catch (error) {
      await client.queryArray("ROLLBACK");
      throw error;
    }

    return newCount;
  });
}

export type SortField = "author" | "clicks" | "likes";
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

interface LinkRow {
  id: string;
  author: string;
  comment_url: string;
  extracted_link: string;
  created_at: string | Date;
  updated_at: string | Date;
}

export async function getLinks(
  options: QueryOptions,
  clickCounts?: Map<string, number>,
  likeCounts?: Map<string, number>,
): Promise<QueryResult> {
  const { page, perPage, search, sort = "likes", order = "desc" } = options;

  return await withClient(async (client) => {
    const result = await client.queryObject<LinkRow>(
      "SELECT id, author, comment_url, extracted_link, created_at, updated_at FROM links",
    );

    const allLinks: StoredLink[] = result.rows.map((row) => ({
      id: row.id,
      author: row.author,
      commentUrl: row.comment_url,
      extractedLink: row.extracted_link,
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    }));

    // Filter by search if provided.
    let filteredLinks = allLinks;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredLinks = allLinks.filter(
        (link) =>
          link.author.toLowerCase().includes(searchLower) ||
          link.extractedLink.toLowerCase().includes(searchLower),
      );
    }

    // For clicks sorting, we need to fetch click counts if not provided.
    let clicks = clickCounts;
    if (sort === "clicks" && !clicks) {
      const urls = filteredLinks.map((l) => l.extractedLink);
      clicks = await getClickCountsInternal(client, urls);
    }

    // For likes sorting, we need to fetch like counts if not provided.
    let likes = likeCounts;
    if (sort === "likes" && !likes) {
      const urls = filteredLinks.map((l) => l.extractedLink);
      likes = await getLikeCountsInternal(client, urls);
    }

    // Sort based on field and order.
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
        case "likes":
        default: {
          const aLikes = likes?.get(a.extractedLink) || 0;
          const bLikes = likes?.get(b.extractedLink) || 0;
          return multiplier * (aLikes - bLikes);
        }
      }
    });

    const total = filteredLinks.length;
    const totalPages = Math.ceil(total / perPage);

    // Paginate.
    const offset = (page - 1) * perPage;
    const links = filteredLinks.slice(offset, offset + perPage);

    return { links, total, totalPages };
  });
}

async function getClickCountsInternal(
  client: PoolClient,
  urls: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (urls.length === 0) {
    return counts;
  }

  const hashes = await Promise.all(urls.map((url) => hashUrl(url)));
  const result = await client.queryObject<{ url_hash: string; total: number }>({
    text: "SELECT url_hash, total FROM clicks WHERE url_hash = ANY($1)",
    args: [hashes],
  });

  const totals = new Map(result.rows.map((row) => [row.url_hash, Number(row.total)]));

  urls.forEach((url, index) => {
    const hash = hashes[index];
    counts.set(url, totals.get(hash) || 0);
  });

  return counts;
}

export async function getTotalCount(): Promise<number> {
  return await withClient(async (client) => {
    const result = await client.queryObject<{ count: bigint }>({
      text: "SELECT COUNT(*)::bigint AS count FROM links",
    });
    const value = result.rows[0]?.count ?? 0n;
    return Number(value);
  });
}

/** Hash a URL using SHA-256. */
async function hashUrl(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function trackClick(url: string): Promise<void> {
  await withClient(async (client) => {
    const hash = await hashUrl(url);
    const today = new Date().toISOString().slice(0, 10);

    await client.queryArray("BEGIN");
    try {
      await client.queryArray({
        text:
          "INSERT INTO clicks (url_hash, url, total) VALUES ($1, $2, 1) ON CONFLICT (url_hash) DO UPDATE SET total = clicks.total + 1, url = EXCLUDED.url",
        args: [hash, url],
      });
      await client.queryArray({
        text:
          "INSERT INTO clicks_daily (url_hash, day, count) VALUES ($1, $2, 1) ON CONFLICT (url_hash, day) DO UPDATE SET count = clicks_daily.count + 1",
        args: [hash, today],
      });
      await client.queryArray("COMMIT");
    } catch (error) {
      await client.queryArray("ROLLBACK");
      throw error;
    }
  });
}

export async function getClickCount(url: string): Promise<number> {
  return await withClient(async (client) => {
    const hash = await hashUrl(url);
    const result = await client.queryObject<{ total: number | bigint }>({
      text: "SELECT total FROM clicks WHERE url_hash = $1",
      args: [hash],
    });
    const value = result.rows[0]?.total ?? 0;
    return Number(value);
  });
}

export async function getClickCounts(
  urls: string[],
): Promise<Map<string, number>> {
  return await withClient((client) => getClickCountsInternal(client, urls));
}

export async function getAllLinks(): Promise<StoredLink[]> {
  return await withClient(async (client) => {
    const result = await client.queryObject<LinkRow>(
      "SELECT id, author, comment_url, extracted_link, created_at, updated_at FROM links ORDER BY id",
    );

    const links = result.rows.map((row) => ({
      id: row.id,
      author: row.author,
      commentUrl: row.comment_url,
      extractedLink: row.extracted_link,
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    }));

    return links;
  });
}

async function incrementMeta(
  client: PoolClient,
  key: string,
  delta: number,
): Promise<number> {
  const result = await client.queryObject<{ value: bigint }>({
    text:
      "INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = meta.value + EXCLUDED.value RETURNING value",
    args: [key, delta],
  });
  const value = result.rows[0]?.value ?? 0n;
  return Number(value);
}

export async function trackExport(): Promise<void> {
  await withClient(async (client) => {
    await incrementMeta(client, "exports", 1);
  });
}

export async function getExportCount(): Promise<number> {
  return await withClient(async (client) => {
    const result = await client.queryObject<{ value: bigint }>({
      text: "SELECT value FROM meta WHERE key = $1",
      args: ["exports"],
    });
    const value = result.rows[0]?.value ?? 0n;
    return Number(value);
  });
}

// Like tracking functions

async function getLikeCountsInternal(
  client: PoolClient,
  urls: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (urls.length === 0) {
    return counts;
  }

  const hashes = await Promise.all(urls.map((url) => hashUrl(url)));
  const result = await client.queryObject<{ url_hash: string; total: number }>({
    text: "SELECT url_hash, total FROM likes WHERE url_hash = ANY($1)",
    args: [hashes],
  });

  const totals = new Map(result.rows.map((row) => [row.url_hash, Number(row.total)]));

  urls.forEach((url, index) => {
    const hash = hashes[index];
    counts.set(url, totals.get(hash) || 0);
  });

  return counts;
}

export async function getLikeCounts(
  urls: string[],
): Promise<Map<string, number>> {
  return await withClient((client) => getLikeCountsInternal(client, urls));
}

export async function toggleLike(
  url: string,
  visitorId: string,
): Promise<{ liked: boolean; count: number }> {
  return await withClient(async (client) => {
    const urlHash = await hashUrl(url);

    await client.queryArray("BEGIN");
    try {
      await client.queryArray({
        text:
          "INSERT INTO likes (url_hash, total) VALUES ($1, 0) ON CONFLICT (url_hash) DO NOTHING",
        args: [urlHash],
      });

      const hasLiked = await client.queryObject<{ exists: boolean }>({
        text:
          "SELECT TRUE AS exists FROM liked_by WHERE url_hash = $1 AND visitor_id = $2",
        args: [urlHash, visitorId],
      });

      if (hasLiked.rows.length > 0) {
        await client.queryArray({
          text: "DELETE FROM liked_by WHERE url_hash = $1 AND visitor_id = $2",
          args: [urlHash, visitorId],
        });
        const result = await client.queryObject<{ total: bigint }>({
          text:
            "UPDATE likes SET total = GREATEST(total - 1, 0) WHERE url_hash = $1 RETURNING total",
          args: [urlHash],
        });
        await client.queryArray("COMMIT");
        return { liked: false, count: Number(result.rows[0]?.total ?? 0n) };
      }

      await client.queryArray({
        text: "INSERT INTO liked_by (url_hash, visitor_id) VALUES ($1, $2)",
        args: [urlHash, visitorId],
      });
      const result = await client.queryObject<{ total: bigint }>({
        text: "UPDATE likes SET total = total + 1 WHERE url_hash = $1 RETURNING total",
        args: [urlHash],
      });
      await client.queryArray("COMMIT");
      return { liked: true, count: Number(result.rows[0]?.total ?? 1n) };
    } catch (error) {
      await client.queryArray("ROLLBACK");
      throw error;
    }
  });
}

export async function hasUserLiked(
  url: string,
  visitorId: string,
): Promise<boolean> {
  return await withClient(async (client) => {
    const urlHash = await hashUrl(url);
    const result = await client.queryObject<{ exists: boolean }>({
      text:
        "SELECT TRUE AS exists FROM liked_by WHERE url_hash = $1 AND visitor_id = $2",
      args: [urlHash, visitorId],
    });
    return result.rows.length > 0;
  });
}

export async function getUserLikes(
  urls: string[],
  visitorId: string,
): Promise<Set<string>> {
  if (urls.length === 0) {
    return new Set();
  }

  return await withClient(async (client) => {
    const hashes = await Promise.all(urls.map((url) => hashUrl(url)));
    const result = await client.queryObject<{ url_hash: string }>({
      text:
        "SELECT url_hash FROM liked_by WHERE visitor_id = $1 AND url_hash = ANY($2)",
      args: [visitorId, hashes],
    });

    const likedHashes = new Set(result.rows.map((row) => row.url_hash));
    const liked = new Set<string>();

    urls.forEach((url, index) => {
      if (likedHashes.has(hashes[index])) {
        liked.add(url);
      }
    });

    return liked;
  });
}
