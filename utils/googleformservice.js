const { google } = require('googleapis');
const auth = require('../config/googleauth');

/**
 * Supported question types a teacher can pass:
 *
 *  { type: 'text',      title: 'Your question', required: true }
 *  { type: 'paragraph', title: 'Your question', required: true }
 *  { type: 'radio',     title: 'Your question', required: true,  options: ['A','B','C'] }
 *  { type: 'checkbox',  title: 'Your question', required: false, options: ['A','B','C'] }
 *  { type: 'dropdown',  title: 'Your question', required: true,  options: ['A','B','C'] }
 *  { type: 'scale',     title: 'Your question', required: false, low: 1, high: 5 }
 *  { type: 'date',      title: 'Your question', required: false }
 *  { type: 'time',      title: 'Your question', required: false }
 *  { type: 'fileUpload',title: 'Upload Offer Letter', required: false }
 */

const buildQuestionRequest = (q, index) => {
  let questionPayload;

  switch (q.type) {
    case 'text':
      questionPayload = { textQuestion: { paragraph: false } };
      break;
    case 'paragraph':
      questionPayload = { textQuestion: { paragraph: true } };
      break;
    case 'radio':
      questionPayload = {
        choiceQuestion: {
          type: 'RADIO',
          options: (q.options || []).map(opt => ({ value: String(opt) }))
        }
      };
      break;
    case 'checkbox':
      questionPayload = {
        choiceQuestion: {
          type: 'CHECKBOX',
          options: (q.options || []).map(opt => ({ value: String(opt) }))
        }
      };
      break;
    case 'dropdown':
      questionPayload = {
        choiceQuestion: {
          type: 'DROP_DOWN',
          options: (q.options || []).map(opt => ({ value: String(opt) }))
        }
      };
      break;
    case 'scale':
      questionPayload = {
        scaleQuestion: {
          low:       q.low       || 1,
          high:      q.high      || 5,
          lowLabel:  q.lowLabel  || '',
          highLabel: q.highLabel || ''
        }
      };
      break;
    case 'date':
      questionPayload = { dateQuestion: { includeTime: false, includeYear: true } };
      break;
    case 'time':
      questionPayload = { timeQuestion: { duration: false } };
      break;
    case 'fileUpload':
      questionPayload = {
        fileUploadQuestion: {
          folderId: '',
          types: ['ANY'],
          maxFiles: 1,
          maxFileSize: '10485760'
        }
      };
      break;
    default:
      questionPayload = { textQuestion: { paragraph: false } };
  }

  return {
    createItem: {
      item: {
        title: q.title || `Question ${index + 1}`,
        ...(q.description ? { description: q.description } : {}),
        questionItem: {
          question: {
            required: q.required !== false,
            ...questionPayload
          }
        }
      },
      location: { index }
    }
  };
};

const generateCustomForm = async (formTitle, formDescription, teacherName, questions = []) => {
  if (!questions.length) {
    throw new Error('At least one question is required to generate a Google Form.');
  }

  const authClient = await auth.getClient();
  const forms = google.forms({ version: 'v1', auth: authClient });

  // Step 1: Create the blank form with title
  const newForm = await forms.forms.create({
    requestBody: {
      info: {
        title: formTitle,
        documentTitle: `${formTitle} (${teacherName})`
      }
    }
  });

  const formId = newForm.data.formId;

  // Step 2: Build update requests
  const requests = [];

  // Set form description if provided
  if (formDescription) {
    requests.push({
      updateFormInfo: {
        info: { description: formDescription },
        updateMask: 'description'
      }
    });
  }

  // ── Auto-add Name as FIRST question (index 0) ─────────────────
  requests.push({
    createItem: {
      item: {
        title: 'Name',
        description: 'Enter your Full Name as registered',
        questionItem: {
          question: {
            required: true,
            textQuestion: { paragraph: false }
          }
        }
      },
      location: { index: 0 }
    }
  });

  // ── Auto-add Roll Number as SECOND question (index 1) ─────────
  requests.push({
    createItem: {
      item: {
        title: 'Roll Number',
        description: 'Enter your Roll Number exactly as registered',
        questionItem: {
          question: {
            required: true,
            textQuestion: { paragraph: false }
          }
        }
      },
      location: { index: 1 }
    }
  });

  // ── Add teacher's questions starting from index 2 ─────────────
  questions.forEach((q, i) => {
    requests.push(buildQuestionRequest(q, i + 2));
  });

  await forms.forms.batchUpdate({
    formId,
    requestBody: { requests }
  });

  return {
    url: `https://docs.google.com/forms/d/${formId}/viewform`,
    id: formId
  };
};

const generateInternshipForm = async (teacherName, subject) => {
  return generateCustomForm(
    `Internship Status - ${subject}`,
    'Please fill in your internship details accurately.',
    teacherName,
    [
      { type: 'text',      title: 'Company Name',                   required: true },
      { type: 'paragraph', title: 'HR Manager Name & Contact Info', required: true },
      {
        type: 'radio',
        title: 'Internship Status',
        required: true,
        options: ['Selected / Joined', 'Interview Scheduled', 'Searching']
      },
      {
        type: 'fileUpload',
        title: 'Upload Offer Letter (PDF/Image)',
        required: false
      }
    ]
  );
};

module.exports = { generateCustomForm, generateInternshipForm };