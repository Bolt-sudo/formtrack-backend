const syncGoogleFormResponses = async () => {
  try {
    const authClient = await auth.getClient();
    const formsApi = google.forms({ version: 'v1', auth: authClient });

    const activeForms = await Form.find({
      isActive: true,
      googleFormId: { $exists: true, $ne: null }
    });

    if (activeForms.length === 0) return;

    for (const form of activeForms) {
      try {
        const responsesRes = await formsApi.forms.responses.list({
          formId: form.googleFormId
        });

        const responses = responsesRes.data.responses || [];
        if (responses.length === 0) continue;

        const formData = await formsApi.forms.get({ formId: form.googleFormId });
        const items = formData.data.items || [];

        const questionMap = {};
        items.forEach(item => {
          if (item.questionItem) {
            questionMap[item.questionItem.question.questionId] = item.title;
          }
        });

        for (const response of responses) {
          const answers = {};
          const answerMap = response.answers || {};

          Object.keys(answerMap).forEach(questionId => {
            const questionTitle = questionMap[questionId] || questionId;
            const answerData = answerMap[questionId];
            const textAnswers = answerData.textAnswers?.answers || [];
            answers[questionTitle] = textAnswers.map(a => a.value).join(', ');
          });

          // Extract Roll Number from answers
          const rollNumber = (
            answers['Roll Number'] ||
            answers['Roll No'] ||
            answers['Roll no'] ||
            answers['roll number'] ||
            answers['rollnumber'] ||
            ''
          ).toString().trim();

          // Extract Name from answers
          const studentName = (
            answers['Name'] ||
            answers['Full Name'] ||
            answers['Student Name'] ||
            answers['name'] ||
            answers['full name'] ||
            ''
          ).toString().trim();

          let submission = null;

          // Step 1 — Try matching by Roll Number first
          if (rollNumber) {
            const byRoll = await Submission.findOne({
              form: form._id
            }).populate({
              path: 'student',
              match: { rollNumber: rollNumber },
              select: 'rollNumber name'
            });

            if (byRoll && byRoll.student) {
              submission = byRoll;
              console.log(`[SYNC] 🎯 Matched by Roll Number: ${rollNumber}`);
            }
          }

          // Step 2 — Fallback: Try matching by Name
          if (!submission && studentName) {
            const byName = await Submission.findOne({
              form: form._id
            }).populate({
              path: 'student',
              match: { name: { $regex: new RegExp(`^${studentName}$`, 'i') } },
              select: 'rollNumber name'
            });

            if (byName && byName.student) {
              submission = byName;
              console.log(`[SYNC] 🎯 Matched by Name: ${studentName}`);
            }
          }

          if (!submission || !submission.student) {
            console.log(`[SYNC] ⚠️ No student found - Roll: "${rollNumber}", Name: "${studentName}"`);
            continue;
          }

          // Skip if already synced
          if (
            submission.googleFormResponses &&
            Object.keys(submission.googleFormResponses).length > 0
          ) continue;

          const submittedTime = new Date(response.lastSubmittedTime);
          const isLate = submittedTime > new Date(form.deadline);

          await Submission.findByIdAndUpdate(submission._id, {
            googleFormResponses: answers,
            status: isLate ? 'late' : 'submitted',
            submittedAt: submittedTime
          });

          console.log(`[SYNC] ✅ Synced - Roll: ${rollNumber}, Name: ${studentName} - "${form.title}"`);
        }
      } catch (err) {
        console.error(`[SYNC] ❌ Error syncing form "${form.title}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[SYNC] ❌ syncGoogleFormResponses error:', err.message);
  }
};