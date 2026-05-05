const express = require('express');
const User = require('../models/User');
const Submission = require('../models/Submission');
const Fine = require('../models/Fine'); // ✅ NEW
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/students
// @desc    Get all students (teacher/admin)
// @access  Private/Teacher
router.get('/', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const students = await User.find({ role: 'student', isActive: true })
      .select('-password')
      .sort({ name: 1 });

    res.json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/students/:id/report
// @desc    Get a student's full submission report including fines
// @access  Private/Teacher
router.get('/:id/report', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const student = await User.findById(req.params.id).select('-password');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    const submissions = await Submission.find({ student: req.params.id })
      .populate('form', 'title subject deadline onTimeReward latePenalty')
      .sort({ createdAt: -1 });

    // ✅ NEW: Fetch fines for this student
    const fines = await Fine.find({ student: req.params.id })
      .populate('form', 'title subject deadline')
      .sort({ createdAt: -1 });

    const fineStats = {
      total: fines.length,
      pending: fines.filter(f => f.status === 'pending').length,
      paid: fines.filter(f => f.status === 'paid').length,
      waived: fines.filter(f => f.status === 'waived').length,
      totalFineAmount: fines.reduce((sum, f) => sum + f.fineAmount, 0),
      pendingFineAmount: fines
        .filter(f => f.status === 'pending')
        .reduce((sum, f) => sum + f.fineAmount, 0)
    };

    const stats = {
      total: submissions.length,
      onTime: submissions.filter(s => s.status === 'submitted').length,
      late: submissions.filter(s => s.status === 'late').length,
      missed: submissions.filter(s => s.status === 'missed').length,
      totalMarksChange: submissions.reduce((sum, s) => sum + (s.marksApplied || 0), 0)
    };

    res.json({ success: true, student, submissions, stats, fines, fineStats }); // ✅ includes fines
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
