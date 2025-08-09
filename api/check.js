// /api/check.js
import { google } from "googleapis";
import { JWT } from "google-auth-library";

/** ================= ENV & CONFIG ================= **/
const SHEET_ID     = process.env.SHEET_ID;                  // bắt buộc
const SHEET_NAME   = process.env.SHEET_NAME || "";          // rỗng = sheet đầu
const SHEET_RANGE  = process.env.SHEET_RANGE || "1:10000";  // đọc cả header (hàng 1)
const REQUIRE_NAME_MATCH = (process.env.REQUIRE_NAME_MATCH || "true").toLowerCase() === "true";

// Map khóa header -> { id, name } (điền theo GPT của anh)
const GPT_KEY_MAP = {
  // "BC_01": { id: "gpt-bc",    name: "Trợ lý Báo cáo" },
  // "GA_01": { id: "gpt-ga",    name: "Trợ lý Giáo Án" },
  // "VD_01": { id: "gpt-video", name: "Trợ lý Video"  },
};

/** ================= HEADER MAPPING ================= **/
const HDR = {
  EMAIL:   ["email", "email được phép sử dụng gpts", "địa chỉ email", "email duoc phep su dung gpts", "mail"],
  EXPIRE:  ["thời hạn sử dụng", "thời hạn sử dụng gpts", "ngày hết hạn", "hạn sử dụng", "thoi han su dung", "han su dung", "expiry", "expiration", "expire"],
  GPT_ID:  ["gpts id", "gpt id", "mã gpt", "ma gpt", "id"],
  GPT_NAME:["tên gpts", "ten gpts", "ten gpt", "GPTs Name", "tên gpt", "name", "ten"],
};

/** ================= HELPERS ================= **/
function normLower(s = "") { return String(s).trim().toLowerCase(); }
function stripDiacritics(s = "") { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function normalizeHeader(s = "") { return stripDiacritics(normLower(s)); }

function headerIndex(headerRow, candidates) {
  const want = candidates.map(normalizeHeader);
  // exact
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(headerRow[i] || "");
    if (want.includes(h)) return i;
  }
  // startsWith (2 chiều)
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(headerRow[i] || "");
    if (want.some(w => h.startsWith(w) || w.startsWith(h))) return i;
  }
  // includes
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(headerRow[i] || "");
    if (want.some(w => h.includes(w) || w.includes(h))) return i;
  }
  return -1;
}

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

// Ưu tiên dd/MM/yyyy; hỗ trợ ISO & serial Sheets
function parseDate(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  const mVn = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
  if (mVn) return new Date(+mVn[3], +mVn[2]-1, +mVn[1]);
  const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (mIso) return new Date(+mIso[1], +mIso[2]-1, +mIso[3]);
  const n = Number(t);
  if (!Number.isNaN(n) && n > 25000) { // serial date
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + n * 86400000);
  }
  return null;
}

// Expiry rỗng => không giới hạn
function notExpired(expiryStr) {
  if (!expiryStr || String(expiryStr).trim() === "") return true;
  const d = parseDate(expiryStr);
  if (!d) return false;
  return startOfDay(d) >= startOfDay(new Date());
}

function daysLeft(expiryStr) {
  if (!expiryStr || String(expiryStr).trim() === "") return Infinity;
  const d = parseDate(expiryStr);
  if (!d) return -9999;
  return Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
}

/** ================= MAIN HANDLER ================= **/
export default async function handler(req, res) {
  try {
    if (!SHEET_ID) return res.status(500).json({ access:false, error:"Missing SHEET_ID env var" });

    const email = normLower(req.query.email || "");
    // Ưu tiên header x-gpt-key -> map; nếu không có thì dùng ?gpt=&name=
    const headerKey = String(req.headers["x-gpt-key"] || "").trim();
    const mapped    = headerKey ? GPT_KEY_MAP[headerKey] : null;

    const expectedId   = normLower(mapped?.id   || req.query.gpt   || "");
    const expectedName = normLower(mapped?.name || req.query.name  || "");

    if (!email || !expectedId) {
      return res.status(400).json({ access:false, error:"Missing params: email & (gpt or x-gpt-key)" });
    }
    if (REQUIRE_NAME_MATCH && !expectedName) {
      return res.status(400).json({ access:false, error:"Missing GPT name (name or x-gpt-key map) while REQUIRE_NAME_MATCH=true" });
    }

    // Auth (cần quyền sửa để tô màu Expiry)
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    const sheets = google.sheets({ version: "v4", auth });

    // 1) Đọc dữ liệu
    const range = (SHEET_NAME ? `${SHEET_NAME}!` : "") + SHEET_RANGE;
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
    const values = resp.data.values || [];
    if (values.length === 0) {
      return res.status(200).json({ access:false, gpt: expectedId, name: expectedName || null, expiry:null, debug:"Sheet empty" });
    }

    const header = values[0];
    const idxEmail   = headerIndex(header, HDR.EMAIL);
    const idxExpiry  = headerIndex(header, HDR.EXPIRE);
    const idxGptId   = headerIndex(header, HDR.GPT_ID);
    const idxGptName = headerIndex(header, HDR.GPT_NAME); // có thể -1 nếu không dùng tên

    if (idxEmail < 0 || idxExpiry < 0 || idxGptId < 0) {
      return res.status(500).json({ access:false, error:"Header mapping failed", headers: header });
    }
    if (REQUIRE_NAME_MATCH && idxGptName < 0) {
      return res.status(500).json({ access:false, error:"Header 'Tên GPTs' not found while REQUIRE_NAME_MATCH=true", headers: header });
    }

    // 2) Tìm dòng khớp: ưu tiên Exact > Wildcard(*)
    let exactRowIdx0 = -1, exactExpiry = null;
    let wildcardRowIdx0 = -1, wildcardExpiry = null;

    for (let i = 1; i < values.length; i++) {
      const row = values[i] || [];
      const e = normLower(row[idxEmail]  || "");
      const g = normLower(row[idxGptId]  || "");
      const n = (idxGptName >= 0) ? normLower(row[idxGptName] || "") : "";

      if (e !== email) continue;

      // Exact: ID (và Name nếu bật)
      const idOk   = (g === expectedId);
      const nameOk = !REQUIRE_NAME_MATCH || (idxGptName < 0) || (n === expectedName);

      if (idOk && nameOk) {
        exactRowIdx0 = i;
        exactExpiry  = row[idxExpiry] || "";
        break; // có exact là dừng
      }

      // Wildcard: GPTs ID="*" và (Tên="*" hoặc trống khi yêu cầu name)
      const isWildcardId   = (g === "*");
      const isWildcardName = !REQUIRE_NAME_MATCH || (idxGptName < 0) || (n === "*" || n === "");
      if (isWildcardId && isWildcardName && wildcardRowIdx0 === -1) {
        wildcardRowIdx0 = i;
        wildcardExpiry  = row[idxExpiry] || "";
        // không break; tiếp tục tìm exact
      }
    }

    let matchedRowIdx0 = -1, expiryCell = null;
    if (exactRowIdx0 > 0) {
      matchedRowIdx0 = exactRowIdx0; expiryCell = exactExpiry;
    } else if (wildcardRowIdx0 > 0) {
      matchedRowIdx0 = wildcardRowIdx0; expiryCell = wildcardExpiry;
    }

    const access = matchedRowIdx0 > 0 ? notExpired(expiryCell) : false;

    // 3) Tô màu CHỈ ô Expiry của dòng được dùng (nếu có)
    if (matchedRowIdx0 > 0) {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
        fields: "sheets(properties(sheetId,title))"
      });
      const sheetProp = SHEET_NAME
        ? meta.data.sheets.find(s => (s.properties?.title || "") === SHEET_NAME)
        : meta.data.sheets[0];
      const sheetId = sheetProp?.properties?.sheetId;

      if (sheetId != null) {
        const RED   = { red: 0.99, green: 0.91, blue: 0.91 };
        const YEL   = { red: 1.00, green: 0.97, blue: 0.85 };
        const WHITE = { red: 1.00, green: 1.00, blue: 1.00 };

        let bg = WHITE;
        const dLeft = daysLeft(expiryCell);
        if (dLeft < 0) bg = RED;
        else if (dLeft <= 5) bg = YEL;

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: {
            requests: [{
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: matchedRowIdx0,
                  endRowIndex: matchedRowIdx0 + 1,
                  startColumnIndex: idxExpiry,
                  endColumnIndex: idxExpiry + 1
                },
                cell: { userEnteredFormat: { backgroundColor: bg } },
                fields: "userEnteredFormat.backgroundColor"
              }
            }]
          }
        });
      }
    }

    return res.status(200).json({
      access,
      gpt: expectedId,
      name: expectedName || null,
      expiry: expiryCell || null
    });

  } catch (err) {
    console.error("checkAccess error:", err);
    return res.status(500).json({ access:false, error: err.message, stack: err.stack });
  }
}
