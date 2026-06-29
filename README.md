<p align="center">
  <img src="https://img.shields.io/badge/Interview_AI-Intelligent_Prep-ff2d78?style=for-the-badge&logo=openai&logoColor=white" alt="Interview AI" />
</p>

<h1 align="center">🎯 Interview AI</h1>

<p align="center">
  <strong>AI-powered interview preparation platform that generates personalized technical & behavioral questions, skill gap analysis, and 7-day preparation roadmaps.</strong>
</p>

<p align="center">
  <a href="https://interview-ai-eta-one.vercel.app/">🌐 Live Demo</a> •
  <a href="#-features">Features</a> •
  <a href="#%EF%B8%8F-tech-stack">Tech Stack</a> •
  <a href="#-getting-started">Setup</a> •
  <a href="#-architecture">Architecture</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/Node.js-Express_5-339933?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose_9-47A248?style=flat-square&logo=mongodb" />
  <img src="https://img.shields.io/badge/Gemini-2.0_Flash-4285F4?style=flat-square&logo=google" />
  <img src="https://img.shields.io/badge/OpenAI-GPT_4o_mini-10A37F?style=flat-square&logo=openai" />
  <img src="https://img.shields.io/badge/Vite-7.3-646CFF?style=flat-square&logo=vite" />
</p>

---

## ✨ Features

### 🤖 3-Tier AI Fallback System
The app **never fails** — even when API quotas are exhausted:

| Tier | Provider | When Used |
|------|----------|-----------|
| 🥇 **Tier 1** | Google Gemini (`gemini-2.0-flash`) | Primary — tried first |
| 🥈 **Tier 2** | OpenAI (`gpt-4o-mini`) | Fallback — if Gemini fails |
| 🥉 **Tier 3** | Local Keyword Engine | Last resort — always succeeds |

The **Local Keyword Engine** parses your resume and job description, extracts skills using keyword matching against 40+ technology categories, and generates structured results from a curated database of 60+ technical questions and 15+ behavioral questions.

### 📊 Interview Report Contents
Each report includes:

- **🎯 Match Score** — How well your profile matches the job (0-100%)
- **💻 8 Technical Questions** — Role-specific with difficulty levels (Easy/Medium/Hard) and detailed model answers
- **🗣️ 8 Behavioral Questions** — STAR-format answers covering leadership, teamwork, problem-solving, communication, conflict-resolution, adaptability, ownership, and time-management
- **⚠️ Skill Gap Analysis** — Identified gaps with severity levels, descriptions, and actionable recommendations
- **📅 7-Day Preparation Roadmap** — Daily focus areas with 4-5 specific actionable tasks
- **📄 AI-Optimized Resume PDF** — Downloadable resume tailored to the job description

### 🎨 Premium UI/UX
- Dark glassmorphism design with vibrant accent colors
- Animated loading states with progress indicators
- Copy-to-clipboard on every question/answer for quick study
- AI Provider badge showing which engine generated the report
- Live character counter and file upload feedback
- Responsive design for mobile/tablet/desktop
- Smooth micro-animations and hover effects

---

## 🏗️ Architecture

```
interview-ai-yt/
├── Backend/                    # Express.js REST API
│   ├── server.js               # Entry point (port 3000)
│   ├── .env                    # Environment variables
│   └── src/
│       ├── app.js              # Express app config, CORS, routes
│       ├── config/
│       │   └── database.js     # MongoDB connection
│       ├── controllers/
│       │   ├── auth.controller.js       # Register, Login, Logout, GetMe
│       │   └── interview.controller.js  # Generate report, Get reports, Resume PDF
│       ├── middlewares/
│       │   ├── auth.middleware.js        # JWT authentication
│       │   └── file.middleware.js        # Multer file upload
│       ├── models/
│       │   ├── user.model.js            # User schema
│       │   ├── blacklist.model.js       # Token blacklist schema
│       │   └── interviewReport.model.js # Report schema (with enhanced fields)
│       ├── routes/
│       │   ├── auth.routes.js           # /api/auth/*
│       │   └── interview.routes.js      # /api/interview/*
│       └── services/
│           └── ai.service.js            # 3-tier AI fallback engine (1700+ lines)
│
└── Frontend/                   # React + Vite SPA
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx            # App entry
        ├── App.jsx             # Providers + Router
        ├── app.routes.jsx      # Route definitions
        ├── style.scss          # Global styles
        ├── style/
        │   └── button.scss     # Shared button styles
        └── features/
            ├── auth/           # Authentication feature
            │   ├── auth.context.jsx
            │   ├── auth.form.scss
            │   ├── components/
            │   │   └── Protected.jsx
            │   ├── hooks/
            │   ├── pages/
            │   │   ├── Login.jsx
            │   │   └── Register.jsx
            │   └── services/
            │
            └── interview/      # Interview feature
                ├── interview.context.jsx
                ├── hooks/
                │   └── useInterview.js
                ├── pages/
                │   ├── Home.jsx        # Report generator + recent reports
                │   └── Interview.jsx   # Report viewer (4-section nav)
                ├── services/
                │   └── interview.api.js
                └── style/
                    ├── home.scss
                    └── interview.scss
```

### AI Fallback Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    generateInterviewReport()                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐ │
│  │  Tier 1:     │ ──► │  Tier 2:     │ ──► │  Tier 3:    │ │
│  │  Gemini API  │fail │  OpenAI API  │fail │  Local      │ │
│  │  2.0-flash   │     │  gpt-4o-mini │     │  Engine     │ │
│  └──────┬───────┘     └──────┬───────┘     └──────┬──────┘ │
│         │ success            │ success            │ always  │
│         ▼                    ▼                    ▼         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │           Unified JSON Response                        ││
│  │  { title, matchScore, technicalQuestions,               ││
│  │    behavioralQuestions, skillGaps, preparationPlan,      ││
│  │    aiProvider: "gemini" | "openai" | "local" }          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|-----------|---------|
| **Node.js + Express 5** | REST API server |
| **MongoDB + Mongoose 9** | Database & ODM |
| **@google/generative-ai** | Gemini API integration |
| **openai** | OpenAI GPT integration |
| **JWT + bcryptjs** | Authentication & password hashing |
| **Multer** | Resume PDF upload handling |
| **pdf-parse** | PDF text extraction |
| **Zod** | Input validation |

### Frontend
| Technology | Purpose |
|-----------|---------|
| **React 19** | UI framework |
| **Vite 7** | Build tool & dev server |
| **React Router 7** | Client-side routing |
| **Axios** | HTTP client |
| **SCSS** | Premium styling |
| **Framer Motion** | Animations |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ 
- **MongoDB** Atlas account (or local instance)
- **Gemini API Key** — [Get one free](https://aistudio.google.com/apikey)
- **OpenAI API Key** *(optional)* — [Get one here](https://platform.openai.com/api-keys)

### 1. Clone the Repository

```bash
git clone https://github.com/Aditya-dxt/interview-ai.git
cd interview-ai
```

### 2. Backend Setup

```bash
cd Backend
npm install
```

Create/update the `.env` file:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/interview-ai
JWT_SECRET=your_secure_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key    # Optional — local fallback works without it
```

Start the backend:

```bash
npm run dev
```

The server runs on `http://localhost:3000`.

### 3. Frontend Setup

```bash
cd Frontend
npm install
```

> **Note**: Update the API base URL in `src/features/interview/services/interview.api.js` if running locally:
> ```js
> const api = axios.create({
>     baseURL: "http://localhost:3000",  // Change to your backend URL
>     withCredentials: true,
> })
> ```

Start the frontend:

```bash
npm run dev
```

The app runs on `http://localhost:5173`.

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| `POST` | `/api/auth/register` | Register new user | Public |
| `POST` | `/api/auth/login` | Login | Public |
| `POST` | `/api/auth/logout` | Logout (blacklists token) | Public |
| `GET`  | `/api/auth/me` | Get current user | Private |

### Interview Reports

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| `POST` | `/api/interview/` | Generate new interview report | Private |
| `GET`  | `/api/interview/` | Get all reports for user | Private |
| `GET`  | `/api/interview/report/:id` | Get specific report | Private |
| `POST` | `/api/interview/resume/pdf/:id` | Generate resume PDF | Private |

### Generate Report — Request Body

```
Content-Type: multipart/form-data

Fields:
- jobDescription (string, required) — Full job description text
- selfDescription (string, optional) — Brief self-introduction
- resume (file, optional) — PDF resume upload
```

### Generate Report — Response

```json
{
  "message": "Interview report generated successfully.",
  "interviewReport": {
    "_id": "...",
    "title": "Senior Frontend Developer",
    "matchScore": 78,
    "aiProvider": "gemini",
    "technicalQuestions": [
      {
        "question": "Explain React's reconciliation algorithm...",
        "intention": "Tests deep understanding of React rendering...",
        "answer": "React's reconciliation algorithm compares...",
        "difficulty": "hard"
      }
    ],
    "behavioralQuestions": [
      {
        "question": "Tell me about a time you led a project...",
        "intention": "Assesses leadership and project management...",
        "answer": "Situation: Our team was tasked with...",
        "category": "leadership"
      }
    ],
    "skillGaps": [
      {
        "skill": "TypeScript",
        "severity": "high",
        "description": "TypeScript is essential for type-safe development...",
        "recommendation": "Complete the official TypeScript handbook..."
      }
    ],
    "preparationPlan": [
      {
        "day": 1,
        "focus": "Fundamentals Review",
        "tasks": ["Review core JavaScript concepts...", "..."]
      }
    ]
  }
}
```

---

## 🧠 Local Fallback Engine

When both AI APIs fail, the local engine kicks in. Here's how it works:

### Skill Database Coverage (40+ technologies)

| Category | Skills |
|----------|--------|
| **Frontend** | JavaScript, TypeScript, React, Angular, Vue, HTML/CSS, Tailwind, Next.js |
| **Backend** | Node.js, Express, Python, Django, Flask, Java, Spring, Go, Rust |
| **Database** | SQL, PostgreSQL, MongoDB, Redis |
| **DevOps** | Docker, Kubernetes, CI/CD, Git, Linux, DevOps |
| **Cloud** | AWS, Azure, GCP |
| **Architecture** | REST API, GraphQL, Microservices, System Design |
| **CS Fundamentals** | Data Structures, Algorithms |
| **AI/ML** | Machine Learning |
| **Mobile** | React Native, Flutter |
| **Quality** | Testing, Jest, Performance, Accessibility, Security |
| **Process** | Agile/Scrum |

### How Matching Works

1. **Extract skills** from the job description using case-insensitive keyword matching
2. **Detect role level** (junior/mid/senior) from level keywords
3. **Match candidate skills** from resume text and self-description
4. **Calculate score**: `(matched / required) × 100`, clamped to 35-95%
5. **Select questions** from matched skill categories, fill remaining with general CS questions
6. **Identify gaps** as skills in JD but missing from resume
7. **Generate roadmap** based on detected skills and gaps

---

## 🚢 Deployment

### Backend (Render)

1. Create a new **Web Service** on [Render](https://render.com)
2. Connect your GitHub repository
3. Set:
   - **Root Directory**: `Backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add environment variables (MONGO_URI, JWT_SECRET, GEMINI_API_KEY, OPENAI_API_KEY)

### Frontend (Vercel)

1. Import project on [Vercel](https://vercel.com)
2. Set:
   - **Root Directory**: `Frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Update CORS origin in `Backend/src/app.js` to match your Vercel domain

---

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Secret for JWT token signing |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key (primary AI) |
| `OPENAI_API_KEY` | ❌ | OpenAI API key (fallback AI — local engine works without it) |
| `PORT` | ❌ | Server port (defaults to 3000) |

---

## 📄 License

This project is licensed under the ISC License.

---

## 👤 Author

**Aditya** — [@Aditya-dxt](https://github.com/Aditya-dxt)

---

<p align="center">
  <strong>Built with ❤️ for interview preparation</strong>
</p>
