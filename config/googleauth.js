const { google } = require('googleapis');

// Handle private key formatting - works for both local .env and Render
const formatPrivateKey = (key) => {
  if (!key) return '';
  // If key already has real newlines, use as-is
  if (key.includes('-----BEGIN PRIVATE KEY-----\n')) return key;
  // Replace literal \n with real newlines
  return key.replace(/\\n/g, '\n');
};

const serviceAccountKey = {
  type: 'service_account',
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  private_key: formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
  universe_domain: 'googleapis.com',
};

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountKey,
  scopes: [
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/forms.responses.readonly',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
  ],
});

console.log('Service account loaded:', !!process.env.GOOGLE_CLIENT_EMAIL);
console.log('Private key loaded:', !!process.env.GOOGLE_PRIVATE_KEY);

module.exports = auth;