import { google } from 'googleapis';
import dayjs from 'dayjs';

export default async function handler(req, res) {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  const sheets = google.sheets({
    version: 'v4',
    auth: process.env.GOOGLE_SHEETS_API_KEY,
  });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Sheet1!A2:B',
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return res.status(200).json({ access: false });
    }

    const today = dayjs();

    for (const row of rows) {
      const [sheetEmail, expirationDateStr] = row;

      if (sheetEmail && sheetEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
        // Nếu không có ngày hết hạn → quyền truy cập không giới hạn
        if (!expirationDateStr) {
          return res.status(200).json({ access: true });
        }

        const expirationDate = dayjs(expirationDateStr);

        if (expirationDate.isValid() && today.isBefore(expirationDate.add(1, 'day'))) {
          return res.status(200).json({ access: true });
        } else {
          return res.status(200).json({ access: false });
        }
      }
    }

    return res.status(200).json({ access: false });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
