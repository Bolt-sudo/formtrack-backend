const { google } = require('googleapis');
const auth = require('../config/googleauth');

/**
 * Supported question types a teacher can pass:
 *
 *  { type: 'text',     title: 'Your question', required: true,  paragraph: false }
 *  { type: 'paragraph',title: 'Your question', required: true }
 *  { type: 'radio',    title: 'Your question', required: true,  options: ['A','B','C'] }
 *  { type: 'checkbox', title: 'Your question', required: false, options: ['A','B','C'] }
 *  { type: 'dropdown', title: 'Your question', required: true,  options: ['A','B','C'] }
 *  { type: 'scale',    title: 'Your question', required: false, low: 1, high: 5,
 *                      lowLabel: 'Poor', highLabel: 'Excellent' }
 *  { type: 'date',     title: 'Your question', required: false }
 *  { type: 'time',     title: 'Your question', required: false }
 */

/**
 * Convert one teacher-defined question into a Google Forms API `createItem` request.
 */
const buildQuestionRequest = (q, index) => {
  let questionPayload;

  switch (q.type) {
    case 'text':
      questionPayload = {
        textQuestion: { paragraph: false }
      };
      break;

    case 'paragraph':
      questionPayload = {
        textQuestion: { paragraph: true }
      };
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
      questionPayload = {
        dateQuestion: { includeTime: false, includeYear: true }
      };
      break;

    case 'time':
      questionPayload = {
        timeQuestion: { duration: false }
      };
      break;

    default:
      // Fallback: treat unknown types as short text
      questionPayload = {
        textQuestion: { paragraph: false }
      };
  }

  return {
    createItem: {
      item: {
        title: q.title || `Question ${index + 1}`,
        ...(q.description ? { description: q.description } : {}),
        questionItem: {
          question: {
            required: q.required !== false, // default true
            ...questionPayload
          }
        }
      },
      location: { index }
    }
  };
};

/**
 * Generate a fully dynamic Google Form.
 *
 * @param {string} formTitle       - Title shown at top of the Google Form
 * @param {string} formDescription - Optional description shown below the title
 * @param {string} teacherName     - Used in the internal document title (Drive)
 * @param {Array}  questions       - Array of question objects (see types above)
 *
 * @returns {{ url: string, id: string }}
 *
 * Example call:
 *   generateCustomForm(
 *     'Internship Status Form',
 *     'Fill this form to update your internship details.',
 *     'Dr. Sharma',
 *     [
 *       { type: 'text',     title: 'Full Name & Roll Number', required: true },
 *       { type: 'text',     title: 'Company Name',            required: true },
 *       { type: 'paragraph',title: 'HR Manager Name & Contact Info', required: true },
 *       { type: 'radio',    title: 'Internship Status', required: true,
 *         options: ['Selected / Joined', 'Interview Scheduled', 'Searching'] }
 *     ]
 *   )
 */
const generateCustomForm = async (formTitle, formDescription, teacherName, questions = []) => {
  if (!questions.length) {
    throw new Error('At least one question is required to generate a Google Form.');
  }

  const authClient = await auth.getClient();
  const forms = google.forms({ version: 'v1', auth: authClient });

  // Step 1: Create the blank form with just a title
  const newForm = await forms.forms.create({
    requestBody: {
      info: {
        title: formTitle,
        documentTitle: `${formTitle} (${teacherName})`
      }
    }
  });

  const formId = newForm.data.formId;

  // Step 2: Build update requests — description + all questions
  const requests = [];

  // Optionally set the form description
  if (formDescription) {
    requests.push({
      updateFormInfo: {
        info: { description: formDescription },
        updateMask: 'description'
      }
    });
  }

  // Add each question
  questions.forEach((q, i) => {
    requests.push(buildQuestionRequest(q, i));
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

/**
 * Keep the old internship function for backward compatibility,
 * but now it delegates to generateCustomForm internally.
 */
const generateInternshipForm = async (teacherName, subject) => {
  return generateCustomForm(
    `Internship Status - ${subject}`,
    'Please fill in your internship details accurately.',
    teacherName,
    [
      { type: 'text',      title: 'Full Name & Roll Number',      required: true },
      { type: 'text',      title: 'Company Name',                  required: true },
      { type: 'paragraph', title: 'HR Manager Name & Contact Info',required: true },
      {
        type: 'radio',
        title: 'Internship Status',
        required: true,
        options: ['Selected / Joined', 'Interview Scheduled', 'Searching']
      }
    ]
  );
};

module.exports = { generateCustomForm, generateInternshipForm };