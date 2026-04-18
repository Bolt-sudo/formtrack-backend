const mongoose = require('mongoose');

const leaderboardEntrySchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  weekStart: {
    type: Date,
    required: true   // Monday 00:00:00 of that week
  },
  weekEnd: {
    type: Date,
    required: true   // Sunday 23:59:59 of that week
  },
  weekLabel: {
    type: String,    // e.g. "Week 15, 2025"
    required: true
  },

  // ── Submission counts ──────────────────────
  totalSubmissions: { type: Number, default: 0 },
  onTimeCount:      { type: Number, default: 0 },
  lateCount:        { type: Number, default: 0 },
  missedCount:      { type: Number, default: 0 },

  // ── Points breakdown ──────────────────────
  onTimePoints:     { type: Number, default: 0 },  // +10 per on-time
  latePoints:       { type: Number, default: 0 },  // reduced based on how late
  penaltyPoints:    { type: Number, default: 0 },  // negative for missed
  totalPoints:      { type: Number, default: 0 },  // final score

  // ── Rank (computed after all students scored) ─
  rank:             { type: Number, default: null },

  // ── Per-submission detail (for breakdown view) ─
  submissionDetails: [{
    form:         { type: mongoose.Schema.Types.ObjectId, ref: 'Form' },
    formTitle:    String,
    status:       { type: String, enum: ['submitted', 'late', 'missed'] },
    submittedAt:  Date,
    deadline:     Date,
    hoursLate:    { type: Number, default: 0 },
    pointsEarned: Number
  }]

}, { timestamps: true });

// One entry per student per week
leaderboardEntrySchema.index({ student: 1, weekStart: 1 }, { unique: true });
// Fast queries for leaderboard page
leaderboardEntrySchema.index({ weekStart: 1, totalPoints: -1 });

module.exports = mongoose.model('LeaderboardEntry', leaderboardEntrySchema);
