const { GoogleSpreadsheet } = require('google-spreadsheet');

const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_ID = '1VlcDnu_rc_shvzOmyQv_wO-nHDWmHxYmpD3-UhGN91Q'; // Sheet ID anh đang dùng

module.exports = async (req, res) => {
  const email = req.query.email?.toLowerCase();

  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A2:A1000?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    const allowedEmails = data.values?.flat().map(e => e.toLowerCase()) || [];

    const access = allowedEmails.includes(email);
    return res.status(200).json({ access });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to check email access' });
  }
};
