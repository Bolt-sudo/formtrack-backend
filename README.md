# 📋 FormTrack — Student Form Alert & Compliance System

> A smart form management system for colleges that automates Google Form creation, tracks student submissions, sends WhatsApp & email reminders, and manages marks/penalties.

---

## 🏫 Project Info

| Field | Details |
|---|---|
| **College** | K.D.K College of Engineering, Nagpur |
| **Department** | Information Technology |
| **Year** | Final Year (4th Year) — 2025-26 |
| **Project Title** | FormTrack — Student Form Alert & Compliance System |

---

## 👨‍💻 Team Members

| Name | Role |
|---|---|
| Pradyumna Kumbhare | Full Stack Developer |
| Prit Ghorpade | Team Member |
| Sujal Harnor | Team Member |
| Atharva Markandevar | Team Member |

---

## 📌 Problem Statement

In colleges, teachers manually share Google Forms with students and have no way to track who has submitted and who hasn't. There is no automated reminder system, no penalty management, and no way to reward on-time submissions. FormTrack solves all these problems in one system.

---

## 🚀 Features

### 👨‍🏫 Teacher Features
- ✅ **Auto-generate Google Forms** — Create and publish real Google Forms directly from FormTrack with custom questions (text, multiple choice, file upload, date, etc.)
- ✅ **Paste existing Google Form link** — Link any existing Google Form to a FormTrack assignment
- ✅ **Assign forms to students** — Select specific students or all students at once
- ✅ **View student responses** — See all submitted answers directly in the dashboard
- ✅ **Real-time submission tracking** — See who submitted, who is pending, who is late
- ✅ **Send manual reminders** — Trigger WhatsApp & email reminders anytime
- ✅ **Automatic reminders** — Reminders sent automatically 3 days and 1 day before deadline
- ✅ **Marks & penalty system** — Set rewards for on-time, penalties for late/missed submissions
- ✅ **Fine management** — Track and manage student fines
- ✅ **Weekly leaderboard** — See top performing students every week

### 👨‍🎓 Student Features
- ✅ **Dashboard** — See all assigned forms, deadlines, and submission status
- ✅ **WhatsApp notifications** — Get reminded on WhatsApp before deadline
- ✅ **Email notifications** — Get email reminders for pending forms
- ✅ **View marks** — See internal marks earned/deducted
- ✅ **Leaderboard** — See weekly ranking among classmates
- ✅ **Fine tracker** — View pending fines

---

## 🛠️ Technology Stack

### Backend
| Technology | Purpose |
|---|---|
| Node.js | Server runtime |
| Express.js | REST API framework |
| MongoDB + Mongoose | Database |
| Google Forms API | Auto-generate & sync Google Forms |
| Twilio | WhatsApp notifications |
| Nodemailer | Email notifications |
| node-cron | Scheduled jobs (reminders, penalties, leaderboard) |
| JWT (jsonwebtoken) | Authentication |
| bcryptjs | Password hashing |
| helmet | Security headers |
| cors | Cross-origin requests |
| dotenv | Environment variables |

### Frontend
| Technology | Purpose |
|---|---|
| React.js | UI framework |
| React Router DOM | Page navigation |
| Axios | API calls |
| canvas-confetti | Celebration animations |

### Deployment
| Service | Purpose |
|---|---|
| Render | Backend hosting |
| Vercel | Frontend hosting |
| MongoDB Atlas | Cloud database |

---

## ⚙️ How It Works

1. **Teacher creates a form** on FormTrack with title, subject, deadline, and questions
2. **FormTrack auto-generates** a real Google Form and saves the link
3. **Students are assigned** the form and receive WhatsApp + email notification
4. **Automatic reminders** are sent 3 days and 1 day before deadline
5. **Google Form responses sync** every 30 seconds to FormTrack
6. **Marks are awarded** for on-time submissions, deducted for late/missed
7. **Weekly leaderboard** is computed every Monday

---

## 🗂️ Project Structure

```
FormTrack/
├── backend/
│   ├── config/          # Google Auth configuration
│   ├── middleware/       # Auth middleware
│   ├── models/          # MongoDB models (User, Form, Submission, Fine)
│   ├── routes/          # API routes
│   ├── utils/           # Scheduler, notification, leaderboard services
│   ├── server.js        # Main server entry point
│   └── .env.example     # Environment variables template
│
└── frontend/
    └── src/
        ├── pages/       # React pages (Dashboard, CreateForm, Leaderboard, etc.)
        ├── components/  # Reusable components
        ├── context/     # Auth context
        └── api.js       # Axios API configuration
```

---

## 🔧 Installation & Setup

### Prerequisites
- Node.js v16+
- MongoDB Atlas account
- Google Cloud Console account (Forms API enabled)
- Twilio account (for WhatsApp)

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Fill in your .env values
npm start
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### Environment Variables (backend `.env`)
```
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
EMAIL_USER=your_gmail_address
EMAIL_PASS=your_gmail_app_password
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=your_redirect_uri
GOOGLE_REFRESH_TOKEN=your_refresh_token
```

---

## 🌐 Live Demo

| Service | URL |
|---|---|
| Frontend | Deployed on Vercel |
| Backend API | Deployed on Render |

---

## 📸 Screenshots

> Teacher Dashboard — View all forms, submission stats, and actions

> Create Form — Auto-generate Google Forms with custom questions

> Student Dashboard — View assigned forms and submission status

> Leaderboard — Weekly student rankings

---

## 📅 Cron Jobs (Automated Tasks)

| Job | Schedule |
|---|---|
| Send reminders | Every 1 minute |
| Apply missed penalties | Daily at midnight |
| Compute leaderboard | Every Monday at 12:01 AM |
| Sync Google Form responses | Every 30 seconds |

---

## 🔒 Security

- Passwords hashed using **bcryptjs**
- API protected with **JWT authentication**
- HTTP headers secured with **helmet**
- Environment variables stored in **`.env`** (never committed to GitHub)

---

## 📄 License

This project was developed as a Final Year Major Project at **K.D.K College of Engineering, Nagpur** for academic purposes.

---

*Made with ❤️ by Pradyumna Kumbhare, Prit Ghorpade, Sujal Harnor & Atharva Markandevar*
