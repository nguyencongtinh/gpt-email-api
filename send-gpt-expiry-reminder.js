/**
 * send-gpt-expiry-reminder.js
 * - Đọc Google Sheet
 * - Dò cột theo tên header (không lệch nếu chèn/di chuyển cột)
 * - Chuẩn múi giờ Việt Nam (UTC+7)
 * - Nhắc hạn 2 mốc: trước 5 ngày & trước 1 ngày
 * - Tự xóa trắng cột "đã gửi" khi hạn thay đổi
 */

const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const { JWT } = require("google-auth-library");
require("dotenv").config();

// ========= CẤU HÌNH =========
const SHEET_ID = process.env.SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || "Sheet1"; // Cho phép đổi tên sheet
// Đọc cả bảng: hàng 1 là header, dưới là data
const SHEET_READ_RANGE = `${SHEET_NAME}!1:10000`; // đủ rộng, có thể tăng nếu bảng dài hơn

// ========= HỖ TRỢ THỜI GIAN (VN) =========
function getTodayVN() {
  // 00:00 theo giờ VN (UTC+7)
  const now = new Date();
  return new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7, 0, 0);
}
function daysBetween(date1, date2) {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

// ========= AUTH SHEETS =========
const auth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// ========= UTILS =========
function colIndexToA1(colIndexZeroBased) {
  // 0 -> A, 1 -> B, ... 25 -> Z, 26 -> AA ...
  let n = colIndexZeroBased + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[:*()【】\[\]{}]/g, "");
}

function findColIdx(headers, aliases) {
  // aliases: mảng các tên/biến thể hợp lệ
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const i = normalized.indexOf(normalizeHeader(alias));
    if (i !== -1) return i;
  }
  return -1;
}

// ========= HEADER MAP =========
// Cho phép nhiều biến thể header tiếng Việt
const HDR = {
  EMAIL: [
    "email",
    "email cho phép sử dụng gpts",
    "email duoc phep su dung gpts",
    "Email được phép sử dụng GPTs",
    "địa chỉ email",
  ],
  EXPIRE: [
    "thời hạn sử dụng gpts",
    "thoi han su dung gpts",
    "ngày hết hạn",
    "Thời hạn sử dụng",
    "han su dung",
  ],
  GPT_ID: ["id", "gpt id", "mã gpt", "ma gpt","GPTs ID"],
  GPT_NAME: ["tên gpts", "ten gpts", "ten gpt", "tên gpt","Tên GPTs"],
  SENT_5D: [
    "đã gửi trước 5 ngày",
    "da gui truoc 5 ngay",
    "sent 5d",
    "Đã gửi trước 5 ngày",
    "Nhắc trước 5 ngày",
    "nhac 5 ngay",
  ],
  SENT_1D: [
    "đã gửi trước 1 ngày",
    "da gui truoc 1 ngay",
    "sent 1d",
    "Đã gửi trước 1 ngày",
    "Nhắc trước 1 ngày",
    "nhac 1 ngay",
  ],
};

// ========= SHEETS HELPERS =========
async function getAllRows() {
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_READ_RANGE,
  });
  return res.data.values || [];
}

async function updateCell(rowIndexZeroBased, colIndexZeroBased, value) {
  const sheets = google.sheets({ version: "v4", auth });
  const a1col = colIndexToA1(colIndexZeroBased);
  // rowIndexZeroBased=0 là header => +1 để thành hàng 1; data bắt đầu từ index 1
  const a1row = rowIndexZeroBased + 1;
  const range = `${SHEET_NAME}!${a1col}${a1row}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}

// ========= EMAIL SENDER =========
async function sendEmail(to, subject, text) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
  });
  await transporter.sendMail({ from: process.env.GMAIL_USER, to, subject, text });
}

// ========= MARKERS =========
function parseMarker(val) {
  if (!val) return { sent: false, forDate: null };
  const m = String(val).match(/Đã gửi(?:@(\d{2}\/\d{2}\/\d{4}))?/i);
  if (!m) return { sent: false, forDate: null };
  return { sent: true, forDate: m[1] || null };
}
function formatMarker(expireDate) {
  return `Đã gửi@${expireDate} (${new Date().toISOString()})`;
}

// ========= MAIN =========
(async () => {
  try {
    const rows = await getAllRows();
    if (!rows.length) {
      console.log("[INFO] Sheet trống.");
      return;
    }

    const headers = rows[0];
    // Tìm vị trí cột cần dùng theo header
    const idxEmail = findColIdx(headers, HDR.EMAIL);
    const idxExpire = findColIdx(headers, HDR.EXPIRE);
    const idxId = findColIdx(headers, HDR.GPT_ID);
    const idxName = findColIdx(headers, HDR.GPT_NAME);
    const idxSent5 = findColIdx(headers, HDR.SENT_5D);
    const idxSent1 = findColIdx(headers, HDR.SENT_1D);

    const missing = [];
    if (idxEmail === -1) missing.push("Email");
    if (idxExpire === -1) missing.push("Thời hạn sử dụng GPTs");
    if (idxId === -1) missing.push("ID");
    if (idxName === -1) missing.push("Tên GPTs");
    if (idxSent5 === -1) missing.push("Đã gửi trước 5 ngày");
    if (idxSent1 === -1) missing.push("Đã gửi trước 1 ngày");

    if (missing.length) {
      console.error(
        "[ERROR] Không tìm thấy các cột bắt buộc theo header:",
        missing.join(", ")
      );
      process.exit(1);
    }

    const today = getTodayVN();
    console.log(
      `[INFO] Today (VN): ${today.toLocaleDateString("vi-VN")} | Sheet: ${SHEET_NAME}`
    );

    // Duyệt từng dòng dữ liệu (bắt đầu từ hàng 2 => index 1)
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const email = row[idxEmail];
      const expireDate = row[idxExpire];
      const id = row[idxId];
      const gptName = row[idxName];
      const colE = row[idxSent5];
      const colF = row[idxSent1];

      if (!email || !expireDate) continue;

      // Chuẩn hóa hạn dùng dd/mm/yyyy
      const [dd, mm, yyyy] = String(expireDate).split("/");
      if (!dd || !mm || !yyyy) {
        console.warn(`[WARN] Dòng ${r + 1}: định dạng ngày không phải dd/mm/yyyy -> "${expireDate}"`);
        continue;
      }
      const expire = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
      const daysLeft = daysBetween(today, expire);

      // Markers hiện có
      let sent5 = parseMarker(colE);
      let sent1 = parseMarker(colF);

      // --- Quy tắc tự xóa trắng khi hạn đổi ---
      const markerMismatch =
        (sent5.forDate && sent5.forDate !== expireDate) ||
        (sent1.forDate && sent1.forDate !== expireDate);

      const legacyMarkerLikelyRenewed =
        (!sent5.forDate && colE && daysLeft >= 6) ||
        (!sent1.forDate && colF && daysLeft >= 6);

      if (markerMismatch || legacyMarkerLikelyRenewed) {
        await updateCell(r, idxSent5, ""); // r: index theo rows (0-based), idxSent5: index cột
        await updateCell(r, idxSent1, "");
        sent5 = { sent: false, forDate: null };
        sent1 = { sent: false, forDate: null };
        console.log(
          `[RESET] Row ${r + 1}: cleared reminder marks (expire ${expireDate}, daysLeft ${daysLeft})`
        );
      }

      // --- Gửi theo mốc mới ---
      const shouldSend5 = daysLeft === 5 && !sent5.sent;
      const shouldSend1 = daysLeft === 1 && !sent1.sent;

      if (shouldSend5) {
        const subject = `[Nhắc hạn] GPT "${gptName}" sẽ hết hạn sau 5 ngày`;
        const body = `Chào bạn,
GPT "${gptName}" (ID: ${id}) sẽ hết hạn vào ngày ${expireDate}.
Vui lòng gia hạn để không bị gián đoạn.
Trân trọng!`;

        await sendEmail(email, subject, body);
        await updateCell(r, idxSent5, formatMarker(expireDate));
        console.log(`[MAIL-5D] Row ${r + 1} -> ${email} | ${gptName} | ${expireDate}`);
      }

      if (shouldSend1) {
        const subject = `[Nhắc hạn] GPT "${gptName}" sẽ hết hạn NGÀY MAI!`;
        const body = `Chào bạn,
GPT "${gptName}" (ID: ${id}) sẽ hết hạn vào NGÀY MAI (${expireDate}).
Vui lòng gia hạn nếu muốn tiếp tục sử dụng.
Trân trọng!`;

        await sendEmail(email, subject, body);
        await updateCell(r, idxSent1, formatMarker(expireDate));
        console.log(`[MAIL-1D] Row ${r + 1} -> ${email} | ${gptName} | ${expireDate}`);
      }
    }

    console.log("[DONE] Reminder job finished.");
  } catch (err) {
    console.error(`[ERROR] ${err?.message || err}`);
    process.exitCode = 1;
  }
})();
