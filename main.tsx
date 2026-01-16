/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import type { FC } from "hono/jsx";
import {
  getAllLinks,
  getClickCounts,
  getExportCount,
  getLinks,
  getTotalCount,
  type SortField,
  type SortOrder,
  type StoredLink,
  trackClick,
  trackExport,
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
  for (const [url, count] of clickCountsMap) {
    clickCounts[url] = count;
  }

  const exportCount = await getExportCount();

  return c.html(
    <Page
      links={result.links}
      total={result.total}
      totalPages={result.totalPages}
      page={page}
      search={search}
      clickCounts={clickCounts}
      sort={sort}
      order={order}
      exportCount={exportCount}
    />,
  );
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
app.get("/download.csv", async (_c) => {
  await trackExport();
  const links = await getAllLinks();

  const escapeCSV = (s: string): string => `"${s.replace(/"/g, '""')}"`;

  let csv = "author,comment_url,extracted_link\n";
  for (const link of links) {
    csv += `${escapeCSV(link.author)},${escapeCSV(link.commentUrl)},${
      escapeCSV(link.extractedLink)
    }\n`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=hn_links.csv",
    },
  });
});

// JSX Components

interface PageProps {
  links: StoredLink[];
  total: number;
  totalPages: number;
  page: number;
  search: string;
  clickCounts: Record<string, number>;
  sort: SortField;
  order: SortOrder;
  exportCount: number;
}

const Page: FC<PageProps> = ({
  links,
  total,
  totalPages,
  page,
  search,
  clickCounts,
  sort,
  order,
  exportCount,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta
        name="description"
        content="A directory of hacker's personal sites."
      />
      <title>The Hacker's Directory</title>
      <link rel="icon" href="/static/favicon.png" type="image/png" />
      <link rel="stylesheet" href="/static/styles.css" />
    </head>
    <body>
      <header>
        <h1>
          <a href="/">The Hacker's Directory</a>
        </h1>
        <a href="/download.csv" download="hn_links.csv" class="download-link">
          Download CSV
        </a>
      </header>

      <div class="search-bar">
        <h2 class="tagline">A directory of hacker's personal sites.</h2>
        <form class="search-form" method="get" action="/">
          <input
            type="text"
            name="q"
            placeholder="Search by author or URL..."
            value={search}
          />
          <button type="submit">Search</button>
          {search && <a href="/">Clear</a>}
        </form>
      </div>

      <div class="stats">
        Showing {links.length} of {total}{" "}
        links{search && ` matching "${search}"`}
      </div>

      <table>
        <thead>
          <tr>
            <SortHeader
              field="author"
              label="Author"
              currentSort={sort}
              currentOrder={order}
              search={search}
            />
            <th>Site</th>
            <th>Comment</th>
            <SortHeader
              field="clicks"
              label="Clicks"
              currentSort={sort}
              currentOrder={order}
              search={search}
            />
            <SortHeader
              field="updated"
              label="Updated (UTC)"
              currentSort={sort}
              currentOrder={order}
              search={search}
            />
          </tr>
        </thead>
        <tbody>
          {links.length > 0
            ? (
              links.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  clicks={clickCounts[link.extractedLink] || 0}
                />
              ))
            )
            : (
              <tr>
                <td colspan={5} style="text-align: center; color: #666;">
                  No links found
                </td>
              </tr>
            )}
        </tbody>
      </table>

      <Pagination
        page={page}
        totalPages={totalPages}
        search={search}
        sort={sort}
        order={order}
      />

      <footer>
        <i>exported {exportCount} times</i>
        <span class="footer-dot">·</span>
        <a href="https://github.com/taptheglass/hacker-directory" class="footer-github">
          <img src="/static/github.svg" alt="GitHub" width="16" height="16" />
        </a>
      </footer>
    </body>
  </html>
);

interface SortHeaderProps {
  field: SortField;
  label: string;
  currentSort: SortField;
  currentOrder: SortOrder;
  search: string;
}

const SortHeader: FC<SortHeaderProps> = (
  { field, label, currentSort, currentOrder, search },
) => {
  const isActive = currentSort === field;
  const nextOrder = isActive && currentOrder === "desc" ? "asc" : "desc";
  const arrow = isActive ? (currentOrder === "desc" ? "↓" : "↑") : "↕";

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  params.set("sort", field);
  params.set("order", nextOrder);

  return (
    <th>
      {label} <a class="sort-arrow" href={`?${params.toString()}`}>{arrow}</a>
    </th>
  );
};

interface LinkRowProps {
  link: StoredLink;
  clicks: number;
}

const LinkRow: FC<LinkRowProps> = ({ link, clicks }) => {
  const displayUrl = link.extractedLink.length > 60
    ? link.extractedLink.slice(0, 60) + "..."
    : link.extractedLink;
  const displayDate = link.updatedAt.slice(0, 16).replace("T", " ");
  const trackingUrl = `/go?url=${encodeURIComponent(link.extractedLink)}`;

  return (
    <tr>
      <td class="author">{link.author}</td>
      <td class="link">
        <a href={trackingUrl} target="_blank" rel="noopener">{displayUrl}</a>
      </td>
      <td>
        <a href={link.commentUrl} target="_blank" rel="noopener">view</a>
      </td>
      <td class="clicks">{clicks}</td>
      <td class="updated">{displayDate}</td>
    </tr>
  );
};

interface PaginationProps {
  page: number;
  totalPages: number;
  search: string;
  sort: SortField;
  order: SortOrder;
}

const Pagination: FC<PaginationProps> = (
  { page, totalPages, search, sort, order },
) => {
  if (totalPages <= 1) return null;

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

  return (
    <div class="pagination">
      {page > 1
        ? <a href={`${prefix}page=${page - 1}`}>&laquo; Prev</a>
        : <span class="disabled">&laquo; Prev</span>}

      {pages.map((p, i) =>
        p === "..."
          ? <span key={i}>...</span>
          : p === page
          ? <span key={i} class="current">{p}</span>
          : <a key={i} href={`${prefix}page=${p}`}>{p}</a>
      )}

      {page < totalPages
        ? <a href={`${prefix}page=${page + 1}`}>Next &raquo;</a>
        : <span class="disabled">Next &raquo;</span>}
    </div>
  );
};

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
