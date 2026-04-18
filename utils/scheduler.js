const cron = require('node-cron');
const Form = require('../models/Form');
const Submission = require('../models/Submission');
const { sendReminderToStudents, applyMissedPenalties } = require('./notificationService');
const { computeWeeklyLeaderboard } = require('./leaderboardService');

const startScheduler = () => {
  console.log('Starting FormTrack cron scheduler...');

  // ── Reminder job: every minute ───────────────────────────────
  cron.schedule('* * * * *', async () => {
    await checkDeadlinesAndNotify();
  });

  // ── Missed-deadline penalty job: daily at midnight ───────────
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Running missed-deadline penalty job -', new Date().toISOString());
    await applyMissedDeadlinePenalties();
  });

  // ── Leaderboard compute job: every Monday at 12:01 AM ────────
  cron.schedule('1 0 * * 1', async () => {
    console.log('[CRON] Computing weekly leaderboard -', new Date().toISOString());
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const entries = await computeWeeklyLeaderboard(yesterday);
      console.log(`[CRON] ✅ Leaderboard computed for ${entries.length} students.`);
    } catch (err) {
      console.error('[CRON] ❌ Leaderboard compute failed:', err.message);
    }
  });

  // ── Catch-up job on server start ─────────────────────────────
  // ✅ Runs once at startup:
  //    1. Apply missed penalties for any overdue forms (handles server downtime)
  //    2. Recompute leaderboard for current week (so it's never empty after restart)
  console.log('[CRON] Running catch-up on startup...');
  (async () => {
    try {
      await applyMissedDeadlinePenalties();
      console.log('[CRON] ✅ Startup penalties done.');
    } catch (err) {
      console.error('[CRON] ❌ Startup penalties failed:', err.message);
    }
    try {
      const entries = await computeWeeklyLeaderboard(new Date());
      console.log(`[CRON] ✅ Startup leaderboard computed for ${entries.length} students.`);
    } catch (err) {
      console.error('[CRON] ❌ Startup leaderboard failed:', err.message);
    }
  })();

  console.log('✅ Cron jobs scheduled:');
  console.log('   • Reminders    — every 1 minute');
  console.log('   • Penalties    — daily at midnight');
  console.log('   • Leaderboard  — every Monday at 12:01 AM');
  console.log('   • Catch-up     — penalties + leaderboard on every startup');
};

const checkDeadlinesAndNotify = async () => {
  try {
    const now = new Date();

    const forms = await Form.find({ isActive: true, deadline: { $gt: now } })
      .populate('assignedStudents', 'name email phone notificationPreferences');

    for (const form of forms) {
      const msLeft = form.deadline - now;
      const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));

      if (!form.reminderDays.includes(daysLeft)) continue;

      const alreadySent = form.remindersSent?.some(r => r.daysBeforeDeadline === daysLeft);
      if (alreadySent) continue;

      const pendingSubmissions = await Submission.find({
        form: form._id,
        status: 'pending'
      }).populate('student', 'name email phone notificationPreferences');

      const pendingStudents = pendingSubmissions.map(s => s.student);
      if (pendingStudents.length === 0) continue;

      await sendReminderToStudents(form, pendingStudents, 'auto');

      await Form.findByIdAndUpdate(form._id, {
        $push: { remindersSent: { daysBeforeDeadline: daysLeft, sentAt: now } }
      });

      console.log(`[CRON] ✅ Sent ${daysLeft}-day reminder for "${form.title}" to ${pendingStudents.length} students`);
    }
  } catch (err) {
    console.error('[CRON] ❌ Error in checkDeadlinesAndNotify:', err.message);
  }
};

const applyMissedDeadlinePenalties = async () => {
  try {
    const now = new Date();

    // ✅ GRACE PERIOD: 1 day after deadline before marking missed.
    //    Full timeline:
    //      Before deadline          → student submits → "submitted" (on time) ✅
    //      After deadline, < 1 day  → student submits → "late" ✅
    //      After deadline, > 1 day  → cron runs       → "missed" ❌
    const gracePeriodMs = 1 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(now - gracePeriodMs);

    const expiredForms = await Form.find({
      isActive: true,
      deadline: { $lt: cutoff }
    });

    for (const form of expiredForms) {
      const missedSubmissions = await Submission.find({
        form: form._id,
        status: 'pending'
      }).populate('student', 'name email phone notificationPreferences');

      if (missedSubmissions.length === 0) continue;

      const missedStudents = missedSubmissions.map(s => s.student);
      await applyMissedPenalties(form, missedStudents);

      console.log(`[CRON] ✅ Applied missed penalties for "${form.title}" - ${missedStudents.length} students`);
    }
  } catch (err) {
    console.error('[CRON] ❌ Error in applyMissedDeadlinePenalties:', err.message);
  }
};

module.exports = { startScheduler, checkDeadlinesAndNotify, applyMissedDeadlinePenalties };