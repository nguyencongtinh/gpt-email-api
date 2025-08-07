const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send'
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
  console.log("🔔 Đang gọi sendReminderEmails...");
  const credentials = require('../../credentials.json');
  const authClient = authorizeServiceAccount(credentials);
  
  // TODO: Thêm phần gửi email
  console.log("✅ Xử lý gửi email xong.");
}

module.exports = {
  authorizeServiceAccount,
  sendReminderEmails
};
