const { google } = require('googleapis');
const auth = require('../config/googleauth');

/**
 * Maps frontend types to Google Forms API structure.
 * Includes fallbacks for AI-generated types like 'multiple_choice'.
 */
const buildQuestionRequest = (q, index) => {
  let questionPayload;
  const type = (q.type || 'text').toLowerCase();

  switch (type) {
    case 'text':
    case 'short answer':
      questionPayload = { textQuestion: { paragraph: false } };
      break;
    case 'paragraph':
    case 'long answer':
      questionPayload = { textQuestion: { paragraph: true } };
      break;
    case 'radio':
    case 'multiple_choice':
    case 'multiple_choice_question':
      questionPayload = {
        choiceQuestion: {
          type: 'RADIO',
          options: (q.options || ['Option 1']).map(opt => ({ value: String(opt || 'Option') }))
        }
      };
      break;
    case 'checkbox':
    case 'checkboxes':
      questionPayload = {
        choiceQuestion: {
          type: 'CHECKBOX',
          options: (q.options || ['Option 1']).map(opt => ({ value: String(opt || 'Option') }))
        }
      };
      break;
    case 'dropdown':
      questionPayload = {
        choiceQuestion: {
          type: 'DROP_DOWN',
          options: (q.options || ['Option 1']).map(opt => ({ value: String(opt || 'Option') }))
        }
      };
      break;
    case 'scale':
    case 'linear_scale':
      questionPayload = {
        scaleQuestion: {
          low: q.low || 1,
          high: q.high || 5,
          lowLabel: q.lowLabel || '',
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

/**
 * Generates a Google Form based on FormTrack data.
 */
const generateCustomForm = async (formTitle, formDescription, teacherName, questions = []) => {
  if (!questions || !questions.length) {
    throw new Error('At least one question is required to generate a Google Form.');
  }

  // Filter out unsupported types
  const validQuestions = questions.filter(q => q.type !== 'fileUpload');

  if (!validQuestions.length) {
    throw new Error('No valid questions after removing unsupported types.');
  }

  const authClient = await auth.getClient();
  const forms = google.forms({ version: 'v1', auth: authClient });

  // 1. Create the initial Form container
  const newForm = await forms.forms.create({
    requestBody: {
      info: {
        title: formTitle,
        documentTitle: `${formTitle} (${teacherName})`
      }
    }
  });

  const formId = newForm.data.formId;
  const requests = [];

  // 2. Add description if exists
  if (formDescription) {
    requests.push({
      updateFormInfo: {
        info: { description: formDescription },
        updateMask: 'description'
      }
    });
  }

  // 3. Inject standard FormTrack identification fields (Name & Roll Number)
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

  // 4. Map and add all user/AI generated questions
  validQuestions.forEach((q, i) => {
    requests.push(buildQuestionRequest(q, i + 2));
  });

  // 5. Execute batch update to build the form items
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
 * Pre-defined template for Internship tracking.
 */
const generateInternshipForm = async (teacherName, subject) => {
  return generateCustomForm(
    `Internship Status - ${subject}`,
    'Please fill in your internship details accurately.',
    teacherName,
    [
      { type: 'text', title: 'Company Name', required: true },
      { type: 'paragraph', title: 'HR Manager Name & Contact Info', required: true },
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