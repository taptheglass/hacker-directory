import { Handlers, PageProps } from "$fresh/server.ts";
import { getLinks, getClickCounts, type QueryResult, type StoredLink } from "../lib/db.ts";

const PER_PAGE = 50;

type SortField = "author" | "clicks" | "updated";
type SortOrder = "asc" | "desc";

interface PageData extends QueryResult {
  page: number;
  search: string;
  clickCounts: Record<string, number>;
  sort: SortField;
  order: SortOrder;
}

export const handler: Handlers<PageData> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const search = url.searchParams.get("q")?.trim() || "";
    const sort = (url.searchParams.get("sort") || "updated") as SortField;
    const order = (url.searchParams.get("order") || "desc") as SortOrder;

    const result = await getLinks({ page, perPage: PER_PAGE, search, sort, order });

    // Get click counts for displayed links
    const urls = result.links.map((link) => link.extractedLink);
    const clickCountsMap = await getClickCounts(urls);
    const clickCounts: Record<string, number> = {};
    for (const [url, count] of clickCountsMap) {
      clickCounts[url] = count;
    }

    return ctx.render({
      ...result,
      page,
      search,
      clickCounts,
      sort,
      order,
    });
  },
};

function Pagination({ page, totalPages, search, sort, order }: {
  page: number;
  totalPages: number;
  search: string;
  sort: SortField;
  order: SortOrder;
}) {
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
      {page > 1 ? (
        <a href={`${prefix}page=${page - 1}`}>&laquo; Prev</a>
      ) : (
        <span class="disabled">&laquo; Prev</span>
      )}

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={i}>...</span>
        ) : p === page ? (
          <span key={i} class="current">{p}</span>
        ) : (
          <a key={i} href={`${prefix}page=${p}`}>{p}</a>
        )
      )}

      {page < totalPages ? (
        <a href={`${prefix}page=${page + 1}`}>Next &raquo;</a>
      ) : (
        <span class="disabled">Next &raquo;</span>
      )}
    </div>
  );
}

function SortHeader({
  field,
  label,
  currentSort,
  currentOrder,
  search
}: {
  field: SortField;
  label: string;
  currentSort: SortField;
  currentOrder: SortOrder;
  search: string;
}) {
  const isActive = currentSort === field;
  const nextOrder = isActive && currentOrder === "desc" ? "asc" : "desc";

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  params.set("sort", field);
  params.set("order", nextOrder);

  const arrow = isActive ? (currentOrder === "desc" ? "↓" : "↑") : "↕";

  return (
    <th>
      {label} <a class="sort-arrow" href={`?${params.toString()}`}>{arrow}</a>
    </th>
  );
}

function LinkRow({ link, clicks }: { link: StoredLink; clicks: number }) {
  const displayUrl = link.extractedLink.length > 60
    ? link.extractedLink.slice(0, 60) + "..."
    : link.extractedLink;

  const displayDate = link.updatedAt.slice(0, 16).replace("T", " ");
  const trackingUrl = `/go?url=${encodeURIComponent(link.extractedLink)}`;

  return (
    <tr>
      <td class="author">{link.author}</td>
      <td class="link">
        <a href={trackingUrl} target="_blank" rel="noopener">
          {displayUrl}
        </a>
      </td>
      <td>
        <a href={link.commentUrl} target="_blank" rel="noopener">view</a>
      </td>
      <td class="clicks">{clicks}</td>
      <td class="updated">{displayDate}</td>
    </tr>
  );
}

export default function Home({ data }: PageProps<PageData>) {
  const { links, total, totalPages, page, search, clickCounts, sort, order } = data;

  return (
    <>
      <header>
        <h1>The Hacker's Directory</h1>
        <a href="/download.csv" class="download-link">Download CSV</a>
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
        Showing {links.length} of {total} links
        {search && ` matching "${search}"`}
      </div>

      <table>
        <thead>
          <tr>
            <SortHeader field="author" label="Author" currentSort={sort} currentOrder={order} search={search} />
            <th>Site</th>
            <th>Comment</th>
            <SortHeader field="clicks" label="Clicks" currentSort={sort} currentOrder={order} search={search} />
            <SortHeader field="updated" label="Updated (UTC)" currentSort={sort} currentOrder={order} search={search} />
          </tr>
        </thead>
        <tbody>
          {links.length > 0 ? (
            links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                clicks={clickCounts[link.extractedLink] || 0}
              />
            ))
          ) : (
            <tr>
              <td colspan={5} style="text-align: center; color: #666;">
                No links found
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Pagination page={page} totalPages={totalPages} search={search} sort={sort} order={order} />
    </>
  );
}
