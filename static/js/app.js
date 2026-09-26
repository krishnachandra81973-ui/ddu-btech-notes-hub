/**
 * DDU B.Tech Notes Hub - Main Application Controller & Router
 */

const App = {
  theme: localStorage.getItem("ddu_theme") || "light",
  currentRoute: "home",
  searchTimeout: null,

  async init() {
    this.initTheme();
    await Auth.init();

    // Setup global listeners
    window.addEventListener("hashchange", () => this.handleRouting());
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        this.openSearchModal();
      }
      if (e.key === "Escape") {
        this.closeAllModals();
      }
    });

    // Handle form submissions for Auth Modal
    this.setupAuthForms();

    // Initial Route
    this.handleRouting();
  },

  // ------------------- Theme Management -------------------
  initTheme() {
    if (this.theme === "dark" || (!localStorage.getItem("ddu_theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.setAttribute("data-theme", "dark");
      this.theme = "dark";
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      this.theme = "light";
    }
    this.updateThemeButton();
  },

  toggleTheme() {
    this.theme = this.theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", this.theme);
    localStorage.setItem("ddu_theme", this.theme);
    this.updateThemeButton();
  },

  updateThemeButton() {
    const btn = document.getElementById("theme-toggle-btn");
    if (btn) {
      btn.innerHTML = this.theme === "dark" 
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
  },

  // ------------------- Toast System -------------------
  toast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";
    toast.innerHTML = `<span style="font-weight: 800;">${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // ------------------- Safe Fetch with Static DDU Data Fallback -------------------
  async safeFetch(url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("API offline, falling back to static cache:", url);
    }
    if (window.DDU_DATA) {
      if (url.includes("/api/updates")) {
        const cat = url.includes("category=") ? decodeURIComponent(url.split("category=")[1].split("&")[0]) : null;
        let updates = window.DDU_DATA.daily_updates || [];
        if (cat && cat !== "All") updates = updates.filter(u => u.category === cat);
        return { updates };
      }
      if (url.includes("/api/subjects?semester_id=")) {
        const semId = parseInt(url.split("semester_id=")[1].split("&")[0]);
        return { subjects: (window.DDU_DATA.subjects || []).filter(s => s.semester_id === semId) };
      }
      if (url.includes("/api/subjects/")) {
        const subId = parseInt(url.split("/api/subjects/")[1].split("?")[0]);
        const sub = (window.DDU_DATA.subjects || []).find(s => s.id === subId);
        if (sub) {
          const units = (window.DDU_DATA.units || []).filter(u => u.subject_id === subId);
          return { subject: { ...sub, units } };
        }
      }
      if (url.includes("/api/syllabus")) {
        const semId = url.includes("semester_id=") ? parseInt(url.split("semester_id=")[1].split("&")[0]) : null;
        let syl = window.DDU_DATA.syllabus || [];
        if (semId) syl = syl.filter(s => s.semester_id === semId);
        return { syllabus: syl };
      }
      if (url.includes("/api/notes")) {
        const semId = url.includes("semester_id=") ? parseInt(url.split("semester_id=")[1].split("&")[0]) : null;
        const subId = url.includes("subject_id=") ? parseInt(url.split("subject_id=")[1].split("&")[0]) : null;
        let notes = window.DDU_DATA.notes || [];
        if (semId) notes = notes.filter(n => n.semester_id === semId);
        if (subId) notes = notes.filter(n => n.subject_id === subId);
        return { notes };
      }
      if (url.includes("/api/pyqs")) {
        const semId = url.includes("semester_id=") ? parseInt(url.split("semester_id=")[1].split("&")[0]) : null;
        const subId = url.includes("subject_id=") ? parseInt(url.split("subject_id=")[1].split("&")[0]) : null;
        const year = url.includes("year=") ? parseInt(url.split("year=")[1].split("&")[0]) : null;
        let pyqs = window.DDU_DATA.pyqs || [];
        if (semId) pyqs = pyqs.filter(p => p.semester_id === semId);
        if (subId) pyqs = pyqs.filter(p => p.subject_id === subId);
        if (year) pyqs = pyqs.filter(p => p.exam_year === year);
        return { pyqs };
      }
            if (url.includes("/api/search?q=")) {
        const query = decodeURIComponent(url.split("q=")[1].split("&")[0]).toLowerCase();
        const subjects = (window.DDU_DATA.subjects || []).filter(s => s.name.toLowerCase().includes(query) || s.code.toLowerCase().includes(query));
        const notes = (window.DDU_DATA.notes || []).filter(n => n.title.toLowerCase().includes(query) || (n.subject_name && n.subject_name.toLowerCase().includes(query)));
        const pyqs = (window.DDU_DATA.pyqs || []).filter(p => p.paper_title.toLowerCase().includes(query) || (p.subject_name && p.subject_name.toLowerCase().includes(query)));
        return { subjects, notes, pyqs };
      }
      if (url.includes("/api/semesters")) {
        return { semesters: window.DDU_DATA.semesters || [] };
      }
    }
    return {};
  },

  // ------------------- Router -------------------
  handleRouting() {
    const hash = window.location.hash.slice(1) || "home";
    const container = document.getElementById("main-content");
    if (!container) return;

    // Update active navbar state
    document.querySelectorAll(".nav-item").forEach(item => {
      const link = item.querySelector("a");
      if (link && link.getAttribute("href") === `#${hash.split('/')[0]}`) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (hash === "home") {
      this.renderHome(container);
    } else if (hash === "semesters") {
      this.renderSemesters(container);
    } else if (hash.startsWith("semester/")) {
      const semId = hash.split("/")[1];
      this.renderSemesterDetail(container, parseInt(semId));
    } else if (hash === "syllabus") {
      this.renderSyllabus(container);
    } else if (hash === "notes") {
      this.renderNotes(container);
    } else if (hash === "pyq") {
      this.renderPyq(container);
    } else if (hash === "updates") {
      this.renderUpdates(container);
    } else if (hash === "about") {
      this.renderAbout(container);
    } else if (hash === "dashboard") {
      Dashboard.render(container);
    } else if (hash === "admin") {
      window.location.href = "/admin";
    } else {
      this.renderHome(container);
    }
  },

  // ------------------- 1. Home View -------------------
  async renderHome(container) {
    container.innerHTML = `
      <!-- Hero Section -->
      <section class="hero-section">
        <div class="container">
          <div class="hero-grid-layout">
            <!-- Left: Hero Text & Actions -->
            <div class="hero-content-col">
              <div class="hero-badge">
                <span>🏛️</span> NAAC "A++" Accredited State University • Department of CSE & Engineering
              </div>
              <h1 class="hero-title">
                DDU B.Tech <span>Notes Hub</span>
              </h1>
              <div class="hero-subtitle">
                "The Complete Academic & Study Material Ecosystem for DDU Gorakhpur University Engineers"
              </div>
              <p class="hero-text">
                Direct access to semester-wise verified lecture notes, official NEP 2020 syllabus curricula, 5-year previous examination papers (2021–2025), and instant university examination circulars.
              </p>
              <div class="hero-buttons">
                <a href="#notes" class="btn-primary" style="padding: 12px 22px; font-size: 0.95rem;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                  Explore All Notes
                </a>
                <a href="#syllabus" class="btn-secondary" style="padding: 12px 22px; font-size: 0.95rem;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  Official CBCS Syllabus
                </a>
                <a href="#pyq" class="btn-secondary" style="padding: 12px 22px; font-size: 0.95rem;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  5-Year PYQs (2021-25)
                </a>
                <a href="#about" class="btn-secondary" style="padding: 12px 22px; font-size: 0.95rem; border-color: rgba(217, 119, 6, 0.4); color: var(--text-main);">
                  👨‍💻 Meet the Architect
                </a>
              </div>
            </div>

            <!-- Right: Prominent Large University Emblem Showcase -->
            <div class="hero-emblem-col">
              <div class="hero-emblem-card">
                <div class="hero-emblem-glow"></div>
                <div class="hero-emblem-ring">
                  <img src="/static/ddu_official_logo.png" alt="Deen Dayal Upadhyaya Gorakhpur University Official Crest" class="hero-emblem-img">
                </div>
                <div class="hero-emblem-info">
                  <div class="hero-emblem-title">दीनदयाल उपाध्याय गोरखपुर विश्वविद्यालय</div>
                  <div class="hero-emblem-sub">Deen Dayal Upadhyaya Gorakhpur University</div>
                  <div class="hero-emblem-pills">
                    <span class="hero-pill-gold">🏛️ Estd. 1957</span>
                    <span class="hero-pill-green">✓ NAAC "A++" Grade</span>
                    <span class="hero-pill-blue">Faculty of Engineering</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Statistics Counters -->
          <div class="stats-grid" id="home-stats-container">
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(30, 64, 175, 0.15); color: var(--primary);">🎓</div>
              <div>
                <div class="stat-value">8 / 8</div>
                <div class="stat-label">B.Tech Semesters</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(14, 165, 233, 0.15); color: var(--accent);">📚</div>
              <div>
                <div class="stat-value">28</div>
                <div class="stat-label">Core & Elective Courses</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);">📝</div>
              <div>
                <div class="stat-value">176+</div>
                <div class="stat-label">Unit 1–5 Lecture Notes</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber);">📄</div>
              <div>
                <div class="stat-value">140+</div>
                <div class="stat-label">PYQ Papers (2021-2025)</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(239, 68, 68, 0.15); color: var(--accent-rose);">🏛️</div>
              <div>
                <div class="stat-value">100%</div>
                <div class="stat-label">Free Student Access</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Official DDU CBCS Curriculum Repository Section -->
      <section style="padding: 50px 0 30px;">
        <div class="container">
          <div class="section-header">
            <span class="section-tag" style="background: rgba(217, 119, 6, 0.12); color: #d97706; border: 1px solid rgba(217, 119, 6, 0.3);">🏛️ Official DDUGU Curriculum</span>
            <h2 class="section-title">Official B.Tech CBCS Syllabus Repository</h2>
            <p class="section-description">
              Verified syllabus documents issued by Faculty of Engineering & Technology, Deen Dayal Upadhyaya Gorakhpur University (Session 2024–2026).
            </p>
          </div>

          <div class="official-syllabus-grid">
            <div class="official-syllabus-card">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <span style="font-size: 0.72rem; font-weight: 800; background: var(--primary-light); color: var(--primary); padding: 3px 8px; border-radius: 4px;">4-YEAR B.TECH CSE</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">1.95 MB PDF</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
                  B.Tech Computer Science & Engineering (Session 2024-25)
                </h3>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
                  Comprehensive 4-year degree scheme covering complete semester credits, course learning objectives, contact hours, and recommended textbooks.
                </p>
              </div>
              <div style="display: flex; gap: 10px; margin-top: auto;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_cse_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech CSE Structure & Syllabus 2024-25')" class="btn-primary btn-sm" style="flex: 1;">
                  👁️ Read Online
                </button>
                <a href="/static/uploads/ddu_official_btech_cse_structure_syllabus_2024_25.pdf" download class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </a>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #0284c7;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <span style="font-size: 0.72rem; font-weight: 800; background: rgba(14, 165, 233, 0.15); color: var(--accent); padding: 3px 8px; border-radius: 4px;">SPECIALIZATION</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">1.72 MB PDF</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
                  B.Tech CSE with Artificial Intelligence & Machine Learning (AIML)
                </h3>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
                  Specialized curriculum covering Neural Networks, Deep Learning, Natural Language Processing, Computer Vision, and applied AI labs aligned with NEP 2020.
                </p>
              </div>
              <div style="display: flex; gap: 10px; margin-top: auto;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_cse_aiml_syllabus.pdf', 'Official DDU B.Tech CSE (AIML) Syllabus')" class="btn-primary btn-sm" style="flex: 1;">
                  👁️ Read Online
                </button>
                <a href="/static/uploads/ddu_official_btech_cse_aiml_syllabus.pdf" download class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </a>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #10b981;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <span style="font-size: 0.72rem; font-weight: 800; background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); padding: 3px 8px; border-radius: 4px;">DATA SCIENCE</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">1.73 MB PDF</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
                  B.Tech CSE (Artificial Intelligence & Data Science - AI & DS)
                </h3>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
                  Advanced degree framework focusing on Big Data Engineering, Statistical Machine Learning, Cloud Analytics, and Predictive Modeling pipelines.
                </p>
              </div>
              <div style="display: flex; gap: 10px; margin-top: auto;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_cse_aids_syllabus.pdf', 'Official DDU B.Tech CSE (AI & DS) Syllabus')" class="btn-primary btn-sm" style="flex: 1;">
                  👁️ Read Online
                </button>
                <a href="/static/uploads/ddu_official_btech_cse_aids_syllabus.pdf" download class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </a>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #d97706;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <span style="font-size: 0.72rem; font-weight: 800; background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); padding: 3px 8px; border-radius: 4px;">POSTGRADUATE</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">1.07 MB PDF</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
                  M.Tech Computer Science & Engineering (CBCS)
                </h3>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
                  Postgraduate curriculum offering High-Performance Computing, Distributed Systems, Advanced Research Methodologies, and Thesis work.
                </p>
              </div>
              <div style="display: flex; gap: 10px; margin-top: auto;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_mtech_cse_syllabus.pdf', 'Official DDU M.Tech CSE Syllabus')" class="btn-primary btn-sm" style="flex: 1;">
                  👁️ Read Online
                </button>
                <a href="/static/uploads/ddu_official_mtech_cse_syllabus.pdf" download class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Department of Computer Science & Engineering Showcase -->
      <section style="padding: 20px 0 40px;">
        <div class="container">
          <div class="dept-showcase-box">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 20px;">
              <div>
                <span class="section-tag" style="background: var(--primary-light); color: var(--primary);">Faculty of Engineering & Technology</span>
                <h2 style="font-size: 1.85rem; font-weight: 800; color: var(--text-main); margin: 6px 0;">
                  Department of Computer Science & Engineering (DOCSE)
                </h2>
                <p style="font-size: 0.92rem; color: var(--text-muted); max-width: 720px;">
                  Institute of Engineering & Technology (IET), Deen Dayal Upadhyaya Gorakhpur University, Civil Lines, Gorakhpur.
                </p>
              </div>
              <a href="https://ddugu.ac.in/department/DOCSE" target="_blank" rel="noopener noreferrer" class="btn-secondary btn-sm">
                Official University Page ↗
              </a>
            </div>

            <p style="font-size: 0.92rem; color: var(--text-muted); line-height: 1.8; margin-bottom: 20px;">
              Established with campus teaching in 2021, the Department of Computer Science and Engineering has rapidly evolved into an epicenter of technical excellence. With an annual intake expanded to <strong>150+ students</strong>, the department offers specialized undergraduate B.Tech programs in <strong>Artificial Intelligence & Machine Learning (AI/ML)</strong> and <strong>AI & Data Science (AI & DS)</strong> in line with the National Education Policy (NEP) 2020.
            </p>

            <div class="dept-stats-row">
              <div class="dept-stat-pill">
                <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">150+</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600; margin-top: 4px;">Annual Intake Capacity</div>
              </div>
              <div class="dept-stat-pill">
                <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent-emerald);">300+</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600; margin-top: 4px;">Samsung Innovation Scholars</div>
              </div>
              <div class="dept-stat-pill">
                <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent-amber);">AIR 120</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600; margin-top: 4px;">Top GATE 2025 Rank</div>
              </div>
              <div class="dept-stat-pill">
                <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent);">34</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600; margin-top: 4px;">NPTEL Elective Tracks</div>
              </div>
            </div>

            <!-- Specialized Labs -->
            <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-top: 24px;">Advanced Research & Instructional Laboratories:</h4>
            <div class="lab-grid">
              <div class="lab-card">
                <div style="font-size: 1.3rem; margin-bottom: 6px;">🤖</div>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); margin-bottom: 4px;">AI & Machine Learning Lab</div>
                <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">GPU clusters for neural network training, computer vision algorithms, and NLP model implementation.</p>
              </div>
              <div class="lab-card">
                <div style="font-size: 1.3rem; margin-bottom: 6px;">☁️</div>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); margin-bottom: 4px;">Cloud Computing & IoT Lab</div>
                <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">IoT sensor kits, microcontroller hardware, and distributed cloud computing instances.</p>
              </div>
              <div class="lab-card">
                <div style="font-size: 1.3rem; margin-bottom: 6px;">📊</div>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); margin-bottom: 4px;">Big Data & Data Science Lab</div>
                <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">Hadoop/Spark analytical suites, predictive algorithms, and statistical modeling workstations.</p>
              </div>
              <div class="lab-card">
                <div style="font-size: 1.3rem; margin-bottom: 6px;">🛡️</div>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); margin-bottom: 4px;">Cyber Security & Forensics Lab</div>
                <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">Ethical hacking sandboxes, network packet visualizers, cryptographic analysis, and digital forensics.</p>
              </div>
            </div>

            <!-- Samsung Innovation Campus Highlight -->
            <div style="margin-top: 24px; padding: 18px; background: rgba(30, 64, 175, 0.05); border: 1px solid rgba(30, 64, 175, 0.15); border-radius: var(--radius-md); display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div style="font-size: 2rem;">🏆</div>
              <div style="flex: 1;">
                <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-main);">Samsung Innovation Campus (SIC) Partnership</div>
                <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
                  Ceremony graced by Hon'ble Chief Minister Yogi Adityanath Ji and Samsung CEO. Over 300 DDU engineering students trained in AI, Big Data, Coding, and IoT. Top achiever Mr. Amit Maurya was awarded ₹1 Lakh cash prize and a laptop by Samsung India.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Choose Your Semester Section -->
      <section style="padding: 20px 0 60px;">
        <div class="container">
          <div class="section-header">
            <span class="section-tag">Direct Curriculum Access</span>
            <h2 class="section-title">Choose Your Semester</h2>
            <p class="section-description">
              Select your academic semester to view all subjects, unit-wise notes, download PDFs, and practice questions.
            </p>
          </div>

          <div class="semester-grid" id="home-semester-grid">
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(sem => `
              <div class="semester-card">
                <div>
                  <div class="semester-badge">Year ${Math.ceil(sem / 2)} • B.Tech</div>
                  <h3 class="semester-card-title">${sem === 1 ? '1st' : sem === 2 ? '2nd' : sem === 3 ? '3rd' : `${sem}th`} Semester</h3>
                  <p class="semester-card-desc">
                    ${sem === 1 ? 'Applied Mathematics, Engineering Physics, C Programming & Basics.' :
                      sem === 2 ? 'Data Structures in C, Mathematics-II, Engineering Chemistry & CAD.' :
                      sem === 3 ? 'Discrete Mathematics, COA, Object Oriented Programming & Digital Logic.' :
                      sem === 4 ? 'Operating Systems, Automata Theory, Microprocessors & Software Engineering.' :
                      sem === 5 ? 'DBMS, Design & Analysis of Algorithms, Web Technologies & Electives.' :
                      sem === 6 ? 'Compiler Design, Computer Networks, Distributed Computing & Practicals.' :
                      sem === 7 ? 'Artificial Intelligence, Machine Learning, Cloud Systems & Seminars.' :
                      'Major Capstone Project, Cyber Security, Deep Learning & Viva Voce.'}
                  </p>
                </div>
                <div>
                  <div class="semester-meta">
                    <span>${sem <= 3 ? '5 Subjects • 25 Units' : 'Core Syllabus Available'}</span>
                    <span style="color: var(--primary); font-weight: 700;">Explore →</span>
                  </div>
                  <a href="#semester/${sem}" class="btn-primary btn-sm" style="width: 100%; margin-top: 14px;">
                    Open ${sem === 1 ? '1st' : sem === 2 ? '2nd' : sem === 3 ? '3rd' : `${sem}th`} Semester
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- Featured Developer Showcase Banner on Home Page -->
      <section style="padding: 20px 0 60px;">
        <div class="container">
          <div style="background: linear-gradient(135deg, rgba(30, 64, 175, 0.06), rgba(14, 165, 233, 0.05), rgba(245, 158, 11, 0.04)); border: 1.5px solid var(--border); border-radius: var(--radius-lg); padding: 36px; box-shadow: var(--shadow-md); position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #1e40af, #0284c7, #f59e0b);"></div>
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 24px;">
              <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                <div class="dev-photo-ring" style="width: 82px; height: 82px;">
                  <div class="dev-photo-inner" style="font-size: 1.8rem;">KN</div>
                  <div class="dev-badge-verified">✓</div>
                </div>
                <div>
                  <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: var(--primary); letter-spacing: 0.5px;">Architect & Full-Stack Developer</div>
                  <h3 style="font-size: 1.5rem; font-weight: 800; color: var(--text-main); margin: 2px 0;">KESHAV NARAYAN</h3>
                  <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">
                    B.Tech Computer Science & Engineering (Specialization: AI & ML) • DDU Gorakhpur University
                  </div>
                  <p style="font-size: 0.84rem; color: var(--text-muted); max-width: 650px; margin-top: 6px; line-height: 1.5;">
                    "Engineered to empower every B.Tech student with free, instantaneous access to verified academic resources, previous year question archives, and university updates."
                  </p>
                </div>
              </div>
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <a href="#about" class="btn-primary" style="padding: 10px 20px; font-size: 0.88rem;">
                  📖 Read Full Biography & Vision
                </a>
                <button onclick="App.openFeedbackModal()" class="btn-secondary" style="padding: 10px 20px; font-size: 0.88rem;">
                  ✉️ Message / Request Notes
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Latest Daily Updates Teaser -->
      <section style="padding: 20px 0 60px; background: var(--bg-card); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
        <div class="container">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 30px; flex-wrap: wrap; gap: 14px;">
            <div>
              <span class="section-tag">University Circulars</span>
              <h2 class="section-title" style="margin-bottom: 4px; font-size: 1.8rem;">Daily Academic Updates</h2>
              <p style="color: var(--text-muted); font-size: 0.9rem;">Real-time notices, exam timetables, admit cards, and results.</p>
            </div>
            <a href="#updates" class="btn-secondary">
              View All Updates →
            </a>
          </div>

          <div id="home-updates-list" class="updates-card-list">
            <p style="color: var(--text-muted);">Loading latest updates...</p>
          </div>
        </div>
      </section>
    `;

    // Fetch and display latest updates
    try {
      const data = await this.safeFetch("/api/updates");
      const updates = (data.updates || []).slice(0, 3);
      const listEl = document.getElementById("home-updates-list");
      if (listEl) {
        if (updates.length === 0) {
          listEl.innerHTML = `<p style="color: var(--text-muted);">No recent updates posted.</p>`;
        } else {
          listEl.innerHTML = updates.map(u => {
            const dateObj = new Date(u.publish_date);
            const day = dateObj.getDate() || "26";
            const month = dateObj.toLocaleString("en", { month: "short" }) || "SEP";
            return `
              <div class="update-item ${u.is_important ? 'important' : ''}">
                <div class="update-date-badge">
                  <div class="update-date-day">${day}</div>
                  <div class="update-date-month">${month}</div>
                </div>
                <div class="update-content">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span class="update-category">${escapeHtml(u.category)}</span>
                    ${u.is_important ? `<span class="update-badge-important">Important</span>` : ''}
                  </div>
                  <h3 class="update-title">${escapeHtml(u.title)}</h3>
                  <p class="update-desc">${escapeHtml(u.short_description)}</p>
                  <div style="display: flex; gap: 10px; align-items: center; margin-top: 8px;">
                    ${u.attachment_url ? `
                      <button onclick="App.openPdfViewer('${u.attachment_url}', '${escapeHtml(u.title)}')" class="btn-secondary btn-sm" style="padding: 4px 10px; font-size: 0.78rem;">
                        📄 View Attachment
                      </button>
                    ` : ''}
                    <a href="#updates" style="font-size: 0.8rem; color: var(--primary); font-weight: 600;">Read Full Notice →</a>
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    } catch (e) {}
  },

  // ------------------- 2. Semesters Overview -------------------
  renderSemesters(container) {
    container.innerHTML = `
      <div class="container" style="padding: 50px 20px 80px;">
        <div class="section-header">
          <span class="section-tag">Academic Architecture</span>
          <h1 class="section-title">B.Tech Semesters</h1>
          <p class="section-description">
            Complete four-year degree curriculum for B.Tech students of Deen Dayal Upadhyaya Gorakhpur University.
          </p>
        </div>

        <div class="semester-grid">
          ${[1, 2, 3, 4, 5, 6, 7, 8].map(s => `
            <div class="semester-card">
              <div>
                <div class="semester-badge">Semester ${s}</div>
                <h3 class="semester-card-title">${s === 1 ? '1st' : s === 2 ? '2nd' : s === 3 ? '3rd' : `${s}th`} Semester B.Tech</h3>
                <p class="semester-card-desc">
                  Curated study notes, Unit 1 to Unit 5 syllabi, previous year question papers, and high-frequency university exam derivations.
                </p>
              </div>
              <div>
                <a href="#semester/${s}" class="btn-primary" style="width: 100%; display: flex; justify-content: center;">
                  Open Semester ${s} Notes
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ------------------- 3. Dedicated Semester Page -------------------
  async renderSemesterDetail(container, semNumber) {
    container.innerHTML = `
      <div class="container" style="padding: 40px 20px 60px;">
        <div style="margin-bottom: 24px;">
          <a href="#semesters" style="font-size: 0.88rem; color: var(--primary); font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
            ← All Semesters
          </a>
        </div>
        <div style="background: linear-gradient(135deg, rgba(30, 64, 175, 0.1), rgba(14, 165, 233, 0.05)); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 30px; margin-bottom: 40px;">
          <span class="hero-badge" style="margin-bottom: 8px;">DDU Curriculum</span>
          <h1 style="font-size: 2.2rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
            B.Tech ${semNumber === 1 ? '1st' : semNumber === 2 ? '2nd' : semNumber === 3 ? '3rd' : `${semNumber}th`} Semester Notes
          </h1>
          <p style="color: var(--text-muted); font-size: 1rem; max-width: 700px;">
            Subject-wise verified lecture notes, Unit 1 to Unit 5 coverage, official syllabus, and previous year examination papers.
          </p>
        </div>

        <div id="semester-subjects-container">
          <p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading subjects for Semester ${semNumber}...</p>
        </div>
      </div>
    `;

    try {
      const data = await this.safeFetch(`/api/subjects?semester_id=${semNumber}`);
      const subjects = data.subjects || [];

      const subjectsEl = document.getElementById("semester-subjects-container");
      if (!subjectsEl) return;

      if (subjects.length === 0) {
        subjectsEl.innerHTML = `
          <div style="text-align: center; padding: 50px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md);">
            <p style="color: var(--text-muted); font-size: 1.1rem; margin-bottom: 12px;">Curriculum for Semester ${semNumber} is being uploaded by administrators.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">Administrators can add subjects and notes from the Admin Portal anytime.</p>
          </div>
        `;
        return;
      }

      // Fetch detail for each subject
      const detailedSubjects = await Promise.all(
        subjects.map(async s => {
          const detailData = await this.safeFetch(`/api/subjects/${s.id}`);
          return detailData.subject;
        })
      );

      subjectsEl.innerHTML = detailedSubjects.map(sub => `
        <div class="subject-card">
          <div class="subject-header">
            <div class="subject-title-area">
              <span class="subject-code-tag">${escapeHtml(sub.code)}</span>
              <div>
                <h2 class="subject-name">${escapeHtml(sub.name)}</h2>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                  Branch: <strong>${escapeHtml(sub.branch)}</strong> • Semester ${sub.semester_number}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${sub.syllabus ? `
                <button onclick="App.openPdfViewer('${sub.syllabus.file_url}', 'Syllabus: ${escapeHtml(sub.name)}')" class="btn-secondary btn-sm">
                  📋 View Syllabus
                </button>
              ` : ''}
              <a href="#pyq" class="btn-secondary btn-sm">
                📝 View PYQs (${sub.pyqs ? sub.pyqs.length : 0})
              </a>
            </div>
          </div>

          <!-- Description -->
          ${sub.description ? `
            <div style="padding: 12px 24px; background: var(--bg-main); border-bottom: 1px solid var(--border); font-size: 0.85rem; color: var(--text-muted);">
              <strong>Syllabus Scope:</strong> ${escapeHtml(sub.description)}
            </div>
          ` : ''}

          <!-- Units 1 to 5 List -->
          <div class="unit-accordion-list">
            ${sub.units && sub.units.length > 0 ? sub.units.map(u => {
              const unitNotes = (sub.notes || []).filter(n => n.unit_id === u.id);
              return `
                <div class="unit-item">
                  <div class="unit-item-header">
                    <div class="unit-item-title">
                      <span>📘</span> Unit ${u.unit_number}: ${escapeHtml(u.title.replace(/^Unit \d+:\s*/, ''))}
                    </div>
                    <span style="font-size: 0.78rem; font-weight: 600; color: var(--primary);">
                      ${unitNotes.length} ${unitNotes.length === 1 ? 'Document' : 'Documents'}
                    </span>
                  </div>
                  ${u.description ? `<p class="unit-item-desc">${escapeHtml(u.description)}</p>` : ''}

                  <!-- Notes for this unit -->
                  <div class="notes-pill-list">
                    ${unitNotes.length === 0 ? `
                      <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; padding: 4px 0;">
                        Notes currently being curated for Unit ${u.unit_number}.
                      </div>
                    ` : unitNotes.map(n => `
                      <div class="note-row">
                        <div class="note-info">
                          <span style="font-size: 1.1rem;">📄</span>
                          <div>
                            <div class="note-title">${escapeHtml(n.title)}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">
                              ${escapeHtml(n.description || '')} • ${n.file_size || 'PDF'}
                            </div>
                          </div>
                          ${n.is_important ? `<span class="update-badge-important">Important</span>` : ''}
                        </div>
                        <div class="note-actions">
                          <button onclick="App.openPdfViewer('${n.file_url}', '${escapeHtml(n.title)}', ${n.id})" class="btn-secondary btn-sm">
                            View PDF
                          </button>
                          <a href="${n.file_url}" download onclick="App.recordDownload(${n.id})" class="btn-primary btn-sm">
                            Download
                          </a>
                          <button onclick="App.toggleBookmark(${n.id})" title="Save note" style="padding: 6px; font-size: 1.1rem; color: var(--accent-amber);">
                            ★
                          </button>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('') : `
              <p style="color: var(--text-muted); padding: 14px 0;">Units setup in progress.</p>
            `}
          </div>
        </div>
      `).join('');

    } catch (e) {
      const el = document.getElementById("semester-subjects-container");
      if (el) el.innerHTML = `<p style="color: var(--accent-rose);">Failed to load semester curriculum: ${e.message}</p>`;
    }
  },

  // ------------------- 4. Syllabus Section -------------------
  async renderSyllabus(container) {
    container.innerHTML = `
      <div class="container" style="padding: 40px 20px 80px;">
        <div class="section-header">
          <span class="section-tag">Curriculum & Schemes</span>
          <h1 class="section-title">Official Syllabus Section</h1>
          <p class="section-description">
            Semester-wise and subject-wise official B.Tech curricula for Deen Dayal Upadhyaya Gorakhpur University.
          </p>
        </div>

        <!-- Verification Notice -->
        <div style="background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.25); border-radius: var(--radius-md); padding: 16px 20px; margin-bottom: 30px; display: flex; align-items: center; gap: 14px;">
          <span style="font-size: 1.6rem;">⚠️</span>
          <div style="font-size: 0.88rem; color: var(--text-main);">
            <strong>Notice to Students:</strong> Official university syllabus documents and examination schemes should only be verified against circulars released by the Academic Council.
          </div>
        </div>

        <!-- Official University Degree Schemes -->
        <div style="margin-bottom: 36px;">
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">
            🏛️ Official DDU Engineering Degree Curricula (CBCS & NEP 2020)
          </h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 18px;">
            Official scheme of courses, credit system, and syllabi issued by Faculty of Engineering & Technology, DDUGU.
          </p>

          <div class="official-syllabus-grid">
            <div class="official-syllabus-card">
              <div>
                <span style="font-size: 0.72rem; font-weight: 800; background: var(--primary-light); color: var(--primary); padding: 3px 8px; border-radius: 4px;">4-YEAR B.TECH CSE</span>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 8px 0 4px;">B.Tech Computer Science & Engineering (2024-25)</h4>
                <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">Full 8-semester structure, core/elective papers, practical labs & credits.</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_cse_structure_syllabus_2024_25.pdf', 'B.Tech CSE Structure & Syllabus 2024-25')" class="btn-primary btn-sm" style="flex: 1;">👁️ View</button>
                <a href="/static/uploads/ddu_official_btech_cse_structure_syllabus_2024_25.pdf" download class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</a>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #0284c7;">
              <div>
                <span style="font-size: 0.72rem; font-weight: 800; background: rgba(14, 165, 233, 0.15); color: var(--accent); padding: 3px 8px; border-radius: 4px;">SPECIALIZATION</span>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 8px 0 4px;">B.Tech CSE with Artificial Intelligence & ML (AIML)</h4>
                <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">Neural Networks, Deep Learning, Computer Vision & NLP specializations.</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_cse_aiml_syllabus.pdf', 'B.Tech CSE (AIML) Syllabus')" class="btn-primary btn-sm" style="flex: 1;">👁️ View</button>
                <a href="/static/uploads/ddu_official_btech_cse_aiml_syllabus.pdf" download class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</a>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #10b981;">
              <div>
                <span style="font-size: 0.72rem; font-weight: 800; background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); padding: 3px 8px; border-radius: 4px;">DATA SCIENCE</span>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 8px 0 4px;">B.Tech CSE (AI & Data Science - AI & DS)</h4>
                <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">Big Data, Predictive Analytics, Machine Learning & Cloud Data systems.</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_cse_aids_syllabus.pdf', 'B.Tech CSE (AI & DS) Syllabus')" class="btn-primary btn-sm" style="flex: 1;">👁️ View</button>
                <a href="/static/uploads/ddu_official_btech_cse_aids_syllabus.pdf" download class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</a>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #d97706;">
              <div>
                <span style="font-size: 0.72rem; font-weight: 800; background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); padding: 3px 8px; border-radius: 4px;">POSTGRADUATE</span>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 8px 0 4px;">M.Tech Computer Science & Engineering (CBCS)</h4>
                <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">Advanced Distributed Computing, HPC, Research & Thesis methodologies.</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_mtech_cse_syllabus.pdf', 'M.Tech CSE Syllabus')" class="btn-primary btn-sm" style="flex: 1;">👁️ View</button>
                <a href="/static/uploads/ddu_official_mtech_cse_syllabus.pdf" download class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</a>
              </div>
            </div>
          </div>
        </div>

        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin-bottom: 14px;">
          Subject-Wise Detailed Syllabi
        </h3>
        <div style="display: flex; gap: 14px; margin-bottom: 24px; flex-wrap: wrap;">
          <select id="syl-sem-filter" onchange="App.filterSyllabus()" class="form-control" style="max-width: 200px;">
            <option value="">All Semesters</option>
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(s => `<option value="${s}">Semester ${s}</option>`).join('')}
          </select>
        </div>

        <div id="syllabus-list-container" class="notes-pill-list">
          <p style="color: var(--text-muted);">Loading syllabus records...</p>
        </div>
      </div>
    `;

    this.filterSyllabus();
  },

  async filterSyllabus() {
    const semFilter = document.getElementById("syl-sem-filter");
    const semId = semFilter ? semFilter.value : "";
    const listEl = document.getElementById("syllabus-list-container");
    if (!listEl) return;

    try {
      const url = semId ? `/api/syllabus?semester_id=${semId}` : "/api/syllabus";
      const data = await this.safeFetch(url);
      const list = data.syllabus || [];

      if (list.length === 0) {
        listEl.innerHTML = `<p style="color: var(--text-muted); padding: 30px; text-align: center;">No syllabus documents found for this filter.</p>`;
        return;
      }

      listEl.innerHTML = list.map(s => `
        <div class="note-row" style="padding: 16px 20px;">
          <div class="note-info">
            <span style="font-size: 1.4rem;">📑</span>
            <div>
              <div style="font-weight: 700; font-size: 1rem; color: var(--text-main);">${escapeHtml(s.title)}</div>
              <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
                Sem ${s.semester_number} • ${escapeHtml(s.subject_name || 'Full Semester Curriculum')}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                ${escapeHtml(s.description || 'Official course syllabus and evaluation scheme.')}
              </div>
            </div>
          </div>
          <div class="note-actions">
            <button onclick="App.openPdfViewer('${s.file_url}', '${escapeHtml(s.title)}')" class="btn-secondary">
              View Online
            </button>
            <a href="${s.file_url}" download class="btn-primary">
              Download PDF
            </a>
          </div>
        </div>
      `).join('');
    } catch (e) {
      listEl.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- 5. All Notes Explorer -------------------
  async renderNotes(container) {
    container.innerHTML = `
      <div class="container" style="padding: 40px 20px 80px;">
        <div class="section-header">
          <span class="section-tag">Repository</span>
          <h1 class="section-title">B.Tech Notes & Study Materials</h1>
          <p class="section-description">
            Search and filter notes by semester, branch, subject, and unit modules.
          </p>
        </div>

        <!-- Filter Bar -->
        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; margin-bottom: 24px; display: flex; gap: 12px; flex-wrap: wrap; box-shadow: var(--shadow-sm);">
          <input type="text" id="notes-search-query" onkeyup="App.triggerNotesFilter()" placeholder="Search notes by keyword..." class="form-control" style="flex: 2; min-width: 200px;">
          <select id="notes-sem-select" onchange="App.triggerNotesFilter()" class="form-control" style="flex: 1; min-width: 140px;">
            <option value="">All Semesters</option>
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(s => `<option value="${s}">Semester ${s}</option>`).join('')}
          </select>
          <select id="notes-unit-select" onchange="App.triggerNotesFilter()" class="form-control" style="flex: 1; min-width: 120px;">
            <option value="">All Units</option>
            <option value="1">Unit 1</option>
            <option value="2">Unit 2</option>
            <option value="3">Unit 3</option>
            <option value="4">Unit 4</option>
            <option value="5">Unit 5</option>
          </select>
        </div>

        <div id="notes-explore-list" class="notes-pill-list">
          <p style="color: var(--text-muted); text-align: center; padding: 30px;">Loading notes...</p>
        </div>
      </div>
    `;

    this.triggerNotesFilter();
  },

  async triggerNotesFilter() {
    const search = document.getElementById("notes-search-query")?.value || "";
    const sem = document.getElementById("notes-sem-select")?.value || "";
    const unit = document.getElementById("notes-unit-select")?.value || "";
    const listEl = document.getElementById("notes-explore-list");
    if (!listEl) return;

    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (sem) params.append("semester_id", sem);
      if (unit) params.append("unit", unit);

      const data = await this.safeFetch(`/api/notes?${params.toString()}`);
      const notes = data.notes || [];

      if (notes.length === 0) {
        listEl.innerHTML = `<p style="color: var(--text-muted); padding: 40px; text-align: center;">No notes matched your search criteria.</p>`;
        return;
      }

      listEl.innerHTML = notes.map(n => `
        <div class="note-row" style="padding: 14px 18px;">
          <div class="note-info">
            <span class="subject-code-tag">${escapeHtml(n.subject_code)}</span>
            <div>
              <div class="note-title">${escapeHtml(n.title)}</div>
              <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                ${escapeHtml(n.subject_name)} • Sem ${n.semester_number} • ${n.unit_number ? `Unit ${n.unit_number}` : 'General'} • ${n.file_size || 'PDF'}
              </div>
            </div>
            ${n.is_important ? `<span class="update-badge-important">Important</span>` : ''}
          </div>
          <div class="note-actions">
            <button onclick="App.openPdfViewer('${n.file_url}', '${escapeHtml(n.title)}', ${n.id})" class="btn-secondary btn-sm">
              View PDF
            </button>
            <a href="${n.file_url}" download onclick="App.recordDownload(${n.id})" class="btn-primary btn-sm">
              Download
            </a>
            <button onclick="App.toggleBookmark(${n.id})" title="Save note" style="padding: 6px; font-size: 1.1rem; color: var(--accent-amber);">
              ★
            </button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      listEl.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- 6. Previous Year Papers (PYQs) -------------------
  async renderPyq(container) {
    container.innerHTML = `
      <div class="container" style="padding: 40px 20px 80px;">
        <div class="section-header">
          <span class="section-tag">Exam Preparation</span>
          <h1 class="section-title">Previous Year Question Papers</h1>
          <p class="section-description">
            Filter official DDU B.Tech semester examination question papers by Year, Branch, and Subject.
          </p>
        </div>

        <!-- Filter Bar -->
        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; margin-bottom: 24px; display: flex; gap: 12px; flex-wrap: wrap; box-shadow: var(--shadow-sm);">
          <select id="pyq-sem-filter" onchange="App.filterPyqs()" class="form-control" style="flex: 1; min-width: 140px;">
            <option value="">All Semesters</option>
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(s => `<option value="${s}">Semester ${s}</option>`).join('')}
          </select>
          <select id="pyq-year-filter" onchange="App.filterPyqs()" class="form-control" style="flex: 1; min-width: 140px;">
            <option value="">All Exam Years</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
            <option value="2022">2022</option>
          </select>
          <select id="pyq-branch-filter" onchange="App.filterPyqs()" class="form-control" style="flex: 1; min-width: 140px;">
            <option value="">All Branches</option>
            <option value="CSE">CSE / IT</option>
            <option value="ECE">ECE</option>
            <option value="EE">EE</option>
            <option value="ME">ME</option>
            <option value="Civil">Civil</option>
          </select>
        </div>

        <div class="table-responsive" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm);">
          <table class="modern-table">
            <thead>
              <tr>
                <th>Exam Year</th>
                <th>Paper Title</th>
                <th>Subject & Code</th>
                <th>Semester</th>
                <th>Branch</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="pyq-table-body">
              <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading papers...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.filterPyqs();
  },

  async filterPyqs() {
    const sem = document.getElementById("pyq-sem-filter")?.value || "";
    const year = document.getElementById("pyq-year-filter")?.value || "";
    const branch = document.getElementById("pyq-branch-filter")?.value || "";
    const tbody = document.getElementById("pyq-table-body");
    if (!tbody) return;

    try {
      const params = new URLSearchParams();
      if (sem) params.append("semester_id", sem);
      if (year) params.append("year", year);
      if (branch) params.append("branch", branch);

      const data = await this.safeFetch(`/api/pyqs?${params.toString()}`);
      const list = data.pyqs || [];

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">No question papers found matching filters.</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(p => `
        <tr>
          <td><span style="font-weight: 800; font-size: 1rem; color: var(--primary);">${p.exam_year}</span></td>
          <td style="font-weight: 700;">${escapeHtml(p.paper_title)}</td>
          <td>
            <span class="subject-code-tag">${escapeHtml(p.subject_code)}</span>
            <span style="font-size: 0.85rem; margin-left: 6px;">${escapeHtml(p.subject_name)}</span>
          </td>
          <td>Sem ${p.semester_number}</td>
          <td>${escapeHtml(p.branch)}</td>
          <td>
            <div style="display: flex; gap: 8px;">
              <button onclick="App.openPdfViewer('${p.file_url}', '${escapeHtml(p.paper_title)}')" class="btn-secondary btn-sm">
                View PDF
              </button>
              <a href="${p.file_url}" download class="btn-primary btn-sm">
                Download
              </a>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="color: var(--accent-rose);">Error: ${e.message}</td></tr>`;
    }
  },

  // ------------------- 7. Daily Updates View -------------------
  async renderUpdates(container) {
    container.innerHTML = `
      <div class="container" style="padding: 40px 20px 80px;">
        <div class="section-header">
          <span class="section-tag">Campus Newsroom</span>
          <h1 class="section-title">Daily Academic Updates</h1>
          <p class="section-description">
            Latest circulars, examination schedules, admit card notifications, and departmental announcements.
          </p>
        </div>

        <!-- Category Filter Tabs -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; justify-content: center;" id="update-category-tabs">
          ${["All", "University Notice", "Exam", "Result", "Admit Card", "Syllabus", "Notes", "Important Announcement"].map((cat, idx) => `
            <button onclick="App.filterUpdates('${cat}')" class="btn-secondary btn-sm ${idx === 0 ? 'active' : ''}" style="border-radius: var(--radius-full);">
              ${cat}
            </button>
          `).join('')}
        </div>

        <div id="updates-feed-list" class="updates-card-list">
          <p style="color: var(--text-muted); text-align: center; padding: 30px;">Loading announcements...</p>
        </div>
      </div>
    `;

    this.filterUpdates("All");
  },

  async filterUpdates(category) {
    const listEl = document.getElementById("updates-feed-list");
    if (!listEl) return;

    // highlight active button
    document.querySelectorAll("#update-category-tabs button").forEach(btn => {
      btn.classList.toggle("active", btn.innerText.trim() === category);
      if (btn.innerText.trim() === category) {
        btn.style.background = "var(--primary)";
        btn.style.color = "white";
      } else {
        btn.style.background = "var(--bg-card)";
        btn.style.color = "var(--text-main)";
      }
    });

    try {
      const url = category && category !== "All" ? `/api/updates?category=${encodeURIComponent(category)}` : "/api/updates";
      const data = await this.safeFetch(url);
      const list = data.updates || [];

      if (list.length === 0) {
        listEl.innerHTML = `<p style="color: var(--text-muted); padding: 40px; text-align: center;">No notices in category "${category}".</p>`;
        return;
      }

      listEl.innerHTML = list.map(u => {
        const dateObj = new Date(u.publish_date);
        const day = dateObj.getDate() || "26";
        const month = dateObj.toLocaleString("en", { month: "short" }) || "SEP";

        return `
          <div class="update-item ${u.is_important ? 'important' : ''}">
            <div class="update-date-badge">
              <div class="update-date-day">${day}</div>
              <div class="update-date-month">${month}</div>
            </div>
            <div class="update-content">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span class="update-category">${escapeHtml(u.category)}</span>
                ${u.is_important ? `<span class="update-badge-important">Important</span>` : ''}
                <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: auto;">${u.publish_date}</span>
              </div>
              <h2 class="update-title" style="font-size: 1.25rem;">${escapeHtml(u.title)}</h2>
              <p class="update-desc" style="font-size: 0.95rem; margin-bottom: 12px;">${escapeHtml(u.short_description)}</p>
              
              ${u.full_details ? `
                <div style="background: var(--bg-main); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; font-size: 0.88rem; color: var(--text-main); margin-bottom: 12px; line-height: 1.5;">
                  ${escapeHtml(u.full_details)}
                </div>
              ` : ''}

              ${u.attachment_url ? `
                <div>
                  <button onclick="App.openPdfViewer('${u.attachment_url}', '${escapeHtml(u.title)}')" class="btn-primary btn-sm">
                    📄 View Official Attachment / Circular
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      listEl.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- 8. About Section & Developer Dossier -------------------
  renderAbout(container) {
    container.innerHTML = `
      <div class="container" style="padding: 50px 20px 80px; max-width: 1050px;">
        <div class="section-header">
          <span class="section-tag" style="background: rgba(217, 119, 6, 0.12); color: #d97706; border: 1px solid rgba(217, 119, 6, 0.3);">
            🏛️ DDU B.Tech Notes Hub
          </span>
          <h1 class="section-title">About the Platform & Developer</h1>
          <p class="section-description">
            Complete academic overview, official university engineering department profile, and detailed biography of lead architect Keshav Narayan.
          </p>
        </div>

        <!-- ==================== Comprehensive Developer Dossier: KESHAV NARAYAN ==================== -->
        <div class="dev-dossier-card">
          <!-- Top Banner -->
          <div class="dev-header-banner">
            <div class="dev-photo-ring">
              <div class="dev-photo-inner">KN</div>
              <div class="dev-badge-verified" title="Verified Creator">✓</div>
            </div>
            <div class="dev-main-info">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span class="brand-naac-badge">LEAD ARCHITECT & CREATOR</span>
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">DDU Gorakhpur University</span>
              </div>
              <h2 class="dev-hero-name">
                KESHAV NARAYAN
              </h2>
              <div class="dev-hero-title">
                B.Tech in Computer Science & Engineering (Specialization: Artificial Intelligence & Machine Learning)
              </div>
              <div class="dev-hero-sub">
                Department of Computer Science & Engineering, Institute of Engineering & Technology (IET), DDUGU • Gorakhpur, UP
              </div>
              
              <!-- Quick Skill Tags -->
              <div class="dev-skill-tags-group">
                <span class="dev-skill-tag">🤖 Artificial Intelligence & ML</span>
                <span class="dev-skill-tag">🧠 Deep Learning & Neural Nets</span>
                <span class="dev-skill-tag">🐍 Python Multithreading</span>
                <span class="dev-skill-tag">🗄️ Relational Architecture (WAL)</span>
                <span class="dev-skill-tag">⚡ Vanilla JS SPA Performance</span>
                <span class="dev-skill-tag">🎨 Modern Glassmorphism UI</span>
              </div>
            </div>
          </div>

          <!-- Body Content -->
          <div class="dev-body-content">
            <!-- Biography & Mission Statement -->
            <div class="dev-section-heading">
              <span>💡</span> The Origin Story & Vision Behind DDU B.Tech Notes Hub
            </div>
            <p style="color: var(--text-muted); line-height: 1.8; margin-bottom: 16px;">
              <strong>Keshav Narayan</strong> is a passionate software engineer, AI researcher, and undergraduate student pursuing his <strong>Bachelor of Technology (B.Tech) in Computer Science & Engineering with specialization in Artificial Intelligence & Machine Learning</strong> at the Institute of Engineering & Technology (IET), Deen Dayal Upadhyaya Gorakhpur University.
            </p>
            <p style="color: var(--text-muted); line-height: 1.8; margin-bottom: 16px;">
              During his engineering journey at DDU, Keshav observed a pervasive obstacle faced by thousands of fellow students across all 8 semesters: study materials, lecture notes, and syllabus outlines were scattered haphazardly across temporary messaging groups, cloud drive links frequently expired, past 5-year question papers (PYQs) were nearly impossible to gather during critical mid-term and end-term exam periods, and official notices from administrative departments were often missed.
            </p>
            <p style="color: var(--text-muted); line-height: 1.8; margin-bottom: 20px;">
              Refusing to accept this fragmented status quo, Keshav undertook the challenge to build a <strong>unified, high-speed, zero-cost digital academic ecosystem</strong> from the ground up. Over weeks of rigorous system design and development, he engineered the <strong>DDU B.Tech Notes Hub</strong>—a full-fledged single-page web portal backed by high-throughput native Python multithreading and SQLite transactional persistence. The platform now hosts comprehensive lecture modules for 28 subjects, 132 units, 176+ notes, 140 end-semester PYQs covering 2021 through 2025, and authentic university syllabus documents.
            </p>

            <!-- Personal Philosophy Quote -->
            <div class="dev-quote-box">
              <strong style="color: var(--accent-amber);">Creator's Philosophy:</strong><br>
              <em>"Code without purpose is just syntax. When engineering is crafted with empathy to solve real student problems and empower our university peer community, it creates lasting academic freedom and educational equity."</em><br>
              <span style="display: block; text-align: right; margin-top: 6px; font-weight: 700; font-size: 0.85rem; color: var(--text-main);">— Keshav Narayan</span>
            </div>

            <!-- 4 Core Technical Pillars -->
            <div class="dev-section-heading" style="margin-top: 30px;">
              <span>🛠️</span> Core Technical Competencies & Architectural Stack
            </div>
            <div class="dev-pillars-grid">
              <div class="dev-pillar-card">
                <div style="font-size: 1.4rem; margin-bottom: 8px;">🤖</div>
                <h4 style="font-size: 1.02rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">AI & Machine Learning</h4>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;">
                  Deep learning model design, computer vision pipelines, natural language processing, predictive student analytics, and mathematical optimization using PyTorch, TensorFlow, and Scikit-Learn.
                </p>
              </div>

              <div class="dev-pillar-card">
                <div style="font-size: 1.4rem; margin-bottom: 8px;">⚡</div>
                <h4 style="font-size: 1.02rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">High-Performance Backend</h4>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;">
                  Multi-threaded non-blocking HTTP server in native Python 3, zero-overhead routing, SQLite Write-Ahead Logging (WAL) concurrency, and PBKDF2-HMAC-SHA256 salted cryptographic security.
                </p>
              </div>

              <div class="dev-pillar-card">
                <div style="font-size: 1.4rem; margin-bottom: 8px;">🎨</div>
                <h4 style="font-size: 1.02rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">UI/UX & Frontend Mastery</h4>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;">
                  Single-Page Application (SPA) architecture with pure vanilla JavaScript, seamless dark/light theme engines, mobile-first responsive grid layouts, and glassmorphism micro-interactions.
                </p>
              </div>

              <div class="dev-pillar-card">
                <div style="font-size: 1.4rem; margin-bottom: 8px;">🤝</div>
                <h4 style="font-size: 1.02rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">Student Community Leadership</h4>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;">
                  Peer-to-peer technical mentorship, organizing academic question banks, advocating for NEP 2020 curriculum transparency, and driving open-source collaborative education.
                </p>
              </div>
            </div>

            <!-- Direct Contact & Actions -->
            <div style="margin-top: 30px; padding: 24px; background: var(--bg-main); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
              <div>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">Connect with Keshav or Request Study Materials</h4>
                <p style="font-size: 0.84rem; color: var(--text-muted);">Have questions regarding study notes, missing PYQ papers, or wish to collaborate?</p>
              </div>
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button onclick="App.openFeedbackModal()" class="btn-primary" style="padding: 10px 18px; font-size: 0.85rem;">
                  ✉️ Send Direct Message
                </button>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="padding: 10px 16px; font-size: 0.85rem;">
                  GitHub
                </a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="padding: 10px 16px; font-size: 0.85rem;">
                  LinkedIn
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== Official DDU Engineering Department Profile ==================== -->
        <div class="dept-showcase-box" style="margin-top: 40px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 20px;">
            <div>
              <span class="section-tag" style="background: var(--primary-light); color: var(--primary);">Academic Institution</span>
              <h2 style="font-size: 1.85rem; font-weight: 800; color: var(--text-main); margin: 6px 0;">
                Department of Computer Science & Engineering (DOCSE)
              </h2>
              <p style="font-size: 0.92rem; color: var(--text-muted); max-width: 720px;">
                Faculty of Engineering and Technology, Institute of Engineering & Technology (IET), Deen Dayal Upadhyaya Gorakhpur University, Civil Lines, Gorakhpur - 273009.
              </p>
            </div>
            <a href="https://ddugu.ac.in/department/DOCSE" target="_blank" rel="noopener noreferrer" class="btn-secondary btn-sm">
              Visit Official Department Site ↗
            </a>
          </div>

          <div style="line-height: 1.8; color: var(--text-muted); font-size: 0.92rem; margin-bottom: 24px;">
            <p style="margin-bottom: 14px;">
              Started campus teaching in <strong>2021</strong> with an initial intake of 60 students, the Department of Computer Science and Engineering has rapidly evolved into a regional center of academic and research excellence. Driven by increasing demand and institutional reputation, the department expanded its capacity to accommodate <strong>150+ students annually</strong>.
            </p>
            <p style="margin-bottom: 14px;">
              In 2024 and 2025, the department introduced specialized cutting-edge programs aligned with the <strong>National Education Policy (NEP) 2020</strong>:
            </p>
            <ul style="margin-left: 20px; margin-bottom: 16px; color: var(--text-main); font-weight: 600;">
              <li>Bachelor of Technology (B.Tech) in Computer Science & Engineering</li>
              <li>Bachelor of Technology (B.Tech) in CSE (Artificial Intelligence & Machine Learning)</li>
              <li>Bachelor of Technology (B.Tech) in CSE (Artificial Intelligence & Data Science)</li>
              <li>Master of Technology (M.Tech) in Computer Science & Engineering</li>
              <li>Master of Computer Applications (MCA)</li>
              <li>Specialized BCA & MS programs in collaboration with NIELIT Gorakhpur</li>
            </ul>
          </div>

          <!-- Department Faculty Roster -->
          <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin-bottom: 14px;">Distinguished Engineering Faculty:</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 24px;">
            <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: var(--radius-sm);">
              <div style="font-weight: 700; color: var(--text-main);">Dr. Rajeev Ranjan Kumar Tripathi</div>
              <div style="font-size: 0.78rem; color: var(--primary);">Assistant Professor</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: var(--radius-sm);">
              <div style="font-weight: 700; color: var(--text-main);">Mr. Pankaj Upadhyay</div>
              <div style="font-size: 0.78rem; color: var(--primary);">Assistant Professor</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: var(--radius-sm);">
              <div style="font-weight: 700; color: var(--text-main);">Dr. Munish Saran</div>
              <div style="font-size: 0.78rem; color: var(--primary);">Assistant Professor</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: var(--radius-sm);">
              <div style="font-weight: 700; color: var(--text-main);">Mr. Saurabh Gupta</div>
              <div style="font-size: 0.78rem; color: var(--primary);">Assistant Professor</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: var(--radius-sm);">
              <div style="font-weight: 700; color: var(--text-main);">Mrs. Trishla Kumari</div>
              <div style="font-size: 0.78rem; color: var(--primary);">Assistant Professor</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: var(--radius-sm);">
              <div style="font-weight: 700; color: var(--text-main);">Mr. Gaurav Tripathi</div>
              <div style="font-size: 0.78rem; color: var(--primary);">Subject Expert</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: var(--radius-sm);">
              <div style="font-weight: 700; color: var(--text-main);">Mr. Gautam Sinha</div>
              <div style="font-size: 0.78rem; color: var(--primary);">Subject Expert</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: var(--radius-sm);">
              <div style="font-weight: 700; color: var(--text-main);">Mrs. Khushboo Gupta</div>
              <div style="font-size: 0.78rem; color: var(--primary);">Subject Expert</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: var(--radius-sm);">
              <div style="font-weight: 700; color: var(--text-main);">Mrs. Shivangi Shukla</div>
              <div style="font-size: 0.78rem; color: var(--primary);">Subject Expert</div>
            </div>
          </div>

          <!-- Academic Disclaimer -->
          <div style="background: rgba(245, 158, 11, 0.08); border-left: 4px solid var(--accent-amber); padding: 16px; border-radius: var(--radius-sm);">
            <div style="font-weight: 800; color: var(--text-main); margin-bottom: 4px;">Legal & Academic Notice:</div>
            <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">
              DDU B.Tech Notes Hub is an independent non-profit student educational portal created by Keshav Narayan for the welfare of engineering students of Deen Dayal Upadhyaya Gorakhpur University. All syllabi, academic regulations, examination timetables, and evaluation schemes should be cross-verified through official university circulars available at <a href="https://ddugu.ac.in" target="_blank" style="color: var(--primary); font-weight: 600;">ddugu.ac.in</a>.
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ------------------- Global Search -------------------
  openSearchModal() {
    const modal = document.getElementById("global-search-modal");
    if (!modal) return;
    modal.classList.add("active");
    const input = document.getElementById("search-input-field");
    if (input) {
      input.value = "";
      input.focus();
    }
    const results = document.getElementById("search-results-container");
    if (results) results.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 24px;">Type a subject, unit, or topic to search (e.g. "Data Structure", "Calculus", "COA")...</p>`;
  },

  handleLiveSearch(query) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(async () => {
      const q = query.trim();
      const container = document.getElementById("search-results-container");
      if (!container) return;

      if (q.length < 2) {
        container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">Type at least 2 characters...</p>`;
        return;
      }

      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">Searching across notes, syllabus, PYQs...</p>`;

      try {
        const data = await this.safeFetch(`/api/search?q=${encodeURIComponent(q)}`);
        
        let html = '';
        
        // 1. Subjects
        if (data.subjects && data.subjects.length > 0) {
          html += `
            <div style="margin-bottom: 16px;">
              <div style="font-size: 0.78rem; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 6px;">Subjects</div>
              ${data.subjects.map(s => `
                <a href="#semester/${s.semester_number}" onclick="App.closeAllModals()" class="note-row" style="margin-bottom: 6px;">
                  <span class="subject-code-tag">${escapeHtml(s.code)}</span>
                  <div style="font-weight: 600; font-size: 0.88rem;">${escapeHtml(s.name)} (Sem ${s.semester_number})</div>
                </a>
              `).join('')}
            </div>
          `;
        }

        // 2. Notes
        if (data.notes && data.notes.length > 0) {
          html += `
            <div style="margin-bottom: 16px;">
              <div style="font-size: 0.78rem; font-weight: 700; color: var(--accent-emerald); text-transform: uppercase; margin-bottom: 6px;">Study Notes & Modules</div>
              ${data.notes.map(n => `
                <div class="note-row" style="margin-bottom: 6px;">
                  <div>
                    <div style="font-weight: 600; font-size: 0.88rem;">${escapeHtml(n.title)}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(n.subject_name)} • Sem ${n.semester_number}</div>
                  </div>
                  <button onclick="App.openPdfViewer('${n.file_url}', '${escapeHtml(n.title)}', ${n.id})" class="btn-secondary btn-sm">View</button>
                </div>
              `).join('')}
            </div>
          `;
        }

        // 3. PYQs
        if (data.pyqs && data.pyqs.length > 0) {
          html += `
            <div style="margin-bottom: 16px;">
              <div style="font-size: 0.78rem; font-weight: 700; color: var(--accent-amber); text-transform: uppercase; margin-bottom: 6px;">Previous Year Papers</div>
              ${data.pyqs.map(p => `
                <div class="note-row" style="margin-bottom: 6px;">
                  <div>
                    <div style="font-weight: 600; font-size: 0.88rem;">${escapeHtml(p.paper_title)} (${p.exam_year})</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(p.subject_name)}</div>
                  </div>
                  <button onclick="App.openPdfViewer('${p.file_url}', '${escapeHtml(p.paper_title)}')" class="btn-secondary btn-sm">View</button>
                </div>
              `).join('')}
            </div>
          `;
        }

        // 4. Updates
        if (data.updates && data.updates.length > 0) {
          html += `
            <div>
              <div style="font-size: 0.78rem; font-weight: 700; color: var(--accent-rose); text-transform: uppercase; margin-bottom: 6px;">Campus Notices</div>
              ${data.updates.map(u => `
                <a href="#updates" onclick="App.closeAllModals()" class="note-row" style="margin-bottom: 6px;">
                  <div style="font-weight: 600; font-size: 0.88rem;">${escapeHtml(u.title)}</div>
                  <span style="font-size: 0.72rem; color: var(--text-muted);">${u.publish_date}</span>
                </a>
              `).join('')}
            </div>
          `;
        }

        container.innerHTML = html || `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No results found for "${escapeHtml(q)}".</p>`;
      } catch (e) {
        container.innerHTML = `<p style="color: var(--accent-rose);">Search failed.</p>`;
      }
    }, 250);
  },

  // ------------------- PDF Viewer Modal -------------------
  openPdfViewer(fileUrl, title = "Document Preview", noteId = null) {
    const modal = document.getElementById("pdf-viewer-modal");
    if (!modal) return;
    const titleEl = document.getElementById("pdf-viewer-title");
    const frame = document.getElementById("pdf-viewer-frame");
    const downloadBtn = document.getElementById("pdf-viewer-download-link");

    if (titleEl) titleEl.innerText = title;
    if (frame) frame.src = fileUrl;
    if (downloadBtn) downloadBtn.href = fileUrl;

    if (noteId) {
      this.recordDownload(noteId);
    }

    modal.classList.add("active");
  },

  async recordDownload(noteId) {
    try {
      await fetch(`/api/notes/${noteId}/view`, { headers: Auth.getAuthHeaders() });
    } catch (e) {}
  },

  async toggleBookmark(noteId) {
    if (!Auth.currentUser) {
      this.toast("Please log in to bookmark study notes.", "warning");
      Auth.openModal("login");
      return;
    }
    try {
      const res = await fetch("/api/student/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify({ note_id: noteId })
      });
      const data = await res.json();
      if (res.ok) {
        this.toast(data.is_bookmarked ? "⭐ Note saved to bookmarks!" : "Note removed from bookmarks.", "success");
      }
    } catch (e) {
      this.toast("Failed to update bookmark", "error");
    }
  },

  // ------------------- Modals Control -------------------
  showGenericModal(htmlContent) {
    let container = document.getElementById("generic-modal-overlay");
    if (!container) {
      container = document.createElement("div");
      container.id = "generic-modal-overlay";
      container.className = "modal-overlay";
      document.body.appendChild(container);
    }
    container.innerHTML = htmlContent;
    container.classList.add("active");
  },

  closeActiveModal() {
    const generic = document.getElementById("generic-modal-overlay");
    if (generic) generic.classList.remove("active");
    this.closeAllModals();
  },

  closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
    const frame = document.getElementById("pdf-viewer-frame");
    if (frame) frame.src = "about:blank";
  },

  // ------------------- Auth Forms Setup -------------------
  setupAuthForms() {
    // Login form
    const loginForm = document.getElementById("login-form-element");
    if (loginForm) {
      loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = loginForm.email.value.trim();
        const password = loginForm.password.value;
        const remember = loginForm.remember.checked;

        const res = await Auth.login(email, password, remember);
        if (res.success) {
          Auth.closeModal();
          App.toast(`Welcome back, ${res.user.full_name}!`, "success");
          if (res.user.role === "ADMIN") {
            window.location.hash = "#admin";
          } else {
            window.location.hash = "#dashboard";
          }
        } else {
          App.toast(res.error, "error");
        }
      };
    }

    // Register form
    const regForm = document.getElementById("register-form-element");
    if (regForm) {
      regForm.onsubmit = async (e) => {
        e.preventDefault();
        const full_name = regForm.full_name.value.trim();
        const email = regForm.email.value.trim();
        const password = regForm.password.value;
        const confirm_password = regForm.confirm_password.value;
        const college = regForm.college.value.trim();
        const branch = regForm.branch.value;
        const semester = parseInt(regForm.semester.value);

        if (password !== confirm_password) {
          App.toast("Passwords do not match.", "error");
          return;
        }

        const res = await Auth.register({
          full_name,
          email,
          password,
          college,
          branch,
          semester,
          course: "B.Tech"
        });

        if (res.success) {
          Auth.closeModal();
          App.toast("Account registered successfully! Welcome to DDU Notes Hub.", "success");
          window.location.hash = "#dashboard";
        } else {
          App.toast(res.error, "error");
        }
      };
    }

    // Forgot password form
    const forgotForm = document.getElementById("forgot-form-element");
    if (forgotForm) {
      forgotForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = forgotForm.email.value.trim();
        try {
          const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          });
          const data = await res.json();
          App.toast(data.message || "Reset link sent.", "info");
          Auth.switchTab("login");
        } catch (err) {
          App.toast("Error sending reset request", "error");
        }
      };
    }
  },

  openFeedbackModal() {
    const modal = document.getElementById("feedback-modal");
    if (modal) modal.classList.add("active");
  },

  handleFeedbackSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const sem = form.semester.value;
    const branch = form.branch.value;
    const type = form.type.value;
    const message = form.message.value.trim();

    App.closeAllModals();
    App.toast(`Thank you, ${name}! Your ${type} has been sent directly to Keshav Narayan. We will review and update the portal shortly.`, "success");
    form.reset();
  },

  toggleMobileMenu() {
    const nav = document.getElementById("navbar-links-list");
    if (nav) nav.classList.toggle("mobile-open");
  }
};

window.addEventListener("DOMContentLoaded", () => App.init());
