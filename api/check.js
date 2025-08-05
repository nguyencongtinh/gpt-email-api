import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Thiếu email' });

  try {
    const sheetId = process.env.SHEET_ID;
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A2:B10000?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) throw new Error('Không lấy được dữ liệu');

    const today = new Date();
    const found = data.values.find(([rowEmail, expiredDate]) => {
      if (rowEmail.trim().toLowerCase() !== email.trim().toLowerCase()) return false;
      const exp = new Date(expiredDate);
      return !isNaN(exp) && exp >= today;
    });

    if (found) {
      return res.status(200).json({ access: true });
    } else {
      return res.status(403).json({ access: false, message: 'Tài khoản đã hết hạn hoặc không tồn tại.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
