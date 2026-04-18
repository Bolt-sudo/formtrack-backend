const mongoose = require('mongoose');

const fineSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  form: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true
  },
  // ✅ FIX: submission is now optional — missed-deadline fines have no submission record
  submission: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Submission',
    default: null
  },
  deadline: {
    type: Date,
    required: true
  },
  submittedAt: {
    type: Date,
    required: true
  },
  hoursLate: {
    type: Number,
    default: null    // ✅ FIX: null for missed fines (never submitted), required removed
  },
  daysLate: {
    type: Number,
    default: null    // ✅ FIX: null for missed fines, distinguishable from 0 (on-time)
  },
  fineAmount: {
    type: Number,
    required: true
  },
  // ✅ NEW: flag to distinguish late-submission fines from missed-deadline fines
  fineType: {
    type: String,
    enum: ['late', 'missed'],
    default: 'late'
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'waived'],
    default: 'pending'
  },
  waivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  waivedReason: {
    type: String,
    default: null
  },
  paidAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// One fine per student per form
fineSchema.index({ student: 1, form: 1 }, { unique: true });

module.exports = mongoose.model('Fine', fineSchema);