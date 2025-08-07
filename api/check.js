const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const { email, gpt } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Thiếu email trong query string.' });
    }

    const sheetId = '1VlcDnu_rc_shvzOmyQv_wO-nHDWmHxYmpD3-UhGN91Q';
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    const range = 'Sheet1!A1:B1000'; // A: email, B: ngày hết hạn

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      console.error('[Sheets API ERROR]', data);
      return res.status(500).json({ error: 'Không lấy được dữ liệu từ Google Sheets.' });
    }

    const today = new Date();
    const emailCheck = email.toLowerCase().trim();

    for (let i = 1; i < data.values.length; i++) {
      const rowEmail = data.values[i][0]?.trim().toLowerCase();
      const expiryStr = data.values[i][1]?.trim(); // dạng dd/MM/yyyy

      if (rowEmail === emailCheck) {
        if (!expiryStr) {
          return res.status(200).json({ access: true, gpt, expiry: null });
        }

        const [day, month, year] = expiryStr.split('/').map(Number);
        const expiryDate = new Date(year, month - 1, day);

        if (today <= expiryDate) {
          return res.status(200).json({ access: true, gpt, expiry: expiryStr });
        } else {
          return res.status(200).json({ access: false, reason: 'Hết hạn sử dụng', gpt, expiry: expiryStr });
        }
      }
    }

    return res.status(200).json({ access: false, reason: 'Không có trong danh sách', gpt });
  } catch (error) {
    console.error('[SERVER ERROR]', error);
    return res.status(500).json({ error: 'Lỗi server nội bộ.' });
  }
};
