const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// Thông tin Google Sheets
const SHEET_ID = "1VlcDnu_rc_shvzOmyQv_wO-nHDWmHxYmpD3-UhGN91Q"; // ✅ ID từ link anh gửi
const RANGE = "Sheet1!A2:A"; // ✅ Sheet1, cột A từ hàng 2
const API_KEY = "AIzaSyCYYjL5SYD0iyZPx1Z08huA0lUM8ILR08I"; // ✅ API key của anh

// Lấy danh sách email từ Google Sheets
async function getAllowedEmails() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RANGE}?key=${API_KEY}`;
    const response = await axios.get(url);
    const rows = response.data.values || [];
    return rows.flat().map(email => email.toLowerCase().trim());
  } catch (error) {
    console.error("❌ Lỗi đọc Google Sheet:", error.message);
    return [];
  }
}

// API kiểm tra email
app.get("/api/check", async (req, res) => {
  const email = req.query.email?.toLowerCase();
  if (!email) return res.status(400).json({ error: "Thiếu tham số email" });

  const allowedEmails = await getAllowedEmails();
  const access = allowedEmails.includes(email);

  res.json({ access });
});

// Mặc định
app.get("/", (req, res) => {
  res.send("✅ GPT Access Check API is running.");
});

module.exports = app;
