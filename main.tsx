/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { serveStatic } from "hono/deno";
import {
  getAllLinks,
  getClickCounts,
  getExportCount,
  getLikeCounts,
  getLinks,
  getTotalCount,
  getUserLikes,
  type SortField,
  type SortOrder,
  toggleLike,
  trackClick,
  trackExport,
} from "./lib/db.ts";
import { runScraper } from "./lib/scraper.ts";
import { AboutPage } from "./views/about.tsx";
import { FishtankPage } from "./views/fishtank.tsx";
import { Home } from "./views/home.tsx";

function getOrCreateVisitorId(c: Parameters<typeof getCookie>[0]): string {
  let visitorId = getCookie(c, "visitor_id");
  if (!visitorId) {
    visitorId = crypto.randomUUID();
  }
  return visitorId;
}

const app = new Hono();

const PER_PAGE = 50;

// Static files
app.use("/static/*", serveStatic({ root: "./" }));

// Home page
app.get("/", async (c) => {
  const visitorId = getOrCreateVisitorId(c);
  setCookie(c, "visitor_id", visitorId, {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    sameSite: "Lax",
  });

  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const search = url.searchParams.get("q")?.trim() || "";
  const sort = (url.searchParams.get("sort") || "likes") as SortField;
  const order = (url.searchParams.get("order") || "desc") as SortOrder;

  const result = await getLinks({
    page,
    perPage: PER_PAGE,
    search,
    sort,
    order,
  });

  const urls = result.links.map((link) => link.extractedLink);
  const clickCountsMap = await getClickCounts(urls);
  const clickCounts: Record<string, number> = {};
  for (const [u, count] of clickCountsMap) {
    clickCounts[u] = count;
  }

  const likeCountsMap = await getLikeCounts(urls);
  const likeCounts: Record<string, number> = {};
  for (const [u, count] of likeCountsMap) {
    likeCounts[u] = count;
  }

  const userLikedSet = await getUserLikes(urls, visitorId);
  const userLiked: Record<string, boolean> = {};
  for (const u of urls) {
    userLiked[u] = userLikedSet.has(u);
  }

  const exportCount = await getExportCount();

  return c.html(
    <Home
      links={result.links}
      total={result.total}
      totalPages={result.totalPages}
      page={page}
      search={search}
      clickCounts={clickCounts}
      likeCounts={likeCounts}
      userLiked={userLiked}
      sort={sort}
      order={order}
      exportCount={exportCount}
    />,
  );
});


// About page
app.get("/about", (c) => {
  return c.html(<AboutPage />);
});

// Fishtank page
app.get("/fishtank", (c) => {
  return c.html(<FishtankPage urls={[]} />);
});

// Fishtank link feed
app.get("/fishtank/links", async (c) => {
  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = Math.max(
    1,
    parseInt(url.searchParams.get("perPage") || "200", 10),
  );
  const links = await getAllLinks();
  const urls = Array.from(
    new Set(links.map((link) => link.extractedLink)),
  );
  const total = urls.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const pageUrls = urls.slice(start, start + perPage);
  return c.json({
    page,
    perPage,
    total,
    totalPages,
    urls: pageUrls,
  });
});

// Click tracking redirect
app.get("/go", async (c) => {
  const target = c.req.query("url");
  if (!target) {
    return c.text("Missing url parameter", 400);
  }
  await trackClick(target);
  return c.redirect(target, 302);
});

// Like toggle endpoint
app.post("/like", async (c) => {
  const visitorId = getOrCreateVisitorId(c);
  setCookie(c, "visitor_id", visitorId, {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "Lax",
  });

  const body = await c.req.json();
  const url = body.url;
  if (!url) {
    return c.json({ error: "Missing url" }, 400);
  }

  const result = await toggleLike(url, visitorId);
  return c.json(result);
});

// Like status lookup
app.get("/like/status", async (c) => {
  const visitorId = getOrCreateVisitorId(c);
  setCookie(c, "visitor_id", visitorId, {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "Lax",
  });

  const url = c.req.query("url");
  if (!url) {
    return c.json({ error: "Missing url" }, 400);
  }

  const likeCountsMap = await getLikeCounts([url]);
  const userLikedSet = await getUserLikes([url], visitorId);
  return c.json({
    count: likeCountsMap.get(url) || 0,
    liked: userLikedSet.has(url),
  });
});

// CSV download
app.get("/download.csv", async (_c) => {
  await trackExport();
  const links = await getAllLinks();
  const urls = links.map((link) => link.extractedLink);
  const clickCountsMap = await getClickCounts(urls);
  const likeCountsMap = await getLikeCounts(urls);

  const escapeCSV = (s: string): string => `"${s.replace(/"/g, '""')}"`;

  let csv = "author,comment_url,extracted_link,clicks,likes\n";
  for (const link of links) {
    const clicks = clickCountsMap.get(link.extractedLink) || 0;
    const likes = likeCountsMap.get(link.extractedLink) || 0;
    csv += `${escapeCSV(link.author)},${escapeCSV(link.commentUrl)},${
      escapeCSV(link.extractedLink)
    },${clicks},${likes}\n`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=h4cker-directory.csv",
    },
  });
});

// Run scraper on startup only if database is empty, but don't block startup
const count = await getTotalCount();
if (count === 0) {
  console.log("Database empty, starting initial scrape in background...");
  runScraper().catch((error) => {
    console.error("Initial scrape failed:", error);
  });
} else {
  console.log(`Database has ${count} links, skipping initial scrape.`);
}

// Schedule hourly scrapes
Deno.cron("scrape-hn", "0 * * * *", async () => {
  console.log("Running scheduled scrape...");
  await runScraper();
});

// Start server
Deno.serve(app.fetch);
