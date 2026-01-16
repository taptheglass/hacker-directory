import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import {
  getLinks,
  getClickCounts,
  getAllLinks,
  trackClick,
  getTotalCount,
  type StoredLink,
  type SortField,
  type SortOrder,
} from "./lib/db.ts";
import { runScraper } from "./lib/scraper.ts";

const app = new Hono();

const PER_PAGE = 50;

// Static files
app.use("/static/*", serveStatic({ root: "./" }));

// Home page
app.get("/", async (c) => {
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const search = url.searchParams.get("q")?.trim() || "";
  const sort = (url.searchParams.get("sort") || "updated") as SortField;
  const order = (url.searchParams.get("order") || "desc") as SortOrder;

  const result = await getLinks({ page, perPage: PER_PAGE, search, sort, order });

  const urls = result.links.map((link) => link.extractedLink);
  const clickCountsMap = await getClickCounts(urls);
  const clickCounts: Record<string, number> = {};
  for (const [url, count] of clickCountsMap) {
    clickCounts[url] = count;
  }

  return c.html(renderPage(result.links, result.total, result.totalPages, page, search, clickCounts, sort, order));
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

// CSV download
app.get("/download.csv", async (c) => {
  const links = await getAllLinks();

  const escapeCSV = (s: string): string => `"${s.replace(/"/g, '""')}"`;

  let csv = "author,comment_url,extracted_link\n";
  for (const link of links) {
    csv += `${escapeCSV(link.author)},${escapeCSV(link.commentUrl)},${escapeCSV(link.extractedLink)}\n`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=hn_links.csv",
    },
  });
});

// HTML rendering functions
function renderPage(
  links: StoredLink[],
  total: number,
  totalPages: number,
  page: number,
  search: string,
  clickCounts: Record<string, number>,
  sort: SortField,
  order: SortOrder
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="A directory of hacker's personal sites.">
  <title>The Hacker's Directory</title>
  <link rel="icon" href="/static/favicon.png" type="image/png">
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  <header>
    <h1><a href="/">The Hacker's Directory</a></h1>
    <a href="/download.csv" download="hn_links.csv" class="download-link">Download CSV</a>
  </header>

  <div class="search-bar">
    <h2 class="tagline">A directory of hacker's personal sites.</h2>
    <form class="search-form" method="get" action="/">
      <input type="text" name="q" placeholder="Search by author or URL..." value="${escapeHtml(search)}">
      <button type="submit">Search</button>
      ${search ? '<a href="/">Clear</a>' : ""}
    </form>
  </div>

  <div class="stats">
    Showing ${links.length} of ${total} links${search ? ` matching "${escapeHtml(search)}"` : ""}
  </div>

  <table>
    <thead>
      <tr>
        ${renderSortHeader("author", "Author", sort, order, search)}
        <th>Site</th>
        <th>Comment</th>
        ${renderSortHeader("clicks", "Clicks", sort, order, search)}
        ${renderSortHeader("updated", "Updated (UTC)", sort, order, search)}
      </tr>
    </thead>
    <tbody>
      ${links.length > 0
        ? links.map((link) => renderLinkRow(link, clickCounts[link.extractedLink] || 0)).join("")
        : '<tr><td colspan="5" style="text-align: center; color: #666;">No links found</td></tr>'
      }
    </tbody>
  </table>

  ${renderPagination(page, totalPages, search, sort, order)}
</body>
</html>`;
}

function renderSortHeader(field: SortField, label: string, currentSort: SortField, currentOrder: SortOrder, search: string): string {
  const isActive = currentSort === field;
  const nextOrder = isActive && currentOrder === "desc" ? "asc" : "desc";
  const arrow = isActive ? (currentOrder === "desc" ? "↓" : "↑") : "↕";

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  params.set("sort", field);
  params.set("order", nextOrder);

  return `<th>${label} <a class="sort-arrow" href="?${params.toString()}">${arrow}</a></th>`;
}

function renderLinkRow(link: StoredLink, clicks: number): string {
  const displayUrl = link.extractedLink.length > 60
    ? link.extractedLink.slice(0, 60) + "..."
    : link.extractedLink;
  const displayDate = link.updatedAt.slice(0, 16).replace("T", " ");
  const trackingUrl = `/go?url=${encodeURIComponent(link.extractedLink)}`;

  return `<tr>
    <td class="author">${escapeHtml(link.author)}</td>
    <td class="link"><a href="${trackingUrl}" target="_blank" rel="noopener">${escapeHtml(displayUrl)}</a></td>
    <td><a href="${escapeHtml(link.commentUrl)}" target="_blank" rel="noopener">view</a></td>
    <td class="clicks">${clicks}</td>
    <td class="updated">${displayDate}</td>
  </tr>`;
}

function renderPagination(page: number, totalPages: number, search: string, sort: SortField, order: SortOrder): string {
  if (totalPages <= 1) return "";

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (sort !== "updated") params.set("sort", sort);
  if (order !== "desc") params.set("order", order);
  const baseParams = params.toString();
  const prefix = baseParams ? `?${baseParams}&` : "?";

  const pages: (number | "...")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - 2 && p <= page + 2)) {
      pages.push(p);
    } else if (p === page - 3 || p === page + 3) {
      pages.push("...");
    }
  }

  let html = '<div class="pagination">';

  if (page > 1) {
    html += `<a href="${prefix}page=${page - 1}">&laquo; Prev</a>`;
  } else {
    html += '<span class="disabled">&laquo; Prev</span>';
  }

  for (const p of pages) {
    if (p === "...") {
      html += "<span>...</span>";
    } else if (p === page) {
      html += `<span class="current">${p}</span>`;
    } else {
      html += `<a href="${prefix}page=${p}">${p}</a>`;
    }
  }

  if (page < totalPages) {
    html += `<a href="${prefix}page=${page + 1}">Next &raquo;</a>`;
  } else {
    html += '<span class="disabled">Next &raquo;</span>';
  }

  html += "</div>";
  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Run scraper on startup only if database is empty
const count = await getTotalCount();
if (count === 0) {
  console.log("Database empty, running initial scrape...");
  await runScraper();
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
