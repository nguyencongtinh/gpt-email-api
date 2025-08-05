// /api/check.js

export default async function handler(req, res) {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Thiếu email.' });
    }

    const SHEET_ID = process.env.SHEET_ID;
    const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
    const RANGE = 'Sheet1!A1:B1000';

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RANGE}?key=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      return res.status(500).json({ error: 'Không lấy được dữ liệu từ Google Sheets.' });
    }

    const rows = data.values;
    const header = rows[0];
    const body = rows.slice(1);

    const userRow = body.find(row => row[0]?.trim().toLowerCase() === email.trim().toLowerCase());

    if (!userRow) {
      return res.status(200).json({ access: false });
    }

    const expirationDateStr = userRow[1];

    // Nếu có ngày hết hạn → kiểm tra
    if (expirationDateStr) {
      const expirationDate = new Date(expirationDateStr);
      const now = new Date();
      if (!isNaN(expirationDate.getTime()) && expirationDate < now) {
        return res.status(200).json({ access: false }); // Hết hạn
      }
    }

    // Nếu không có ngày hết hạn hoặc còn hạn
    return res.status(200).json({ access: true });

  } catch (error) {
    console.error('Lỗi check quyền truy cập:', error);
    return res.status(500).json({ error: 'Lỗi server nội bộ.' });
  }
}
