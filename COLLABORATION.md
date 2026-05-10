# Developer Collaboration Guide for MnemoniX

Welcome! This guide explains how to set up the project and collaborate with the team.

## 1. Project Overview
MnemoniX is a full-stack vocabulary learning app using:
- **Frontend**: React + Vite + Tailwind CSS + Framer Motion.
- **Backend**: Express.js (handling Payme webhooks and serving the SPA).
- **Database**: Supabase (Auth, Firestore-like data storage, and Storage buckets).
- **AI**: Google Gemini (Flash 2.5/3.0) for mnemonic generation, image creation, and TTS.

## 2. Setting Up Your Environment
To run this project locally, you need to set up your environment variables.

1.  **Clone the Repository**:
    ```bash
    git clone <your-github-repo-url>
    cd mnemonix
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Environment Variables**:
    Create a `.env` file in the root based on `.env.example`. You will need:
    - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Get from Supabase Dashboard).
    - `SUPABASE_SERVICE_ROLE_KEY` (Required for server-side premium activation).
    - `VITE_GEMINI_API_KEYS` (A comma-separated list of Google AI Studio API keys).
    - `PAYME_KEY` (Your Payme Test/Production secret key).

## 3. Collaboration Flow (GitHub)
We use a standard Git workflow:
- **Main Branch**: Production-ready code.
- **Feature Branches**: Create a new branch for every update (`git checkout -b feature/new-logic`).
- **Pull Requests**: Submit a PR to `main` for review before merging.

### Syncing Changes
To ensure we both see each other's changes:
1.  **Always pull** before starting work: `git pull origin main`.
2.  **Push regularly**: After completing a logic update, push your branch.

## 4. Key Logic Blocks
- **/src/App.tsx**: Main state, navigation, and the `handleSearch` generation engine.
- **/server.ts**: Backend entry point. Handles **Payme Webhooks** for payment verification.
- **/src/services/geminiService.ts**: All AI prompts and API interaction logic.
- **/src/services/supabase.ts**: Database client and storage helpers.

## 5. Sharing the Database
The project relies on a shared Supabase instance. 
1.  Go to **Supabase Dashboard** -> **Settings** -> **Team**.
2.  Invite the new developer to the project so they can see the Tables and Logs.

## 6. How to Share via AI Studio
If you are working inside Google AI Studio:
1.  Go to **Settings** (Gear icon).
2.  Use the **Export to GitHub** feature to link this project to a repository.
3.  Add the new developer as a **Collaborator** on that GitHub repository.
4.  Once they have the code, they can either run it locally or import it into their own AI Studio workspace.
