/**
 * Simple JSON file store for payments (demo / small VPS).
 * Replace with Postgres/Mongo in production.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.PAYMENTS_STORE || path.join(__dirname, "payments-data.json");

function readAll() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeAll(rows) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2));
}

export const paymentStore = {
  async insert(row) {
    const all = readAll();
    all.push(row);
    writeAll(all);
    return row;
  },
  async findByReference(reference) {
    return readAll().find((p) => p.reference === reference) || null;
  },
  async findById(id) {
    return readAll().find((p) => p.id === id) || null;
  },
  async update(id, patch) {
    const all = readAll();
    const i = all.findIndex((p) => p.id === id);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch };
    writeAll(all);
    return all[i];
  },
  async list(limit = 50) {
    return readAll().slice(-limit).reverse();
  }
};
