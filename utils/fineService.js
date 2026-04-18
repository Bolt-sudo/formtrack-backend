const Fine = require('../models/Fine');
const mongoose = require('mongoose');

// Fine config — you can move this to DB later as a "FineRule" collection
const FINE_CONFIG = {
  gracePeriodHours: 1,    // 1 hour free window after deadline
  finePerDay: 10,          // ₹10 per day late
  maxFine: 100,            // ₹100 maximum cap
  missedFine: 50           // ₹50 flat fine for never submitting
};

/**
 * Calculate fine amount for a late submission
 * Returns null if not late or within grace period
 */
const calculateFine = (deadline, submittedAt) => {
  const deadlineDate = new Date(deadline);
  const submittedDate = new Date(submittedAt);

  if (submittedDate <= deadlineDate) return null; // on time

  const msLate = submittedDate - deadlineDate;
  const hoursLate = msLate / (1000 * 60 * 60);

  if (hoursLate <= FINE_CONFIG.gracePeriodHours) return null; // within grace period

  const daysLate = Math.ceil(hoursLate / 24);
  const rawFine = daysLate * FINE_CONFIG.finePerDay;
  const fineAmount = Math.min(rawFine, FINE_CONFIG.maxFine);

  return {
    hoursLate: parseFloat(hoursLate.toFixed(2)),
    daysLate,
    fineAmount
  };
};

/**
 * Create a fine record after a late submission.
 * ✅ FIX: If an existing fine exists for this student+form, UPDATE it
 *         instead of returning stale data — handles re-submission edge cases.
 */
const createFineIfLate = async (studentId, formId, submissionId, deadline, submittedAt) => {
  const result = calculateFine(deadline, submittedAt);
  if (!result) return null; // no fine needed

  // ✅ FIX: Update existing fine if it exists (re-submission scenario)
  const existing = await Fine.findOne({ student: studentId, form: formId });
  if (existing) {
    // Only update if new fine is higher (student submitted even later)
    if (result.fineAmount > existing.fineAmount) {
      existing.hoursLate = result.hoursLate;
      existing.daysLate = result.daysLate;
      existing.fineAmount = result.fineAmount;
      existing.submittedAt = submittedAt;
      existing.submission = submissionId;
      await existing.save();
    }
    return existing;
  }

  const fine = await Fine.create({
    student: studentId,
    form: formId,
    submission: submissionId,
    deadline,
    submittedAt,
    hoursLate: result.hoursLate,
    daysLate: result.daysLate,
    fineAmount: result.fineAmount,
    fineType: 'late', // ✅
    status: 'pending'
  });

  return fine;
};

/**
 * ✅ NEW: Create a flat fine for a student who completely missed the deadline.
 * Called from applyMissedPenalties in notificationService.js.
 * Uses a fake submittedAt far in the future to represent "never submitted".
 */
const createMissedFine = async (studentId, formId, deadline) => {
  // Avoid duplicate fine
  const existing = await Fine.findOne({ student: studentId, form: formId });
  if (existing) return existing;

  const fine = await Fine.create({
    student: studentId,
    form: formId,
    submission: null,
    deadline,
    submittedAt: new Date(),   // ✅ FIX: actual time penalty was applied
    hoursLate: null,           // ✅ FIX: null = never submitted (0 looked like on-time)
    daysLate: null,
    fineAmount: FINE_CONFIG.missedFine,
    fineType: 'missed',
    status: 'pending'
  });

  return fine;
};

/**
 * Get all fines for a student
 */
const getStudentFines = async (studentId) => {
  return await Fine.find({ student: studentId })
    .populate('form', 'title subject deadline')
    .sort({ createdAt: -1 });
};

/**
 * Get total pending fine amount for a student
 */
const getPendingFineTotal = async (studentId) => {
  const result = await Fine.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        status: 'pending'
      }
    },
    {
      $group: { _id: null, total: { $sum: '$fineAmount' } }
    }
  ]);
  return result[0]?.total || 0;
};

module.exports = {
  calculateFine,
  createFineIfLate,
  createMissedFine,
  getStudentFines,
  getPendingFineTotal,
  FINE_CONFIG
};