/// <reference lib="deno.unstable" />
import * as cheerio from "cheerio";
import { saveLinks, getTotalCount } from "./db.ts";

const POST_ID = "46618714";
const BASE_URL = "https://news.ycombinator.com";

export interface Link {
  author: string;
  commentUrl: string;
  extractedLink: string;
}

export async function scrapeHnComments(postId: string): Promise<Link[]> {
  const url = `${BASE_URL}/item?id=${postId}`;

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
  const $ = cheerio.load(html);

  const results: Link[] = [];

  // Find all comment rows
  $("tr.athing.comtr").each((_index, row) => {
    const $row = $(row);

    // Check indent level - top-level comments have indent width of 0
    const indentImg = $row.find("td.ind img");
    if (indentImg.length === 0) return;

    const indentWidth = parseInt(indentImg.attr("width") || "0", 10);

    // Only process top-level comments (indent = 0)
    if (indentWidth !== 0) return;

    // Get comment ID for permalink
    const commentId = $row.attr("id");
    const commentUrl = commentId ? `${BASE_URL}/item?id=${commentId}` : "";

    // Get author
    const author = $row.find("a.hnuser").text() || "unknown";

    // Get comment text and extract links
    const $commentDiv = $row.find("div.commtext");
    if ($commentDiv.length === 0) return;

    // Find all links in the comment
    $commentDiv.find("a[href]").each((_i, link) => {
      let href = $(link).attr("href") || "";

      // Skip reply links and other HN internal links
      if (href.startsWith("reply?") || href.startsWith("user?")) {
        return;
      }

      // Make relative URLs absolute
      if (href.startsWith("/")) {
        href = `${BASE_URL}${href}`;
      }

      // Skip if no valid URL
      if (!href || href === "#") {
        return;
      }

      results.push({
        author,
        commentUrl,
        extractedLink: href,
      });
    });
  });

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
      `Scrape complete: ${newCount} new links added, ${totalCount} total`
    );
    return { newCount, totalCount };
  } catch (error) {
    console.error("Scrape failed:", error);
    return { newCount: 0, totalCount: 0 };
  }
}
