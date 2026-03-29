/**
 * One-off: minify GOOGLE_SERVICE_ACCOUNT_JSON for .env.local (single line).
 * Run: node scripts/minify-google-env.js
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env.local");
const text = fs.readFileSync(envPath, "utf8");
const start = text.indexOf("GOOGLE_SERVICE_ACCOUNT_JSON=");
const sheet = text.indexOf("GOOGLE_SHEET_ID=");
if (start < 0 || sheet < 0) {
    console.error("Could not find GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID in .env.local");
    process.exit(1);
}
const jsonPart = text.slice(start + "GOOGLE_SERVICE_ACCOUNT_JSON=".length, sheet).trim();
let obj;
try {
    obj = JSON.parse(jsonPart);
} catch (e) {
    console.error("JSON parse error:", e.message);
    process.exit(1);
}
const required = ["type", "project_id", "private_key", "client_email", "token_uri"];
for (const k of required) {
    if (!obj[k]) console.warn("Missing field:", k);
}
if (obj.type !== "service_account") console.warn('Expected type "service_account"');
// One line: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) in app code
const line = "GOOGLE_SERVICE_ACCOUNT_JSON=" + JSON.stringify(obj) + "\n";
const newText =
    text.slice(0, start) + line + text.slice(sheet);
fs.writeFileSync(envPath, newText, "utf8");
console.log("Updated .env.local: GOOGLE_SERVICE_ACCOUNT_JSON is now one line (valid for dotenv).");
