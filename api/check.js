const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Thiếu email trong query string.' });
    }

    const sheetId = '1VlcDnu_rc_shvzOmyQv_wO-nHDWmHxYmpD3-UhGN91Q';
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    const range = 'Sheet1!A:A';

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      console.error('[Sheets API ERROR]', data);
      return res.status(500).json({ error: 'Không lấy được dữ liệu từ Google Sheets.' });
    }

    const emails = data.values.flat().map(e => e.toLowerCase().trim());
    const found = emails.includes(email.toLowerCase().trim());

    return res.status(200).json({ access: found });
  } catch (error) {
    console.error('[SERVER ERROR]', error);
    return res.status(500).json({ error: 'Lỗi server nội bộ.' });
  }
};

