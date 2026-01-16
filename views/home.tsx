/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import type { SortField, SortOrder, StoredLink } from "../lib/db.ts";
import { Navbar } from "./components/navbar.tsx";

interface PageProps {
  links: StoredLink[];
  total: number;
  totalPages: number;
  page: number;
  search: string;
  clickCounts: Record<string, number>;
  likeCounts: Record<string, number>;
  userLiked: Record<string, boolean>;
  sort: SortField;
  order: SortOrder;
  exportCount: number;
}

export const Home: FC<PageProps> = ({
  links,
  total,
  totalPages,
  page,
  search,
  clickCounts,
  likeCounts,
  userLiked,
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
        content="A directory of hackers' personal sites."
      />
      <title>The Hacker's Directory</title>
      <link rel="icon" href="/static/favicon.png" type="image/png" />
      <link rel="stylesheet" href="/static/styles.css" />
      {/* Google tag (gtag.js) */}
      <script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-J943R9DE44"
      >
      </script>
      <script
        dangerouslySetInnerHTML={{
          __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-J943R9DE44');
        `,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
          document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.heart-btn').forEach(function(btn) {
              btn.addEventListener('click', async function() {
                const url = decodeURIComponent(this.dataset.url);
                const likesCell = this.closest('tr').querySelector('.likes');

                try {
                  const response = await fetch('/like', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url })
                  });

                  if (response.ok) {
                    const data = await response.json();
                    likesCell.textContent = data.count;
                    this.dataset.likes = data.count;

                    if (data.liked) {
                      this.classList.add('liked');
                      this.textContent = '\u2665';
                      this.setAttribute('aria-label', 'Unlike');
                    } else {
                      this.classList.remove('liked');
                      this.textContent = '\u2661';
                      this.setAttribute('aria-label', 'Like');
                    }
                  }
                } catch (err) {
                  console.error('Failed to toggle like:', err);
                }
              });
            });
          });
        `,
        }}
      />
    </head>
    <body>
      <Navbar />

      <div class="search-bar">
        <h2 class="tagline">A directory of hackers' personal sites.</h2>
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
              field="likes"
              label="Likes"
              currentSort={sort}
              currentOrder={order}
              search={search}
            />
            <SortHeader
              field="clicks"
              label="Clicks"
              currentSort={sort}
              currentOrder={order}
              search={search}
            />
            <th>Like</th>
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
                  likes={likeCounts[link.extractedLink] || 0}
                  liked={userLiked[link.extractedLink] || false}
                />
              ))
            )
            : (
              <tr>
                <td colspan={6} style="text-align: center; color: #666;">
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
        <span class="footer-dot">\u00b7</span>
        <a
          href="https://www.paypal.com/ncp/payment/VNGWLASB3634W"
          class="footer-link"
          target="_blank"
          rel="noopener"
        >
          support
        </a>
        <span class="footer-dot">\u00b7</span>
        <a
          href="https://github.com/taptheglass/hacker-directory"
          class="footer-github"
        >
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
  const arrow = isActive ? (currentOrder === "desc" ? "\u2193" : "\u2191") : "\u2195";

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
  likes: number;
  liked: boolean;
}

const LinkRow: FC<LinkRowProps> = ({ link, clicks, likes, liked }) => {
  const displayUrl = link.extractedLink.length > 60
    ? link.extractedLink.slice(0, 60) + "..."
    : link.extractedLink;
  const trackingUrl = `/go?url=${encodeURIComponent(link.extractedLink)}`;
  const encodedUrl = encodeURIComponent(link.extractedLink);

  return (
    <tr>
      <td class="author">{link.author}</td>
      <td class="link">
        <a href={trackingUrl} target="_blank" rel="noopener">{displayUrl}</a>
      </td>
      <td>
        <a href={link.commentUrl} target="_blank" rel="noopener">view</a>
      </td>
      <td class="likes">{likes}</td>
      <td class="clicks">{clicks}</td>
      <td class="like-cell">
        <button
          type="button"
          class={`heart-btn ${liked ? "liked" : ""}`}
          data-url={encodedUrl}
          data-likes={likes}
          aria-label={liked ? "Unlike" : "Like"}
        >
          {liked ? "\u2665" : "\u2661"}
        </button>
      </td>
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
  if (sort !== "likes") params.set("sort", sort);
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
