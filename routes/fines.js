const express = require('express');
const Fine = require('../models/Fine');
const { protect, authorize } = require('../middleware/auth');
const { getStudentFines, getPendingFineTotal } = require('../utils/fineService');

const router = express.Router();

// ─────────────────────────────────────────────
// STUDENT ROUTES
// ─────────────────────────────────────────────

// @route   GET /api/fines/my
// @desc    Student views their own fines
// @access  Private/Student
router.get('/my', protect, authorize('student'), async (req, res) => {
  try {
    const fines = await getStudentFines(req.user._id);
    const pendingTotal = await getPendingFineTotal(req.user._id);
    res.json({ success: true, fines, pendingTotal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// ADMIN / TEACHER ROUTES
// ─────────────────────────────────────────────

// @route   GET /api/fines
// @desc    Get all fines (filter by status or student)
// @access  Private/Teacher/Admin
router.get('/', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.studentId) filter.student = req.query.studentId;

    const fines = await Fine.find(filter)
      .populate('student', 'name email rollNumber')
      .populate('form', 'title subject deadline')
      .sort({ createdAt: -1 });

    // Summary counts
    const summary = {
      total: fines.length,
      pending: fines.filter(f => f.status === 'pending').length,
      paid: fines.filter(f => f.status === 'paid').length,
      waived: fines.filter(f => f.status === 'waived').length,
      totalAmount: fines.reduce((sum, f) => sum + f.fineAmount, 0),
      pendingAmount: fines
        .filter(f => f.status === 'pending')
        .reduce((sum, f) => sum + f.fineAmount, 0)
    };

    res.json({ success: true, fines, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/fines/:id
// @desc    Get single fine detail
// @access  Private/Teacher/Admin
router.get('/:id', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const fine = await Fine.findById(req.params.id)
      .populate('student', 'name email rollNumber phone')
      .populate('form', 'title subject deadline')
      .populate('waivedBy', 'name email');

    if (!fine) return res.status(404).json({ success: false, message: 'Fine not found.' });

    res.json({ success: true, fine });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/fines/:id/pay
// @desc    Mark a fine as paid (teacher/admin confirms payment)
// @access  Private/Teacher/Admin
router.patch('/:id/pay', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const fine = await Fine.findByIdAndUpdate(
      req.params.id,
      { status: 'paid', paidAt: new Date() },
      { new: true }
    ).populate('student', 'name email').populate('form', 'title');

    if (!fine) return res.status(404).json({ success: false, message: 'Fine not found.' });

    res.json({ success: true, message: 'Fine marked as paid.', fine });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/fines/:id/waive
// @desc    Waive a fine (admin/teacher with reason)
// @access  Private/Teacher/Admin
router.patch('/:id/waive', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Please provide a reason for waiving.' });
    }

    const fine = await Fine.findByIdAndUpdate(
      req.params.id,
      {
        status: 'waived',
        waivedBy: req.user._id,
        waivedReason: reason
      },
      { new: true }
    ).populate('student', 'name email').populate('form', 'title');

    if (!fine) return res.status(404).json({ success: false, message: 'Fine not found.' });

    res.json({ success: true, message: 'Fine waived successfully.', fine });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
