// /api/check.js
import { google } from "googleapis";
import { JWT } from "google-auth-library";

const GPT_KEY_MAP = {
  "BC_01": "gpt-bc",
  "GA_01": "gpt-ga",
  "VD_01": "gpt-video",
};

const HDR = {
  EMAIL: [
    "email", "email được phép sử dụng gpts", "email được phép sử dụng", "email cho phép sử dụng gpts", "địa chỉ email",
    "email duoc phep su dung gpts", "mail"
  ],
  EXPIRE: [
    "thời hạn sử dụng gpts", "thời hạn sử dụng", "ngày hết hạn", "hạn sử dụng",
    "han su dung", "thoi han su dung gpts", "expire", "expiry", "expiration"
  ],
  GPT_ID: [
    "gpts id", "gpt id", "gptid", "gptsid", "mã gpt", "ma gpt", "id"
  ],
};

function normLower(s = "") { return String(s).trim().toLowerCase(); }
function stripDiacritics(s = "") {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalizeHeader(s = "") {
  return stripDiacritics(normLower(s));
}
function headerIndex(headerRow, candidates) {
  const want = candidates.map(normalizeHeader);
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(headerRow[i] || "");
    if (want.includes(h)) return i;
  }
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(headerRow[i] || "");
    if (want.some(w => h.startsWith(w))) return i;
  }
  return -1;
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function parseDate(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  const mVn = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
  if (mVn) return new Date(+mVn[3], +mVn[2] - 1, +mVn[1]);
  const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (mIso) return new Date(+mIso[1], +mIso[2] - 1, +mIso[3]);
  const n = Number(t);
  if (!Number.isNaN(n) && n > 25000) {
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + n * 86400000);
  }
  return null;
}
function notExpired(expiryStr) {
  const d = parseDate(expiryStr);
  if (!d) return false;
  return startOfDay(d) >= startOfDay(new Date());
}

export default async function handler(req, res) {
  try {
    const email = normLower(req.query.email);
    const key = String(req.headers["x-gpt-key"] || "").trim();
    const gptFromQuery = normLower(req.query.gpt || "");
    const mapped = GPT_KEY_MAP[key] || "";
    const gptId = normLower(mapped || gptFromQuery);

    if (!email || !gptId) {
      throw new Error("Missing email or GPT identifier (x-gpt-key or gpt)");
    }

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const sheetName = process.env.SHEET_NAME || "";
    const sheetRange = process.env.SHEET_RANGE || "1:10000";
    const range = sheetName ? `${sheetName}!${sheetRange}` : sheetRange;

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range,
    });

    const values = resp.data.values || [];
    if (values.length === 0) {
      return res.status(200).json({ access: false, gpt: gptId, expiry: null, debug: "Sheet is empty" });
    }

    const header = values[0];
    const idxEmail  = headerIndex(header, HDR.EMAIL);
    const idxExpiry = headerIndex(header, HDR.EXPIRE);
    const idxGptId  = headerIndex(header, HDR.GPT_ID);

    if (idxEmail < 0 || idxGptId < 0 || idxExpiry < 0) {
      throw new Error(`Header mapping failed. Found: ${JSON.stringify(header)}`);
    }

    let matchedExpiry = null;
    let ok = false;

    for (let i = 1; i < values.length; i++) {
      const row = values[i] || [];
      const e = normLower(row[idxEmail] || "");
      const g = normLower(row[idxGptId] || "");
      const ex = row[idxExpiry];

      if (!e || !g) continue;
      if (e === email && g === gptId) {
        matchedExpiry = ex || null;
        ok = notExpired(ex);
        break;
      }
    }

    return res.status(200).json({ access: ok, gpt: gptId, expiry: matchedExpiry });
  } catch (err) {
    console.error("checkAccess error:", err);
    return res.status(500).json({
      access: false,
      error: err.message || "Server error",
      stack: err.stack,
    });
  }
}
