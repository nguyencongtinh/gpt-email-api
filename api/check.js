const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Thiếu email trong query string.' });
    }

    const sheetId = '1VlcDnu_rc_shvzOmyQv_wO-nHDWmHxYmpD3-UhGN91Q';
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    const range = 'Sheet1!A1:B1000'; // Cột A: email, Cột B: ngày hết hạn (dd-MM-yyyy)

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      console.error('[Sheets API ERROR]', data);
      return res.status(500).json({ error: 'Không lấy được dữ liệu từ Google Sheets.' });
    }

    const today = new Date();

    for (let i = 1; i < data.values.length; i++) {
      const rowEmail = data.values[i][0]?.trim().toLowerCase();
      const expiry = data.values[i][1]?.trim(); // định dạng: dd-MM-yyyy

      if (rowEmail === email.toLowerCase()) {
        if (!expiry) {
          return res.status(200).json({ access: true });
        }

        const [day, month, year] = expiry.split('-').map(Number);
        const expiryDate = new Date(year, month - 1, day);

        if (today <= expiryDate) {
          return res.status(200).json({ access: true });
        } else {
          return res.status(200).json({ access: false, reason: 'Hết hạn sử dụng' });
        }
      }
    }

    return res.status(200).json({ access: false, reason: 'Không có trong danh sách' });
  } catch (error) {
    console.error('[SERVER ERROR]', error);
    return res.status(500).json({ error: 'Lỗi server nội bộ.' });
  }
};
