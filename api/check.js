// /api/check.js
import { google } from "googleapis";
import { JWT } from "google-auth-library";

// ===================== CONFIG =====================
const SHEET_ID = process.env.SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || "";
const SHEET_RANGE = process.env.SHEET_RANGE || "1:10000";

// ===================== HEADER MAP =====================
const HDR = {
  EMAIL: ["email", "email được phép sử dụng gpts", "email cho phép sử dụng gpts", "email được phép sử dụng", "email chophép sử dụng", "địa chỉ email", "email duoc phep su dung gpts"],
  EXPIRE: ["thời hạn sử dụng gpts", "thời hạn sử dụng", "ngày hết hạn", "hạn sử dụng", "thoi han su dung gpts", "expiry", "han su dung"],
  GPT_ID: ["id", "gpt id", "gpts id", "mã gpt", "ma gpt"],
  GPT_NAME: ["tên gpts", "ten gpts", "ten gpt", "gpts name", "gpt name", "tên gpt"],
  SENT_5D: ["đã gửi trước 5 ngày", "nhắc trước 5 ngày", "nhắc hết hạn trước 5 ngày", "nhắc hạn trước 5 ngày", "da gui truoc 5 ngay", "sent 5d", "nhac 5 ngay"],
  SENT_1D: ["đã gửi trước 1 ngày", "nhắc trước 1 ngày", "nhắc hết hạn trước 1 ngày", "nhắc hạn trước 1 ngày", "da gui truoc 1 ngay", "sent 1d", "nhac 1 ngay"],
};

// ===================== HELPERS =====================
function normLower(s = "") { return String(s).trim().toLowerCase(); }
function stripDiacritics(s = "") { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function normalizeHeader(s = "") { return stripDiacritics(normLower(s)); }

function headerIndex(headerRow, candidates) {
  const want = candidates.map(normalizeHeader);
  for (let i=0; i<headerRow.length; i++){
    const h = normalizeHeader(headerRow[i] || "");
    if (want.includes(h)) return i;
  }
  return -1;
}

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function parseDate(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  const mVn = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
  if (mVn) return new Date(+mVn[3], +mVn[2]-1, +mVn[1]);
  const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (mIso) return new Date(+mIso[1], +mIso[2]-1, +mIso[3]);
  const n = Number(t);
  if (!Number.isNaN(n) && n > 25000) {
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + n*86400000);
  }
  return null;
}

function notExpired(expiryStr) {
  if (!expiryStr || String(expiryStr).trim() === "") return true;
  const d = parseDate(expiryStr);
  if (!d) return false;
  return startOfDay(d) >= startOfDay(new Date());
}

function daysLeft(expiryStr) {
  if (!expiryStr || String(expiryStr).trim() === "") return Infinity;
  const d = parseDate(expiryStr);
  if (!d) return -9999; // lỗi ngày
  return Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
}

// ===================== MAIN HANDLER =====================
export default async function handler(req, res) {
  try {
    if (!SHEET_ID) return res.status(500).json({ access:false, error:"Missing SHEET_ID env var" });

    const email = normLower(req.query.email || "");
    const gpt   = normLower(req.query.gpt || "");
    if (!email || !gpt) return res.status(400).json({ access:false, error:"Missing required parameters: email, gpt" });

    // Auth
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    const sheets = google.sheets({ version:"v4", auth });

    // Lấy dữ liệu
    const range = (SHEET_NAME ? `${SHEET_NAME}!` : "") + SHEET_RANGE;
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
    const values = resp.data.values || [];
    if (values.length === 0) return res.status(200).json({ access:false, gpt, expiry:null });

    const header = values[0];
    const idxEmail  = headerIndex(header, HDR.EMAIL);
    const idxExpiry = headerIndex(header, HDR.EXPIRE);
    const idxGptId  = headerIndex(header, HDR.GPT_ID);
    if (idxEmail < 0 || idxExpiry < 0 || idxGptId < 0) {
      return res.status(500).json({ access:false, error:`Header mapping failed`, headers: header });
    }

    // Tìm dòng khớp
    let matchedRowIdx0 = -1;
    let expiryCell = null;
    for (let i=1; i<values.length; i++){
      const row = values[i] || [];
      const e = normLower(row[idxEmail] || "");
      const g = normLower(row[idxGptId] || "");
      if (e === email && g === gpt) {
        matchedRowIdx0 = i;
        expiryCell = row[idxExpiry] || "";
        break;
      }
    }

    const access = matchedRowIdx0 > 0 ? notExpired(expiryCell) : false;

    // Tô màu chỉ cột Expiry
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
                  endRowIndex: matchedRowIdx0+1,
                  startColumnIndex: idxExpiry,
                  endColumnIndex: idxExpiry+1
                },
                cell: { userEnteredFormat: { backgroundColor: bg } },
                fields: "userEnteredFormat.backgroundColor"
              }
            }]
          }
        });
      }
    }

    return res.status(200).json({ access, gpt, expiry: expiryCell || null });

  } catch (err) {
    return res.status(500).json({ access:false, error: err.message, stack: err.stack });
  }
}
