import { runScraper } from "../lib/scraper.ts";

console.log("Syncing database from HN...");
const result = await runScraper();
console.log(`Done. ${result.newCount} new links, ${result.totalCount} total.`);
