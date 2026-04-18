const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();

// ── Trust proxy — fixes express-rate-limit X-Forwarded-For warning ──
app.set('trust proxy', 1);

// ── Security middleware ───────────────────────────────────────
app.use(helmet());

// ── Rate limiters ─────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again later.' }
});

// ── General middleware ────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',          authLimiter);
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/forms',         require('./routes/forms'));
app.use('/api/submissions',   require('./routes/submissions'));
app.use('/api/students',      require('./routes/students'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/fines',         require('./routes/fines'));
app.use('/api/leaderboard',   require('./routes/leaderboard'));

// Health check
app.get('/', (req, res) => res.json({ message: 'FormTrack API running', version: '1.0.0' }));

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── Connect to MongoDB ────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');

    const { startScheduler } = require('./utils/scheduler');
    startScheduler();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = app;