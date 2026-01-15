/// <reference lib="deno.unstable" />
import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";
import { runScraper } from "./lib/scraper.ts";

// Run scraper on startup
console.log("Running initial scrape...");
await runScraper();

// Schedule hourly scrapes with Deno.cron
Deno.cron("scrape-hn", "0 * * * *", async () => {
  console.log("Running scheduled scrape...");
  await runScraper();
});

await start(manifest, config);
