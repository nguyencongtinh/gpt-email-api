const fetch = require('node-fetch'); // Thêm dòng này nếu chưa có

module.exports = async (req, res) => {
  const { email } = req.query;
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const sheetId = '1VlcDnu_rc_shvzOmyQv_wO-nHDWmHxYmpD3-UhGN91Q';

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  try {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:A?key=${apiKey}`);
    const data = await response.json();

    const emails = Array.isArray(data.values) ? data.values.flat().map(e => e.toLowerCase()) : [];
    const hasAccess = emails.includes(email.toLowerCase());

    return res.status(200).json({ access: hasAccess });
  } catch (err) {
    console.error('Lỗi khi gọi Google Sheets API:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
