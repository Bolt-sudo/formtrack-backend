const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET; // paste actual secret from Render
const REDIRECT_URI = 'http://localhost:5000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/drive'
  ]
});

console.log('\n✅ Paste this URL in your browser:\n');
console.log(authUrl);

const server = http.createServer(async (req, res) => {
  const qs = new url.URL(req.url, 'http://localhost:5000').searchParams;
  const code = qs.get('code');
  if (!code) { res.end('No code found.'); return; }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n✅ YOUR NEW REFRESH TOKEN:\n');
    console.log(tokens.refresh_token);
    console.log('\n→ Copy this into Render as GOOGLE_REFRESH_TOKEN\n');
    res.end('<h2>✅ Done! Check your terminal for the refresh token.</h2>');
  } catch (err) {
    console.error('Error:', err.message);
    res.end('Error: ' + err.message);
  }
  server.close();
});

server.listen(5000, () => {
  console.log('\n⏳ Waiting on http://localhost:5000 ...\n');
});