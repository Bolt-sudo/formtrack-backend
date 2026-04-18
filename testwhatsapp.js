require('dotenv').config();
const { sendWhatsApp } = require('./utils/notificationService');

const test = async () => {
  try {
    await sendWhatsApp({
      to: '+919028026144',  // ← your phone number with country code
      message: 'Hello from FormTrack! WhatsApp is working ✅'
    });
    console.log('WhatsApp message sent successfully!');
  } catch (err) {
    console.error('Error:', err.message);
  }
};

test();