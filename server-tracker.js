/* eslint-disable no-console */
const http = require("node:http");
const path = require("node:path");

/**
 * Plesk/Passenger entrypoint for the stat tracker app (`apps/tracker`).
 *
 * The tracker subdomain (e.g. tracker.burhanisportsclub.com) reuses the same
 * repo clone as the main website — point its Plesk Node.js "Application Root"
 * at this repo and use this file as the Application Startup File.
 *
 * Deploy flow (shared with the website):
 * - `npm install` (repo root)
 * - `npm run build` (repo root — builds web + tracker)
 * - Start this file via the subdomain's Plesk Node.js settings
 */

const next = require("next");

const port = Number(process.env.PORT || 3001);
const host = process.env.HOSTNAME || "0.0.0.0";

const appDir = path.join(__dirname, "apps", "tracker");

const app = next({ dev: false, dir: appDir });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    http
      .createServer((req, res) => handle(req, res))
      .listen(port, host, () => {
        console.log(`Tracker app ready on http://${host}:${port} (dir=${appDir})`);
      });
  })
  .catch((err) => {
    console.error("Failed to start Next.js tracker server:", err);
    process.exit(1);
  });
