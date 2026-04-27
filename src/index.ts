import http from "node:http";
import cron from "node-cron";
import { syncAIModels } from "./trigger/sync-models.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

// Health check server (Railway needs a listening port)
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", lastSync, nextCron: "0 0 * * * (daily at midnight UTC)" }));
});

let lastSync: string | null = null;

async function runSync() {
  console.log(`[${new Date().toISOString()}] Starting sync...`);
  try {
    const result = await syncAIModels();
    lastSync = new Date().toISOString();
    console.log(`[${lastSync}] Sync completed:`, result);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Sync failed:`, error);
  }
}

// Schedule: every day at midnight UTC (same as the original Trigger.dev cron)
cron.schedule("0 0 * * *", () => {
  runSync();
});

// Run once on startup
runSync();

server.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
  console.log("Cron scheduled: 0 0 * * * (daily at midnight UTC)");
});
