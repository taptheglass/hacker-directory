import { Handlers } from "$fresh/server.ts";
import { getAllLinks } from "../lib/db.ts";

export const handler: Handlers = {
  async GET(_req, _ctx) {
    const links = await getAllLinks();

    const escapeCSV = (s: string): string => {
      return `"${s.replace(/"/g, '""')}"`;
    };

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
  },
};
