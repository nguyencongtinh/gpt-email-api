const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const { email, gpt } = req.query;

    if (!email || !gpt) {
      return res.status(400).json({ error: 'Thiếu email hoặc gpt trong query string.' });
    }

    const sheetId = '1VlcDnu_rc_shvzOmyQv_wO-nHDWmHxYmpD3-UhGN91Q';
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    const range = 'Sheet1!A1:C1000'; // A: Email, B: Expiry, C: GPT ID

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
      const expiry = data.values[i][1]?.trim();
      const gptId = data.values[i][2]?.trim();

      if (rowEmail === email.toLowerCase()) {
        // Kiểm tra GPT ID
        if (gptId !== gpt) {
          return res.status(200).json({
            access: false,
            reason: 'Sai GPT ID',
            gptExpected: gptId
          });
        }

        // Nếu không có hạn thì cho phép
        if (!expiry) {
          return res.status(200).json({ access: true, gpt });
        }

        // Kiểm tra ngày hết hạn
        const [day, month, year] = expiry.split('/').map(Number);
        const expiryDate = new Date(year, month - 1, day);

        if (today <= expiryDate) {
          return res.status(200).json({ access: true, gpt, expiry });
        } else {
          return res.status(200).json({ access: false, reason: 'Hết hạn sử dụng', expiry });
        }
      }
    }

    return res.status(200).json({ access: false, reason: 'Không có trong danh sách' });
  } catch (error) {
    console.error('[SERVER ERROR]', error);
    return res.status(500).json({ error: 'Lỗi server nội bộ.' });
  }
};
