const LeaderboardEntry = require('../models/LeaderboardEntry');
const Submission = require('../models/Submission');
const User = require('../models/User');

// ─────────────────────────────────────────────────────────────
// POINT CONFIG  (tweak these values freely)
// ─────────────────────────────────────────────────────────────
const POINTS = {
  ON_TIME:         10,   // full points for on-time submission
  LATE_MAX:         7,   // points if only 1-2 hours late (just over grace)
  LATE_1_DAY:       5,   // 1 day late
  LATE_2_DAYS:      3,   // 2 days late
  LATE_3_PLUS:      1,   // 3+ days late (still submitted, gets 1)
  MISSED:          -5    // never submitted after deadline
};

/**
 * Calculate points for a single submission
 */
const calcSubmissionPoints = (status, submittedAt, deadline) => {
  if (status === 'missed')    return POINTS.MISSED;
  if (status === 'submitted') return POINTS.ON_TIME;

  // Late — scale by how many hours late
  const hoursLate = (new Date(submittedAt) - new Date(deadline)) / (1000 * 60 * 60);

  if (hoursLate <= 6)   return POINTS.LATE_MAX;
  if (hoursLate <= 24)  return POINTS.LATE_1_DAY;
  if (hoursLate <= 48)  return POINTS.LATE_2_DAYS;
  return POINTS.LATE_3_PLUS;
};

/**
 * Get Monday 00:00:00 and Sunday 23:59:59 for any date
 */
const getWeekBounds = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();                        // 0=Sun … 6=Sat
  const diffToMon = (day === 0 ? -6 : 1 - day); // shift to Monday

  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { weekStart: monday, weekEnd: sunday };
};

/**
 * Human-readable label e.g. "Week 15, 2025"
 */
const getWeekLabel = (weekStart) => {
  const oneJan = new Date(weekStart.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((weekStart - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
  return `Week ${weekNo}, ${weekStart.getFullYear()}`;
};

/**
 * Build / refresh leaderboard for a given week.
 * ✅ FIX: Filter by form.deadline falling within the week,
 *         NOT by submission.updatedAt — this ensures late/missed
 *         submissions are always counted in the correct week.
 */
const computeWeeklyLeaderboard = async (weekDate = new Date()) => {
  const { weekStart, weekEnd } = getWeekBounds(weekDate);
  const weekLabel = getWeekLabel(weekStart);

  console.log(`[Leaderboard] Computing for ${weekLabel} (${weekStart.toDateString()} – ${weekEnd.toDateString()})`);

  // ✅ FIX: Join through Form to filter by form.deadline in this week's range
  const submissions = await Submission.find({
    status: { $in: ['submitted', 'late', 'missed'] }
  })
    .populate({
      path: 'form',
      match: { deadline: { $gte: weekStart, $lte: weekEnd } }, // ✅ deadline-based filter
      select: 'title deadline'
    })
    .populate('student', 'name email rollNumber department');

  // ✅ Filter out submissions where form didn't match the deadline window
  const weekSubmissions = submissions.filter(s => s.form !== null);

  if (!weekSubmissions.length) {
    console.log('[Leaderboard] No submissions found for this week.');
    return [];
  }

  // Group by student
  const studentMap = {};

  for (const sub of weekSubmissions) {
    if (!sub.student) continue;
    const sid = sub.student._id.toString();

    if (!studentMap[sid]) {
      studentMap[sid] = {
        student: sub.student,
        onTimeCount: 0,
        lateCount: 0,
        missedCount: 0,
        onTimePoints: 0,
        latePoints: 0,
        penaltyPoints: 0,
        totalPoints: 0,
        submissionDetails: []
      };
    }

    const entry = studentMap[sid];
    const pts = calcSubmissionPoints(sub.status, sub.submittedAt, sub.form?.deadline);
    const hoursLate = sub.status === 'late' && sub.submittedAt && sub.form?.deadline
      ? parseFloat(((new Date(sub.submittedAt) - new Date(sub.form.deadline)) / (1000 * 60 * 60)).toFixed(2))
      : 0;

    // Tally counts
    if (sub.status === 'submitted') entry.onTimeCount++;
    else if (sub.status === 'late')  entry.lateCount++;
    else if (sub.status === 'missed') entry.missedCount++;

    // Tally points by type
    if (pts > 0 && sub.status === 'submitted') entry.onTimePoints += pts;
    else if (pts > 0 && sub.status === 'late')  entry.latePoints  += pts;
    else if (pts < 0)                            entry.penaltyPoints += pts;

    entry.totalPoints += pts;

    entry.submissionDetails.push({
      form:         sub.form?._id,
      formTitle:    sub.form?.title || 'Unknown',
      status:       sub.status,
      submittedAt:  sub.submittedAt,
      deadline:     sub.form?.deadline,
      hoursLate,
      pointsEarned: pts
    });
  }

  // Upsert each student's entry, then rank
  const entries = [];
  for (const sid of Object.keys(studentMap)) {
    const data = studentMap[sid];
    const entry = await LeaderboardEntry.findOneAndUpdate(
      { student: data.student._id, weekStart },
      {
        student: data.student._id,
        weekStart,
        weekEnd,
        weekLabel,
        totalSubmissions: data.onTimeCount + data.lateCount + data.missedCount,
        onTimeCount:  data.onTimeCount,
        lateCount:    data.lateCount,
        missedCount:  data.missedCount,
        onTimePoints: data.onTimePoints,
        latePoints:   data.latePoints,
        penaltyPoints: data.penaltyPoints,
        totalPoints:  data.totalPoints,
        submissionDetails: data.submissionDetails
      },
      { upsert: true, new: true }
    );
    entries.push(entry);
  }

  // Sort by totalPoints desc, then by onTimeCount desc as tiebreaker
  entries.sort((a, b) =>
    b.totalPoints - a.totalPoints || b.onTimeCount - a.onTimeCount
  );

  // Assign ranks (ties share the same rank)
  let rank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].totalPoints === entries[i - 1].totalPoints) {
      entries[i].rank = entries[i - 1].rank; // same rank for tie
    } else {
      entries[i].rank = rank;
    }
    await LeaderboardEntry.findByIdAndUpdate(entries[i]._id, { rank: entries[i].rank });
    rank++;
  }

  console.log(`[Leaderboard] ✅ Computed ranks for ${entries.length} students.`);
  return entries;
};

/**
 * Get leaderboard for a specific week (defaults to current week)
 */
const getWeeklyLeaderboard = async (weekDate = new Date()) => {
  const { weekStart } = getWeekBounds(weekDate);

  const entries = await LeaderboardEntry.find({ weekStart })
    .populate('student', 'name email rollNumber department')
    .sort({ rank: 1, totalPoints: -1 });

  return entries;
};

/**
 * Get a single student's leaderboard history (last N weeks)
 */
const getStudentLeaderboardHistory = async (studentId, weeks = 8) => {
  return await LeaderboardEntry.find({ student: studentId })
    .sort({ weekStart: -1 })
    .limit(weeks)
    .populate('submissionDetails.form', 'title');
};

module.exports = {
  computeWeeklyLeaderboard,
  getWeeklyLeaderboard,
  getStudentLeaderboardHistory,
  getWeekBounds,
  getWeekLabel,
  POINTS
};