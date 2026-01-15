import { Handlers } from "$fresh/server.ts";
import { trackClick } from "../lib/db.ts";

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return new Response("Missing url parameter", { status: 400 });
    }

    // Track the click
    await trackClick(target);

    // Redirect to the target URL
    return Response.redirect(target, 302);
  },
};
