const { google } = require('googleapis');
const credentials = require('../credentials.json');
const { JWT } = require('google-auth-library');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send'
];

const SHEET_ID = 'YOUR_SHEET_ID'; // TODO: Replace with actual Sheet ID

async function sendReminderEmails() {
  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
  });

  const doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useJwtAuth(auth);
  await doc.loadInfo();

  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  const today = new Date();
  for (const row of rows) {
    const email = row['Email cho phép sử dụng GPTs'];
    const deadline = new Date(row['Thời hạn sử dụng']);
    const gptName = row['Tên GPTs'];
    const diff = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

    if (diff === 5 && row['Đã gửi trước 5 ngày'] !== 'x') {
      await sendEmail(auth, email, gptName, deadline, 5);
      row['Đã gửi trước 5 ngày'] = 'x';
      await row.save();
    } else if (diff === 1 && row['Đã gửi trước 1 ngày'] !== 'x') {
      await sendEmail(auth, email, gptName, deadline, 1);
      row['Đã gửi trước 1 ngày'] = 'x';
      await row.save();
    }
  }
}

async function sendEmail(auth, to, gptName, deadline, daysLeft) {
  const gmail = google.gmail({ version: 'v1', auth });
  const subject = `⏰ Nhắc nhở: GPT "${gptName}" sắp hết hạn sau ${daysLeft} ngày`;
  const message = [
    `To: ${to}`,
    'Subject: ' + subject,
    'Content-Type: text/html; charset=utf-8',
    '',
    `<p>Xin chào,</p><p>GPT <b>${gptName}</b> của bạn sẽ hết hạn vào ngày <b>${deadline.toLocaleDateString()}</b>.</p><p>Vui lòng gia hạn nếu bạn muốn tiếp tục sử dụng.</p>`
  ].join('\n');

  const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}

module.exports = { sendReminderEmails };