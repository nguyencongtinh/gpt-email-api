// pages/api/check.js
import { google } from 'googleapis';
import { parse } from 'date-fns';

const sheets = google.sheets('v4');

export default async function handler(req, res) {
  const email = req.query.email;
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!email) {
    return res.status(400).json({ error: 'Thiếu email cần kiểm tra.' });
  }

  try {
    const range = 'Sheet1!A1:B1000'; // Sửa tên sheet tại đây nếu cần
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      key: apiKey,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return res.status(500).json({ error: 'Không lấy được dữ liệu từ Google Sheets.' });
    }

    // Duyệt qua từng dòng trong sheet
    for (let i = 1; i < rows.length; i++) {
      const rowEmail = rows[i][0]?.trim().toLowerCase();
      const endDate = rows[i][1]?.trim(); // ô B: ngày hết hạn

      if (rowEmail === email.toLowerCase()) {
        if (!endDate) {
          // Nếu ô B trống => cho phép mãi mãi
          return res.status(200).json({ access: true });
        }

        const today = new Date();
        const expiryDate = parse(endDate, 'dd-MM-yyyy', new Date());

        if (today <= expiryDate) {
          return res.status(200).json({ access: true });
        } else {
          return res.status(200).json({ access: false, reason: 'Hết hạn sử dụng' });
        }
      }
    }

    return res.status(200).json({ access: false, reason: 'Không có trong danh sách' });

  } catch (error) {
    console.error('Lỗi truy cập Google Sheets:', error);
    return res.status(500).json({ error: 'Lỗi server: không thể kiểm tra quyền truy cập.' });
  }
}
