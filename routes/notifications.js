const express = require('express');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth'); // ✅ FIX: authorize imported
const { checkDeadlinesAndNotify, applyMissedDeadlinePenalties } = require('../utils/scheduler');
const { sendWhatsApp } = require('../utils/notificationService');

const router = express.Router();

// @route   GET /api/notifications
// @desc    Get all notifications for logged-in user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('form', 'title subject')
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false
    });

    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/notifications/mark-read
// @desc    Mark all notifications as read
// @access  Private
router.put('/mark-read', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/notifications/test-reminders
// @desc    Manually trigger reminder check (admin/teacher only)
// @access  Private/Admin/Teacher  ✅ FIX: was open/unauthenticated
router.get('/test-reminders', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    console.log('🔧 Manually triggering checkDeadlinesAndNotify...');
    await checkDeadlinesAndNotify();
    res.json({ success: true, message: 'Reminder check triggered. Watch your server terminal.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/notifications/test-whatsapp
// @desc    Send a test WhatsApp message (admin only)
// @access  Private/Admin  ✅ FIX: was open/unauthenticated
router.get('/test-whatsapp', protect, authorize('admin'), async (req, res) => {
  try {
    await sendWhatsApp({
      to: process.env.TEST_WHATSAPP_NUMBER, // ✅ FIX: moved to .env — add TEST_WHATSAPP_NUMBER=+91xxxxxxxxxx
      message: '✅ FormTrack WhatsApp test from web app is working!'
    });
    res.json({ success: true, message: 'WhatsApp sent! Check your phone.' });
  } catch (err) {
    console.error('WhatsApp test failed:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/notifications/test-penalties
// @desc    Manually trigger missed deadline penalties (admin/teacher only)
// @access  Private/Admin/Teacher
router.get('/test-penalties', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    await applyMissedDeadlinePenalties();
    res.json({ success: true, message: 'Penalties applied' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router; // ← this line was already there