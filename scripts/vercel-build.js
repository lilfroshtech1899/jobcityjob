/* ============================================================
 * Jobcityjob — Vercel build helper.
 * 1. Generates js/env-config.js from environment variables
 *    (reuses scripts/gen-env-config.js).
 * 2. Assembles the static SPA into public/ so Vercel has an
 *    Output Directory to serve (see vercel.json#outputDirectory).
 *
 * The deployed site is the contents of public/: index.html,
 * 404.html, robots.txt, sitemap.xml, _redirects, css/, js/,
 * assets/.
 *
 * Usage:  node scripts/vercel-build.js
 * ============================================================ */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

await import("./gen-env-config.js");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = ["index.html", "404.html", "robots.txt", "sitemap.xml", "_redirects"];
for (const f of files) {
  cpSync(join(root, f), join(out, f), { force: true });
}

const dirs = ["css", "js", "assets"];
for (const d of dirs) {
  cpSync(join(root, d), join(out, d), { recursive: true });
}

console.log("[jobcityjob] static site assembled into public/ for Vercel.");