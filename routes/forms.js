const { generateInternshipForm, generateCustomForm } = require('../utils/googleformservice');
const express = require('express');
const Form = require('../models/Form');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { sendReminderToStudents } = require('../utils/notificationService');

const router = express.Router();

// @route   POST /api/forms
// @desc    Create a new form (teacher only)
// @access  Private/Teacher
router.post('/', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { title, description, subject, deadline, onTimeReward, latePenalty,
            missedPenalty, reminderDays, assignedStudents, formLink } = req.body;

    // Auto-extract googleFormId from formLink
    let googleFormId;
    if (formLink) {
      const match = formLink.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
      if (match) googleFormId = match[1];
    }

    const form = await Form.create({
      title, description, subject, deadline,
      onTimeReward, latePenalty, missedPenalty,
      reminderDays: reminderDays || [3, 1],
      assignedStudents,
      formLink,
      googleFormId,
      teacher: req.user._id
    });

    if (assignedStudents && assignedStudents.length > 0) {
      const submissionDocs = assignedStudents.map(studentId => ({
        form: form._id,
        student: studentId,
        status: 'pending'
      }));
      await Submission.insertMany(submissionDocs, { ordered: false })
        .catch(err => { if (err.code !== 11000) throw err; });
    }

    res.status(201).json({ success: true, form });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/forms
// @desc    Get all forms (teacher sees own, student sees assigned)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let forms;

    if (req.user.role === 'teacher' || req.user.role === 'admin') {
      forms = await Form.find({ teacher: req.user._id })
        .populate('teacher', 'name email')
        .populate('assignedStudents', 'name email rollNumber')
        .sort({ deadline: 1 });
    } else {
      forms = await Form.find({ assignedStudents: req.user._id, isActive: true })
        .populate('teacher', 'name email')
        .sort({ deadline: 1 });
    }

    if (req.user.role === 'teacher' || req.user.role === 'admin') {
      const formsWithCounts = await Promise.all(forms.map(async (form) => {
        const submittedCount = await Submission.countDocuments({
          form: form._id,
          status: { $in: ['submitted', 'late'] }
        });
        const totalCount = form.assignedStudents.length;
        return { ...form.toObject(), submittedCount, totalCount };
      }));
      return res.json({ success: true, forms: formsWithCounts });
    }

    res.json({ success: true, forms });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/forms/:id
// @desc    Get single form
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const form = await Form.findById(req.params.id)
      .populate('teacher', 'name email')
      .populate('assignedStudents', 'name email rollNumber');

    if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });

    res.json({ success: true, form });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/forms/:id
// @desc    Update form (teacher only)
// @access  Private/Teacher
router.put('/:id', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    if (req.body.deadline) {
      req.body.remindersSent = [];
    }

    // Auto-extract googleFormId if formLink is being updated
    if (req.body.formLink) {
      const match = req.body.formLink.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
      if (match) req.body.googleFormId = match[1];
    }

    const form = await Form.findOneAndUpdate(
      { _id: req.params.id, teacher: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!form) return res.status(404).json({ success: false, message: 'Form not found or unauthorized.' });

    res.json({ success: true, form });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/forms/:id
// @desc    Delete form
// @access  Private/Teacher
router.delete('/:id', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const form = await Form.findOneAndDelete({ _id: req.params.id, teacher: req.user._id });
    if (!form) return res.status(404).json({ success: false, message: 'Form not found or unauthorized.' });

    await Submission.deleteMany({ form: req.params.id });
    res.json({ success: true, message: 'Form deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/forms/:id/send-reminder
// @desc    Manually trigger reminder for a form
// @access  Private/Teacher
router.post('/:id/send-reminder', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const form = await Form.findById(req.params.id)
      .populate('assignedStudents', 'name email phone notificationPreferences');

    if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });

    const pendingSubmissions = await Submission.find({ form: form._id, status: 'pending' })
      .populate('student', 'name email phone notificationPreferences');

    const pendingStudents = pendingSubmissions.map(s => s.student);
    await sendReminderToStudents(form, pendingStudents, 'manual');

    res.json({ success: true, message: `Reminder sent to ${pendingStudents.length} students.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/forms/:id/stats
// @desc    Get submission stats for a form
// @access  Private/Teacher
router.get('/:id/stats', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const submissions = await Submission.find({ form: req.params.id })
      .populate('student', 'name email rollNumber');

    const stats = {
      total: submissions.length,
      submitted: submissions.filter(s => s.status === 'submitted').length,
      late: submissions.filter(s => s.status === 'late').length,
      missed: submissions.filter(s => s.status === 'missed').length,
      pending: submissions.filter(s => s.status === 'pending').length,
      submissions
    };

    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GOOGLE FORM GENERATION ROUTES
// ─────────────────────────────────────────────────────────────

// @route   POST /api/forms/:id/generate-internship-form
// @desc    Generate a hardcoded Internship Tracking Google Form
// @access  Private/Teacher
router.post('/:id/generate-internship-form', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });

    const teacherName = req.user.name || 'Teacher';
    const result = await generateInternshipForm(teacherName, form.subject || 'Internship');

    // Save formLink and auto-extract googleFormId
    form.formLink = result.url;
    const match = result.url.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
    if (match) form.googleFormId = match[1];
    await form.save();

    res.json({
      success: true,
      message: 'Internship Google Form created successfully!',
      url: result.url,
      googleFormId: form.googleFormId
    });
  } catch (err) {
    console.error('Google API Error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate Google Form: ' + err.message });
  }
});

// @route   POST /api/forms/:id/generate-custom-form
// @desc    Generate a fully custom Google Form with teacher-defined questions
// @access  Private/Teacher
router.post('/:id/generate-custom-form', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });

    const { formTitle, formDescription, questions } = req.body;

    if (!formTitle || !formTitle.trim()) {
      return res.status(400).json({ success: false, message: 'formTitle is required.' });
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one question is required.' });
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.type) {
        return res.status(400).json({ success: false, message: `Question at index ${i} is missing "type".` });
      }
      if (!q.title || !q.title.trim()) {
        return res.status(400).json({ success: false, message: `Question at index ${i} is missing "title".` });
      }
      const choiceTypes = ['radio', 'checkbox', 'dropdown'];
      if (choiceTypes.includes(q.type) && (!Array.isArray(q.options) || q.options.length < 2)) {
        return res.status(400).json({
          success: false,
          message: `Question at index ${i} (type: "${q.type}") must have at least 2 options.`
        });
      }
    }

    const teacherName = req.user.name || 'Teacher';
    const result = await generateCustomForm(formTitle.trim(), formDescription || '', teacherName, questions);

    // Save formLink and auto-extract googleFormId
    form.formLink = result.url;
    const match = result.url.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
    if (match) form.googleFormId = match[1];
    await form.save();

    res.json({
      success: true,
      message: `Google Form "${formTitle}" created successfully with ${questions.length} question(s).`,
      url: result.url,
      googleFormId: form.googleFormId
    });
  } catch (err) {
    console.error('Google API Error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate Google Form: ' + err.message });
  }
});

module.exports = router;