const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const fetch = require('node-fetch');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
];

function authorizeServiceAccount(credentials) {
  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
  });
  return client;
}

async function sendReminderEmails() {
  console.log("📧 Đang chạy hàm sendReminderEmails()");

  // Tùy chỉnh logic gửi email ở đây
  // Em đang để đơn giản, ví dụ gửi log
  console.log("✅ Hàm giả lập gửi email thành công");

  // Sau này anh thay bằng logic đọc Google Sheets + gửi Gmail
}

module.exports = {
  authorizeServiceAccount,
  sendReminderEmails
};
