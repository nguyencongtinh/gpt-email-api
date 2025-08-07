
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

module.exports = { authorizeServiceAccount };
