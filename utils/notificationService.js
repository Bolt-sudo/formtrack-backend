const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Submission = require('../models/Submission');

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

const sendEmail = async ({ to, subject, html }, retries = 3, delay = 2000) => {
  const transporter = createTransporter();
  for (let i = 0; i < retries; i++) {
    try {
      await transporter.sendMail({
        from: `"FormTrack" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
      });
      return; // ✅ success, stop retrying
    } catch (err) {
      if (i === retries - 1) throw err; // last attempt, give up
      console.log(`⚠️ Email failed for ${to}, retrying (${i + 2}/${retries})...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
};

const sendSMS = async ({ to, message }) => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
  const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await twilio.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE,
    to
  });
};

const sendWhatsApp = async ({ to, message }) => {
  console.log('📲 Attempting WhatsApp notification...');
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials are missing from .env');
  }
  if (!process.env.TWILIO_WHATSAPP_FROM) {
    throw new Error('TWILIO_WHATSAPP_FROM is missing from .env');
  }

  const cleanTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const cleanFrom = process.env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
    ? process.env.TWILIO_WHATSAPP_FROM
    : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;

  const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const result = await twilio.messages.create({ body: message, from: cleanFrom, to: cleanTo });
  console.log('✅ WhatsApp sent! SID:', result.sid);
  return result;
};

const buildEmailHTML = ({ studentName, formTitle, subject, deadline, daysLeft, type, marksInfo, fine }) => {
  const colors = {
    reminder: '#1D9E75',
    urgent:   '#EF9F27',
    warning:  '#E24B4A',
    reward:   '#1D9E75',
    penalty:  '#E24B4A',
    fine:     '#C0392B'
  };
  const color = colors[type] || '#378ADD';

  const messages = {
    reminder: `You have <strong>${daysLeft} day(s)</strong> left to submit "<strong>${formTitle}</strong>" (${subject}).`,
    urgent:   `<strong>URGENT:</strong> Only <strong>1 day</strong> left to submit "<strong>${formTitle}</strong>" (${subject}).`,
    warning:  `The deadline for "<strong>${formTitle}</strong>" (${subject}) has <strong>passed</strong>. You did not submit.`,
    reward:   `You submitted "<strong>${formTitle}</strong>" on time! <strong>+${marksInfo}</strong> marks have been added.`,
    penalty:  `Your late submission for "<strong>${formTitle}</strong>" has been recorded. <strong>${marksInfo}</strong> marks have been deducted.`
  };

  const fineBlock = fine
    ? `
      <div style="margin-top: 16px; padding: 14px 16px; background: #fff5f5; border-left: 4px solid #C0392B; border-radius: 6px;">
        <p style="margin: 0 0 6px; font-size: 14px; color: #C0392B; font-weight: bold;">💸 Fine Imposed</p>
        <p style="margin: 0; font-size: 13px; color: #555;">
          ${fine.daysLate > 0
            ? `You submitted <strong>${fine.daysLate} day(s)</strong> late.<br/>`
            : `You missed the deadline entirely.<br/>`
          }
          Fine amount: <strong>₹${fine.fineAmount}</strong><br/>
          Status: <strong>Pending</strong> — Please clear this in FormTrack.
        </p>
      </div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0;">
        <div style="background: ${color}; padding: 20px 30px;">
          <h2 style="color: #fff; margin: 0; font-size: 18px;">FormTrack Notification</h2>
        </div>
        <div style="padding: 24px 30px;">
          <p style="color: #333; font-size: 15px;">Hi <strong>${studentName}</strong>,</p>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">${messages[type] || subject}</p>
          ${deadline ? `<p style="color: #888; font-size: 13px;">Deadline: <strong>${new Date(deadline).toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</strong></p>` : ''}
          ${fineBlock}
          <div style="margin-top: 20px; padding: 12px 16px; background: #f9f9f9; border-radius: 8px; font-size: 13px; color: #666;">
            Please log in to FormTrack to view your fine and submission details.
          </div>
        </div>
        <div style="padding: 12px 30px; background: #f9f9f9; font-size: 12px; color: #aaa; text-align: center;">
          FormTrack – Automated Student Compliance System
        </div>
      </div>
    </body>
    </html>
  `;
};

const buildWhatsAppMessage = ({ studentName, formTitle, subject, deadline, daysLeft, type, marksInfo, fine }) => {
  const deadlineStr = deadline
    ? new Date(deadline).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const fineText = fine
    ? `\n\n💸 *Fine Imposed: ₹${fine.fineAmount}*\n${fine.daysLate > 0 ? `📅 Submitted ${fine.daysLate} day(s) late.` : '📅 You missed the deadline entirely.'}\nPlease clear your fine on FormTrack.`
    : '';

  const messages = {
    reminder: `📋 *FormTrack Reminder*\n\nHi ${studentName},\n\nYou have *${daysLeft} day(s)* left to submit *${formTitle}* (${subject}).\n\n📅 Deadline: ${deadlineStr}\n\nPlease log in to FormTrack to submit. ✅`,
    urgent:   `⚠️ *FormTrack URGENT*\n\nHi ${studentName},\n\nOnly *1 day* left to submit *${formTitle}* (${subject})!\n\n📅 Deadline: ${deadlineStr}\n\nSubmit NOW on FormTrack! 🚨`,
    warning:  `❌ *FormTrack Missed Deadline*\n\nHi ${studentName},\n\nThe deadline for *${formTitle}* (${subject}) has *passed*. You did not submit.\n\nPlease check FormTrack for details.${fineText}`,
    reward:   `🎉 *FormTrack - Marks Added*\n\nHi ${studentName},\n\nYou submitted *${formTitle}* on time!\n\n✅ *+${marksInfo} marks* have been added.`,
    penalty:  `⚠️ *FormTrack - Late Submission*\n\nHi ${studentName},\n\nYour late submission for *${formTitle}* has been recorded.\n\n❌ *${marksInfo} marks* deducted.${fineText}`
  };

  return messages[type] || `FormTrack: Notification for ${formTitle}`;
};

const sendNotification = async ({ recipient, form, type, channel, subject, message, marksInfo, fine }) => {
  console.log('📧 sendNotification called:', channel, recipient._id);

  try {
    const notification = await Notification.create({
      recipient: recipient._id,
      form: form?._id,
      type,
      channel,
      subject,
      message,
      status: 'pending'
    });

    try {
      if (channel === 'email' && recipient.notificationPreferences?.email !== false) {
        const html = buildEmailHTML({
          studentName: recipient.name,
          formTitle: form?.title || '',
          subject: form?.subject || '',
          deadline: form?.deadline,
          daysLeft: form ? Math.floor((new Date(form.deadline) - new Date()) / 86400000) : 0,
          type,
          marksInfo,
          fine
        });
        await sendEmail({ to: recipient.email, subject, html });
      }

      if (channel === 'sms' && recipient.notificationPreferences?.sms && recipient.phone) {
        await sendSMS({ to: recipient.phone, message });
      }

      if (channel === 'whatsapp' && recipient.phone) {
        await sendWhatsApp({ to: recipient.phone, message });
      }

      notification.status = 'sent';
      await notification.save();
    } catch (err) {
      notification.status = 'failed';
      notification.error = err.message;
      await notification.save();
      console.error(`❌ Notification failed [${channel}] for ${recipient.email}:`, err.message);
    }

    return notification;
  } catch (err) {
    console.error(`❌ Notification.create failed [${channel}]:`, err.message);
  }
};

const sendReminderToStudents = async (form, students, triggerType = 'auto') => {
  console.log('🔍 DEBUG students:', students.map(s => ({ name: s.name, phone: s.phone })));
  const daysLeft = Math.floor((new Date(form.deadline) - new Date()) / 86400000);
  const type = daysLeft <= 1 ? 'urgent' : 'reminder';
  const subject = daysLeft <= 1
    ? `⚠️ Urgent: "${form.title}" is due tomorrow!`
    : `📋 Reminder: "${form.title}" is due in ${daysLeft} days`;

  const promises = students.map(async (student) => {
    await sendNotification({
      recipient: student,
      form,
      type,
      channel: 'email',
      subject,
      message: `Reminder for ${form.title} - deadline in ${daysLeft} day(s).`
    });

    if (student.phone) {
      const whatsappMessage = buildWhatsAppMessage({
        studentName: student.name,
        formTitle: form.title,
        subject: form.subject,
        deadline: form.deadline,
        daysLeft,
        type
      });
      await sendNotification({
        recipient: student,
        form,
        type,
        channel: 'whatsapp',
        subject,
        message: whatsappMessage
      });
    }
  });

  await Promise.allSettled(promises);
  console.log(`✅ [${triggerType}] Sent ${type} reminders to ${students.length} students for: "${form.title}"`);
};

/**
 * ✅ FIX: Now also creates a missed fine for each student who never submitted.
 */
const applyMissedPenalties = async (form, students) => {
  
  const { createMissedFine } = require('./fineService'); // ✅ NEW

  const promises = students.map(async (student) => {
    // ✅ FIX: upsert:true creates a missed record even if no submission doc existed
    await Submission.findOneAndUpdate(
      { form: form._id, student: student._id, status: { $in: ['pending'] } },
      {
        $setOnInsert: { form: form._id, student: student._id },
        $set: { status: 'missed', marksApplied: -form.missedPenalty, marksType: 'penalty' }
      },
      { upsert: true }
    );

    await User.findByIdAndUpdate(student._id, {
      $inc: { internalMarks: -form.missedPenalty }
    });

    // ✅ NEW: Create a flat fine for missed deadline
    let fine = null;
    try {
      fine = await createMissedFine(student._id, form._id, form.deadline);
    } catch (err) {
      console.error(`❌ Failed to create missed fine for ${student.name}:`, err.message);
    }

    const fineText = fine ? ` A fine of ₹${fine.fineAmount} has been imposed.` : '';

    await sendNotification({
      recipient: student,
      form,
      type: 'warning',
      channel: 'email',
      subject: `❌ Missed deadline: "${form.title}" – Penalty applied`,
      message: `You missed the deadline for ${form.title}. ${form.missedPenalty} mark(s) deducted.${fineText}`,
      marksInfo: `-${form.missedPenalty}`,
      fine // ✅ pass fine to email builder
    });

    if (student.phone) {
      const whatsappMessage = buildWhatsAppMessage({
        studentName: student.name,
        formTitle: form.title,
        subject: form.subject,
        type: 'warning',
        marksInfo: `-${form.missedPenalty}`,
        fine // ✅ pass fine to WhatsApp builder
      });
      await sendNotification({
        recipient: student,
        form,
        type: 'warning',
        channel: 'whatsapp',
        subject: `❌ Missed deadline: "${form.title}" – Penalty applied`,
        message: whatsappMessage,
        marksInfo: `-${form.missedPenalty}`
      });
    }
  });

  await Promise.allSettled(promises);
  console.log(`✅ Applied missed penalties to ${students.length} students for: "${form.title}"`);
};

module.exports = {
  sendNotification,
  sendReminderToStudents,
  applyMissedPenalties,
  sendWhatsApp,
  sendEmail
};