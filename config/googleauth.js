const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:5000/oauth2callback'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const auth = {
  getClient: async () => oauth2Client
};

console.log('REFRESH TOKEN loaded:', !!process.env.GOOGLE_REFRESH_TOKEN);

module.exports = auth;