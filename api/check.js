const { google } = require("googleapis");
const { JWT } = require("google-auth-library");

// Header mapping chuẩn
const HDR = {
  EMAIL: ["email", "email được phép sử dụng gpts", "email cho phép sử dụng gpts", "email được phép sử dụng", "email chophép sử dụng", "địa chỉ email", "email duoc phep su dung gpts"],
  EXPIRE: ["thời hạn sử dụng gpts", "thời hạn sử dụng", "ngày hết hạn", "hạn sử dụng", "thoi han su dung gpts", "expiry", "han su dung"],
  GPT_ID: ["id", "gpt id", "gpts id", "mã gpt", "ma gpt"],
  GPT_NAME: ["tên gpts", "ten gpts", "ten gpt", "gpts name", "gpt name", "tên gpt"],
  SENT_5D: ["đã gửi trước 5 ngày", "nhắc trước 5 ngày", "nhắc hết hạn trước 5 ngày", "nhắc hạn trước 5 ngày", "da gui truoc 5 ngay", "sent 5d", "nhac 5 ngay"],
  SENT_1D: ["đã gửi trước 1 ngày", "nhắc trước 1 ngày", "nhắc hết hạn trước 1 ngày", "nhắc hạn trước 1 ngày", "da gui truoc 1 ngay", "sent 1d", "nhac 1 ngay"],
};

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function findColIndex(headerRow, possibleNames) {
  const normHeader = headerRow.map(normalize);
  const normPossible = possibleNames.map(normalize);
  return normHeader.findIndex(h => normPossible.includes(h));
}

function parseDate(str) {
  if (!str) return null;
  const [d, m, y] = str.split(/[\/\-]/).map(v => parseInt(v, 10));
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function notExpired(expiryStr) {
  // Nếu để trống hoặc null => coi như không giới hạn
  if (!expiryStr || String(expiryStr).trim() === "") {
    return true;
  }
  const d = parseDate(expiryStr);
  if (!d) return false;
  return startOfDay(d) >= startOfDay(new Date());
}

async function checkAccess(req, res) {
  try {
    const email = req.query.email?.trim();
    const gpt = req.query.gpt?.trim();
    if (!email || !gpt) {
      return res.json({ access: false, error: "Missing required parameters: email, gpt" });
    }

    const client = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth: client });
    const sheetId = process.env.SHEET_ID;
    if (!sheetId) {
      return res.json({ access: false, error: "Missing SHEET_ID in environment variables" });
    }

    const range = process.env.SHEET_RANGE || "A1:Z1000";
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    const rows = resp.data.values;
    if (!rows || rows.length === 0) {
      return res.json({ access: false, error: "No data in sheet" });
    }

    // Map cột
    const header = rows[0];
    const idxEmail = findColIndex(header, HDR.EMAIL);
    const idxExpire = findColIndex(header, HDR.EXPIRE);
    const idxGptId = findColIndex(header, HDR.GPT_ID);

    if (idxEmail === -1 || idxExpire === -1 || idxGptId === -1) {
      return res.json({ access: false, error: "Header mapping failed", headers: header });
    }

    // Tìm bản ghi phù hợp
    const match = rows.slice(1).find(row => {
      const emailCell = row[idxEmail]?.trim().toLowerCase();
      const gptCell = row[idxGptId]?.trim().toLowerCase();
      return emailCell === email.toLowerCase() && gptCell === gpt.toLowerCase();
    });

    if (!match) {
      return res.json({ access: false, gpt, expiry: null });
    }

    const expiry = match[idxExpire] || "";
    const access = notExpired(expiry);

    return res.json({ access, gpt, expiry: expiry || null });

  } catch (err) {
    return res.json({ access: false, error: err.message, stack: err.stack });
  }
}

module.exports = checkAccess;
