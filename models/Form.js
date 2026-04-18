const mongoose = require('mongoose');

const formSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Form title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deadline: {
    type: Date,
    required: [true, 'Deadline is required']
  },
  // Reward/penalty settings
  onTimeReward: {
    type: Number,
    default: 2,
    min: 0,
    max: 10
  },
  latePenalty: {
    type: Number,
    default: 1,
    min: 0,
    max: 10
  },
  missedPenalty: {
    type: Number,
    default: 2,
    min: 0,
    max: 10
  },
  // Reminder schedule in days before deadline
  reminderDays: {
    type: [Number],
    default: [3, 1]
  },
  // Which students this form is assigned to
  assignedStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Track which reminder days have been sent
  remindersSent: [{
    daysBeforeDeadline: Number,
    sentAt: Date
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  formLink: {
    type: String,
    trim: true
  },
  googleFormId: {
    type: String,
    trim: true
  }
}, { timestamps: true });

// Virtual: days remaining
formSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const diff = this.deadline - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual: is overdue
formSchema.virtual('isOverdue').get(function() {
  return new Date() > this.deadline;
});

formSchema.set('toJSON', { virtuals: true });
formSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Form', formSchema);
