import { parseHTML } from "linkedom";
import { getTotalCount, saveLinks } from "./db.ts";

const POST_ID = "46618714";
const BASE_URL = "https://news.ycombinator.com";

export interface Link {
  author: string;
  commentUrl: string;
  extractedLink: string;
}

export async function scrapeHnComments(postId: string): Promise<Link[]> {
  const url = `${BASE_URL}/item?id=${postId}`;
  console.log(`Fetching HN comments from ${url}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  const html = await response.text();
  const { document: doc } = parseHTML(html);

  const results: Link[] = [];
  console.log("Parsing comment threads...");

  // Find all comment rows.
  const rows = doc.querySelectorAll("tr.athing.comtr");
  console.log(`Found ${rows.length} comment rows`);
  let processed = 0;
  let topLevel = 0;
  for (const row of rows) {
    processed += 1;
    if (processed % 50 === 0) {
      console.log(`Processed ${processed}/${rows.length} rows...`);
    }
    // Check indent level - top-level comments have indent width of 0.
    const indentImg = row.querySelector("td.ind img");
    if (!indentImg) continue;

    const indentWidth = parseInt(indentImg.getAttribute("width") || "0", 10);

    // Only process top-level comments (indent = 0).
    if (indentWidth !== 0) continue;
    topLevel += 1;

    // Get comment ID for permalink.
    const commentId = row.getAttribute("id");
    const commentUrl = commentId ? `${BASE_URL}/item?id=${commentId}` : "";

    // Get author.
    const author = row.querySelector("a.hnuser")?.textContent?.trim() ||
      "unknown";

    // Get comment text and extract links.
    const commentContent = row.querySelector(".commtext");
    if (!commentContent) continue;

    // Find all links in the comment.
    const links = commentContent.querySelectorAll("a[href]");
    for (const link of links) {
      let href = link.getAttribute("href") || "";

      // Skip reply links and other HN internal links.
      if (href.startsWith("reply?") || href.startsWith("user?")) {
        continue;
      }

      // Make relative URLs absolute.
      if (href.startsWith("/")) {
        href = `${BASE_URL}${href}`;
      }

      // Skip if no valid URL.
      if (!href || href === "#") {
        continue;
      }

      results.push({
        author,
        commentUrl,
        extractedLink: href,
      });
    }
  }

  console.log(
    `Parsed ${topLevel} top-level comments, extracted ${results.length} links`,
  );
  return results;
}

export async function runScraper(): Promise<{
  newCount: number;
  totalCount: number;
}> {
  console.log(`Scraping HN post: ${BASE_URL}/item?id=${POST_ID}`);

  try {
    const links = await scrapeHnComments(POST_ID);
    const newCount = await saveLinks(links);
    const totalCount = await getTotalCount();

    console.log(
      `Scrape complete: ${newCount} new links added, ${totalCount} total`,
    );
    return { newCount, totalCount };
  } catch (error) {
    console.error("Scrape failed:", error);
    return { newCount: 0, totalCount: 0 };
  }
}
