/* eslint-disable no-console */
const http = require("node:http");
const path = require("node:path");

/**
 * Plesk/Passenger entrypoint.
 *
 * This repo is a monorepo. The production website lives in `apps/web`.
 * Passenger expects a single startup file (historically `server.js`).
 *
 * Deploy flow:
 * - `npm install` (repo root)
 * - `npm run build:web` (repo root)
 * - Start this file via Plesk Node.js settings
 */

const next = require("next");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOSTNAME || "0.0.0.0";

const appDir = path.join(__dirname, "apps", "web");

const app = next({ dev: false, dir: appDir });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    http
      .createServer((req, res) => handle(req, res))
      .listen(port, host, () => {
        console.log(`Web app ready on http://${host}:${port} (dir=${appDir})`);
      });
  })
  .catch((err) => {
    console.error("Failed to start Next.js server:", err);
    process.exit(1);
  });

