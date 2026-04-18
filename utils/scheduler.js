const cron = require('node-cron');
const { google } = require('googleapis');
const auth = require('../config/googleauth');
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

  // ── Google Form response sync: every 30 seconds ──────────────
  setInterval(async () => {
    await syncGoogleFormResponses();
  }, 30 * 1000);

  // ── Catch-up job on server start ─────────────────────────────
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
    // Run initial sync on startup
    await syncGoogleFormResponses();
  })();

  console.log('✅ Cron jobs scheduled:');
  console.log('   • Reminders    — every 1 minute');
  console.log('   • Penalties    — daily at midnight');
  console.log('   • Leaderboard  — every Monday at 12:01 AM');
  console.log('   • Form Sync    — every 30 seconds');
  console.log('   • Catch-up     — penalties + leaderboard on every startup');
};

const syncGoogleFormResponses = async () => {
  try {
    const authClient = await auth.getClient();
    const formsApi = google.forms({ version: 'v1', auth: authClient });

    // Get all active forms that have a Google Form ID
    const activeForms = await Form.find({
      isActive: true,
      googleFormId: { $exists: true, $ne: null }
    });

    if (activeForms.length === 0) return;

    for (const form of activeForms) {
      try {
        // Fetch all responses from Google Forms API
        const responsesRes = await formsApi.forms.responses.list({
          formId: form.googleFormId
        });

        const responses = responsesRes.data.responses || [];
        if (responses.length === 0) continue;

        // Get form questions to map questionId -> title
        const formData = await formsApi.forms.get({ formId: form.googleFormId });
        const items = formData.data.items || [];

        // Build questionId -> title map
        const questionMap = {};
        items.forEach(item => {
          if (item.questionItem) {
            questionMap[item.questionItem.question.questionId] = item.title;
          }
        });

        for (const response of responses) {
          const answers = {};
          const answerMap = response.answers || {};

          // Convert answers to readable format
          Object.keys(answerMap).forEach(questionId => {
            const questionTitle = questionMap[questionId] || questionId;
            const answerData = answerMap[questionId];
            const textAnswers = answerData.textAnswers?.answers || [];
            answers[questionTitle] = textAnswers.map(a => a.value).join(', ');
          });

          // Find Roll Number from answers (check common variations)
          const rollNumber = (
            answers['Roll Number'] ||
            answers['Roll No'] ||
            answers['Roll no'] ||
            answers['roll number'] ||
            answers['rollnumber'] ||
            ''
          ).toString().trim();

          if (!rollNumber) {
            console.log(`[SYNC] ⚠️ No roll number found in response for form: "${form.title}"`);
            continue;
          }

          // Find submission by matching student roll number
          const submission = await Submission.findOne({
            form: form._id
          }).populate({
            path: 'student',
            match: { rollNumber: rollNumber },
            select: 'rollNumber name'
          });

          if (!submission || !submission.student) {
            console.log(`[SYNC] ⚠️ No student found with roll: ${rollNumber}`);
            continue;
          }

          // Skip if already synced with same data
          if (
            submission.googleFormResponses &&
            Object.keys(submission.googleFormResponses).length > 0
          ) continue;

          // Update submission with Google Form responses
          const submittedTime = new Date(response.lastSubmittedTime);
          const isLate = submittedTime > new Date(form.deadline);

          await Submission.findByIdAndUpdate(submission._id, {
            googleFormResponses: answers,
            status: isLate ? 'late' : 'submitted',
            submittedAt: submittedTime
          });

          console.log(`[SYNC] ✅ Synced response for roll: ${rollNumber} - "${form.title}"`);
        }
      } catch (err) {
        console.error(`[SYNC] ❌ Error syncing form "${form.title}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[SYNC] ❌ syncGoogleFormResponses error:', err.message);
  }
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

module.exports = { startScheduler, checkDeadlinesAndNotify, applyMissedDeadlinePenalties, syncGoogleFormResponses };