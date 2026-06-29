# Interview AI — Frontend

React + Vite single-page application for the Interview AI platform.

## Tech Stack

- **React 19** with React Router 7
- **Vite 7** for development and builds
- **SCSS** for premium dark-mode styling
- **Axios** for API communication
- **Framer Motion** for animations

## Project Structure

```
src/
├── main.jsx                    # Entry point
├── App.jsx                     # Context providers + RouterProvider
├── app.routes.jsx              # Route definitions
├── style.scss                  # Global styles
├── style/
│   └── button.scss             # Shared button component
└── features/
    ├── auth/                   # Authentication
    │   ├── auth.context.jsx    # Auth state context
    │   ├── auth.form.scss      # Login/Register form styles
    │   ├── components/
    │   │   └── Protected.jsx   # Route guard
    │   ├── hooks/
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   └── Register.jsx
    │   └── services/
    │
    └── interview/              # Interview reports
        ├── interview.context.jsx   # Interview state + error context
        ├── hooks/
        │   └── useInterview.js     # Interview operations hook
        ├── pages/
        │   ├── Home.jsx            # Report generator + recent reports list
        │   └── Interview.jsx       # Report viewer (4-section tabbed nav)
        ├── services/
        │   └── interview.api.js    # Axios API service
        └── style/
            ├── home.scss           # Home page styles
            └── interview.scss      # Report page styles
```

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output: `dist/`

## Configuration

Update the API base URL in `src/features/interview/services/interview.api.js`:

```js
const api = axios.create({
    baseURL: "http://localhost:3000",  // Backend URL
    withCredentials: true,
})
```
