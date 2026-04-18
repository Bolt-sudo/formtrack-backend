const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  computeWeeklyLeaderboard,
  getWeeklyLeaderboard,
  getStudentLeaderboardHistory,
  getWeekBounds
} = require('../utils/leaderboardService');
const LeaderboardEntry = require('../models/LeaderboardEntry');

const router = express.Router();

// ─────────────────────────────────────────────
// PUBLIC / STUDENT ROUTES
// ─────────────────────────────────────────────

// @route   GET /api/leaderboard/current
// @desc    Get this week's leaderboard (all students can see)
// @access  Private
router.get('/current', protect, async (req, res) => {
  try {
    const entries = await getWeeklyLeaderboard();

    // Add "isMe" flag so frontend can highlight the logged-in student
    const result = entries.map(e => ({
      ...e.toObject(),
      isMe: e.student._id.toString() === req.user._id.toString()
    }));

    const { weekStart, weekEnd } = getWeekBounds();
    res.json({
      success: true,
      weekStart,
      weekEnd,
      totalStudents: result.length,
      leaderboard: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/leaderboard/my-history
// @desc    Student views their own weekly history
// @access  Private/Student
router.get('/my-history', protect, authorize('student'), async (req, res) => {
  try {
    const history = await getStudentLeaderboardHistory(req.user._id);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/leaderboard/my-rank
// @desc    Get logged-in student's rank & points this week
// @access  Private/Student
router.get('/my-rank', protect, authorize('student'), async (req, res) => {
  try {
    const { weekStart } = getWeekBounds();
    const entry = await LeaderboardEntry.findOne({
      student: req.user._id,
      weekStart
    });

    if (!entry) {
      return res.json({
        success: true,
        message: 'No submissions recorded this week yet.',
        rank: null,
        totalPoints: 0
      });
    }

    // Total students ranked this week (to show "Rank X of Y")
    const totalRanked = await LeaderboardEntry.countDocuments({ weekStart });

    res.json({
      success: true,
      rank: entry.rank,
      totalRanked,
      totalPoints: entry.totalPoints,
      onTimeCount: entry.onTimeCount,
      lateCount: entry.lateCount,
      missedCount: entry.missedCount,
      weekLabel: entry.weekLabel
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// ADMIN / TEACHER ROUTES
// ─────────────────────────────────────────────

// @route   POST /api/leaderboard/compute
// @desc    Manually trigger leaderboard computation (admin/teacher)
// @access  Private/Teacher/Admin
router.post('/compute', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    // Optional: pass a specific week date in body, else uses current week
    const weekDate = req.body.weekDate ? new Date(req.body.weekDate) : new Date();
    const entries = await computeWeeklyLeaderboard(weekDate);
    res.json({
      success: true,
      message: `Leaderboard computed for ${entries.length} students.`,
      entries
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/leaderboard/week/:weekStart
// @desc    Get leaderboard for any specific week (YYYY-MM-DD)
// @access  Private/Teacher/Admin
router.get('/week/:weekStart', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const weekDate = new Date(req.params.weekStart);
    if (isNaN(weekDate)) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    const entries = await getWeeklyLeaderboard(weekDate);
    res.json({ success: true, entries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/leaderboard/student/:studentId
// @desc    View a specific student's full leaderboard history
// @access  Private/Teacher/Admin
router.get('/student/:studentId', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const history = await getStudentLeaderboardHistory(req.params.studentId);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
