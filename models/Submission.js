const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  form: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'late', 'missed'],
    default: 'pending'
  },
  submittedAt: {
    type: Date
  },
  marksApplied: {
    type: Number,
    default: 0
  },
  marksType: {
    type: String,
    enum: ['reward', 'penalty', 'none'],
    default: 'none'
  },
  notes: {
    type: String,
    trim: true
  },
  googleFormResponses: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Track notification history for this submission
  notificationsSent: [{
    type: { type: String, enum: ['reminder', 'warning', 'reward', 'penalty'] },
    sentAt: Date,
    channel: { type: String, enum: ['email', 'sms', 'push'] }
  }]
}, { timestamps: true });

// Unique constraint: one submission record per student per form
submissionSchema.index({ form: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('Submission', submissionSchema);
