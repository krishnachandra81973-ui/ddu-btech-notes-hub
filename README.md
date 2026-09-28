# DDU B.Tech Notes Hub

**Complete B.Tech Notes & Study Material Portal for Deen Dayal Upadhyaya Gorakhpur University (DDU), Gorakhpur.**

*Developed by: **KESHAV NARAYAN**, B.Tech CSE (AI/ML)*

---

## 🌟 Overview

**DDU B.Tech Notes Hub** is a modern, responsive, academic web application and study portal engineered specifically for B.Tech students across all semesters and engineering branches (CSE, IT, ECE, EE, ME, Civil) of DDU Gorakhpur University.

The platform provides:
1. **Semester-Wise Notes**: Dedicated pages for all 8 semesters with subject code, syllabus scope, Unit 1 to Unit 5 module lecture notes, and direct in-browser PDF previewing or downloading.
2. **Official Syllabus Portal**: Semester & subject syllabus files with verification guidelines.
3. **Previous Year Papers (PYQs)**: Filter question papers by Semester, Subject, Branch, and Exam Year (2022 to 2025).
4. **Daily Updates & Campus Notices**: Circulars, exam timetables, admit card announcements, syllabus updates, and result links with Important badges.
5. **Student Authentication & Dashboard**: Personal student portal with 1-click note bookmarking (favorites), recently viewed notes history, and personalized quick links.
6. **Secure Admin Portal (`/admin` / `#admin`)**: Complete role-based content management system (CMS) allowing administrators to add, edit, or delete notes, subjects, syllabus files, PYQs, daily updates, and student accounts without touching source code!
7. **Cloud / Secure File Upload System**: Direct multipart upload handler for PDF, JPG, PNG, and WEBP files with cryptographic hashing and size limits.
8. **Global Search**: Modal search (Ctrl+K / Cmd+K) across subjects, notes, units, PYQs, and notices.
9. **Dark & Light Mode**: Seamless theme switching with system detection and persistence.

---

## 🚀 Quick Start

Run the startup script:

```bash
cd /home/keshavnarayan501/.gemini/antigravity/scratch/ddu-notes-hub
./run.sh
```

Or start directly with Python:

```bash
python3 server.py
```

Open your browser at:
- **Student Portal**: [http://localhost:8000](http://localhost:8000)
- **Student Dashboard**: [http://localhost:8000/#dashboard](http://localhost:8000/#dashboard)
- **Admin Portal**: [http://localhost:8000/#admin](http://localhost:8000/#admin)

---

## 🔐 Administrator Configuration

Configure administrator credentials and secrets securely using environment variables before running in production:

```bash
export ADMIN_EMAIL="admin@ddunotes.ac.in"
export ADMIN_PASSWORD="<Your-Strong-Random-Password>"
export DDU_PORTAL_SECRET="<Your-Cryptographic-Secret-Key>"
```

> **Security Notice:** Never commit administrative passwords, API keys, or live SQLite database files to public version control.

---

## 🏗️ Project Architecture

```
ddu-notes-hub/
├── server.py              # Multithreaded Python server, REST API, authentication middleware, file uploads
├── database.py            # SQLite database schema, WAL mode, foreign keys, PBKDF2 hashing, CRUD queries
├── seed_data.py           # Curriculum seeder for Semesters 1, 2, 3 + PDF generator for all study materials
├── run.sh                 # One-click startup and initialization script
├── README.md              # Technical and user documentation
└── static/
    ├── index.html         # Single Page Application shell, SEO tags, semantic HTML5, modals
    ├── css/
    │   └── style.css      # Academic design system, light/dark mode, glassmorphism, responsive tables
    ├── js/
    │   ├── app.js         # Core router (#hash), global search, theme switcher, PDF viewer modal
    │   ├── auth.js        # Authentication client, session management, role verification, auth modals
    │   ├── dashboard.js   # Student dashboard controller, bookmarks, recent history
    │   └── admin.js       # Admin portal controller, KPI stats, CRUD data management, file manager
    └── uploads/           # PDF documents and media files (auto-generated sample PDFs included)
```

---

## 🛡️ Security Features

- **PBKDF2 Password Hashing**: Passwords are never stored in plain text. Hashed using `PBKDF2-HMAC-SHA256` with unique 16-byte random salts and 100,000 iterations.
- **Role-Based Access Control (RBAC)**: Strict role checks for `ADMIN` vs `STUDENT`. All `/api/admin/*` routes reject unauthorized requests with HTTP 403 Forbidden.
- **Secure File Uploads**: Validates file types (`.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`), MIME types, and 25MB file size limits. Files are saved with randomized unique tokens to prevent path traversal or filename collision.
- **Data Protection**: User passwords and salts are never returned in client JSON responses.

---

## ⚖️ Disclaimer

*This website is an independent educational resource created for students and is not an official website of Deen Dayal Upadhyaya Gorakhpur University unless explicitly stated. Official university documents should be used only when verified.*
