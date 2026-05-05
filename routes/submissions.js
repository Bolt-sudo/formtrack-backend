const express = require('express');
const Submission = require('../models/Submission');
const Form = require('../models/Form');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { sendNotification } = require('../utils/notificationService');
const { createFineIfLate } = require('../utils/fineService');

const router = express.Router();

// @route   GET /api/submissions/my
// @desc    Student gets their own submissions
// @access  Private/Student
router.get('/my', protect, authorize('student'), async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate('form', 'title subject deadline onTimeReward latePenalty')
      .sort({ createdAt: -1 });

    res.json({ success: true, submissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/submissions/form/:formId
// @desc    Teacher views all submissions for a form
// @access  Private/Teacher
router.get('/form/:formId', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const submissions = await Submission.find({ form: req.params.formId })
      .populate('student', 'name email rollNumber')
      .sort({ submittedAt: -1 });

    res.json({ success: true, submissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/submissions/sync
// @desc    Google Apps Script webhook — fires when student submits Google Form
// @access  Public (called by Apps Script, not by logged-in user)
// ⚠️ IMPORTANT: This route MUST be above /:formId — otherwise Express mistakes "sync" for a formId
router.post('/sync', async (req, res) => {
  try {
    const { studentRollNumber, googleFormId, answers } = req.body;

    if (!studentRollNumber || !googleFormId) {
      return res.status(400).json({ success: false, message: 'Missing studentRollNumber or googleFormId' });
    }

    // Find form by googleFormId
    const form = await Form.findOne({ googleFormId });
    if (!form) return res.status(404).json({ success: false, message: 'Form not found for this googleFormId' });

    // Find student by rollNumber
    const student = await User.findOne({ rollNumber: studentRollNumber, role: 'student' });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found for this rollNumber' });

    const now = new Date();
    const isLate = now > form.deadline;
    const status = isLate ? 'late' : 'submitted';
    const marksApplied = isLate ? -form.latePenalty : form.onTimeReward;
    const marksType = isLate ? 'penalty' : 'reward';

    // Only apply marks if not already submitted
    const existing = await Submission.findOne({ form: form._id, student: student._id });
    const isFirstSubmission = !existing || !existing.submittedAt;

    await Submission.findOneAndUpdate(
      { form: form._id, student: student._id },
      {
        status,
        submittedAt: now,
        marksApplied,
        marksType,
        googleFormResponses: answers
      },
      { upsert: true, new: true }
    );

    if (isFirstSubmission) {
      await User.findByIdAndUpdate(student._id, {
        $inc: { internalMarks: marksApplied }
      });
    }

    console.log(`✅ Sync: ${student.name} (${studentRollNumber}) submitted form "${form.title}" — ${status}`);
    res.json({ success: true, status, student: student.name });

  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/submissions/:formId
// @desc    Student submits a form
// @access  Private/Student
router.post('/:formId', protect, authorize('student'), async (req, res) => {
  try {
    const form = await Form.findById(req.params.formId);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });

    if (!form.assignedStudents.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this form.' });
    }

    const now = new Date();
    const isLate = now > form.deadline;
    const status = isLate ? 'late' : 'submitted';

    let marksApplied = 0;
    let marksType = 'none';
    if (!isLate) {
      marksApplied = form.onTimeReward;
      marksType = 'reward';
    } else {
      marksApplied = -form.latePenalty;
      marksType = 'penalty';
    }

    // Check if already submitted before upsert to prevent double marks
    const existingSubmission = await Submission.findOne({ form: req.params.formId, student: req.user._id });
    const isFirstSubmission = !existingSubmission || !existingSubmission.submittedAt;

    const submission = await Submission.findOneAndUpdate(
      { form: req.params.formId, student: req.user._id },
      { status, submittedAt: now, marksApplied, marksType, submissionLink: req.body.submissionLink },
      { new: true, upsert: true }
    );

    // Only apply marks once — not on every re-submission
    if (isFirstSubmission) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { internalMarks: marksApplied }
      });
    }

    // Calculate and save fine if late
    let fine = null;
    if (isLate) {
      fine = await createFineIfLate(
        req.user._id,
        form._id,
        submission._id,
        form.deadline,
        now
      );
    }

    // Build notification message with fine info
    let notifMessage;
    let notifSubject;

    if (isLate) {
      const fineText = fine
        ? ` A fine of ₹${fine.fineAmount} has been imposed for ${fine.daysLate} day(s) late.`
        : '';
      notifMessage = `Your late submission for "${form.title}" has been recorded. ${form.latePenalty} mark(s) deducted.${fineText}`;
      notifSubject = `Late submission recorded${fine ? ` – ₹${fine.fineAmount} fine imposed` : ''}`;
    } else {
      notifMessage = `Great! Your submission for "${form.title}" is on time. +${form.onTimeReward} mark(s) added.`;
      notifSubject = 'Submission confirmed - Reward applied!';
    }

    const fullUser = await User.findById(req.user._id);

    await sendNotification({
      recipient: fullUser,
      form,
      type: isLate ? 'penalty' : 'reward',
      channel: 'email',
      subject: notifSubject,
      message: notifMessage,
      marksInfo: isLate ? `-${form.latePenalty}` : `+${form.onTimeReward}`,
      fine
    });

    if (fullUser.phone) {
      await sendNotification({
        recipient: fullUser,
        form,
        type: isLate ? 'penalty' : 'reward',
        channel: 'whatsapp',
        subject: notifSubject,
        message: notifMessage,
        marksInfo: isLate ? `-${form.latePenalty}` : `+${form.onTimeReward}`,
        fine
      });
    }

    res.json({
      success: true,
      message: isLate ? 'Submitted late. Penalty applied.' : 'Submitted on time! Reward applied.',
      submission,
      marksApplied,
      fine: fine || null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;