// api/check.js
const { google } = require("googleapis");
const { JWT } = require("google-auth-library");

// ====== ENV cần có ======
// SHEET_ID=...
// GOOGLE_CLIENT_EMAIL=...@...iam.gserviceaccount.com
// GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n....\n-----END PRIVATE KEY-----\n"
// (tuỳ chọn) SHEET_NAME=Sheet1

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[:*()【】\[\]{}]/g, "");
}
function findColIdx(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const i = normalized.indexOf(normalizeHeader(alias));
    if (i !== -1) return i;
  }
  return -1;
}

function parseDDMMYYYY(s) {
  if (!s) return null;
  const [dd, mm, yyyy] = String(s).split("/").map(Number);
  if (!dd || !mm || !yyyy) return null;
  return new Date(yyyy, mm - 1, dd);
}

module.exports = async (req, res) => {
  try {
    const { email, gpt } = req.query;
    if (!email || !gpt) {
      return res.status(400).json({ error: "Thiếu email hoặc gpt trong query string." });
    }

    const SHEET_ID = process.env.SHEET_ID;
    const SHEET_NAME = process.env.SHEET_NAME || "Sheet1";

    if (!SHEET_ID || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return res.status(500).json({ error: "Thiếu biến môi trường cho Service Account." });
    }

    // Auth bằng Service Account (đọc được sheet private nếu đã share quyền)
    const auth = new JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Đọc cả header + dữ liệu (chèn thêm cột cũng không sao)
    const range = `${SHEET_NAME}!1:10000`;
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) {
      return res.status(200).json({ access: false, reason: "Sheet trống hoặc thiếu dữ liệu." });
    }

    const headers = rows[0];

    // Dò vị trí cột theo header (nhiều biến thể)
    const idxEmail = findColIdx(headers, ["email", "email cho phép sử dụng gpts", "Email được phép sử dụng GPTs", "địa chỉ email"]);
    const idxExpire = findColIdx(headers, ["thời hạn sử dụng gpts", "ngày hết hạn", "Thời hạn sử dụng", "hạn sử dụng"]);
    const idxGptId = findColIdx(headers, ["id", "gpt id", "mã gpt", "GPTs ID", "ma gpt"]);

    if (idxEmail === -1 || idxGptId === -1) {
      return res.status(500).json({ error: "Không tìm thấy cột Email hoặc GPT ID trong Sheet." });
    }

    const today = new Date();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const rowEmail = row[idxEmail]?.trim().toLowerCase();
      const rowGptId = row[idxGptId]?.trim();
      const expiryStr = idxExpire !== -1 ? row[idxExpire]?.trim() : ""; // có thể không có cột hạn

      if (rowEmail === email.toLowerCase()) {
        if (rowGptId !== gpt) {
          return res.status(200).json({
            access: false,
            reason: "Sai GPT ID",
            gptExpected: rowGptId || null,
          });
        }

        if (!expiryStr) {
          // Không có hạn => cho phép
          return res.status(200).json({ access: true, gpt, expiry: null });
        }

        const expiryDate = parseDDMMYYYY(expiryStr);
        if (!expiryDate) {
          return res.status(200).json({
            access: false,
            reason: "Định dạng ngày hết hạn không hợp lệ (yêu cầu dd/mm/yyyy)",
            expiry: expiryStr,
          });
        }

        if (today <= expiryDate) {
          return res.status(200).json({ access: true, gpt, expiry: expiryStr });
        } else {
          return res.status(200).json({ access: false, reason: "Hết hạn sử dụng", expiry: expiryStr });
        }
      }
    }

    return res.status(200).json({ access: false, reason: "Không có trong danh sách" });
  } catch (err) {
    console.error("[SERVER ERROR]", err?.message || err);
    return res.status(500).json({ error: "Lỗi server nội bộ." });
  }
};
