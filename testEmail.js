require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.sendMail({
  from: process.env.EMAIL_FROM,
  to: 'boltfinisher@gmail.com',
  subject: 'FormTrack Test',
  html: '<h2>Gmail is working!</h2>'
}).then(() => console.log('✅ Email sent!'))
  .catch(err => console.error('❌ Error:', err.message));