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
    window.addEventListener("auth:changed", () => this.handleRouting());
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

    // Setup Progressive Web App (PWA) and offline caching
    this.setupPwa();

    // Initial Route
    this.handleRouting();
  },

  // ------------------- PWA & Offline Support -------------------
  isAppInstalled() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || window.navigator.standalone === true 
      || document.referrer.includes('android-app://')
      || localStorage.getItem('ddu_pwa_installed') === 'true';
    return Boolean(isStandalone);
  },

  updateInstallUi() {
    const installed = this.isAppInstalled();

    const pwaCard = document.getElementById("pwa-install-card");
    if (pwaCard) {
      if (installed) {
        pwaCard.style.display = "none";
      } else {
        // Show promotional card below hero if not installed (like keshavaieducation.vercel.app)
        pwaCard.style.display = "flex";
      }
    }

    const navBtn = document.getElementById("btn-nav-install");
    if (navBtn) {
      // Keep navbar clean and spacious
      navBtn.style.display = "none";
    }

    const bottomInstall = document.getElementById("btn-bottom-install");
    const bottomUpdates = document.getElementById("btn-bottom-updates");
    if (bottomInstall && bottomUpdates) {
      if (installed) {
        bottomInstall.style.display = "none";
        bottomUpdates.style.display = "flex";
      } else {
        bottomInstall.style.display = "flex";
        bottomUpdates.style.display = "none";
      }
    }
  },

  setupPwa() {
    // 1. Immediately detect if running inside installed standalone app
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || document.referrer.includes('android-app://')) {
      localStorage.setItem('ddu_pwa_installed', 'true');
      console.log('📲 Running in installed standalone PWA mode');
    }

    // 2. Check modern getInstalledRelatedApps API
    if ('getInstalledRelatedApps' in navigator) {
      navigator.getInstalledRelatedApps().then(apps => {
        if (apps && apps.length > 0) {
          localStorage.setItem('ddu_pwa_installed', 'true');
          this.updateInstallUi();
        }
      }).catch(() => {});
    }

    // 3. Listen for display mode changes (e.g. user opens as standalone app)
    try {
      window.matchMedia('(display-mode: standalone)').addEventListener('change', (evt) => {
        if (evt.matches) {
          localStorage.setItem('ddu_pwa_installed', 'true');
          this.updateInstallUi();
        }
      });
    } catch(e) {}

    // 4. Register Service Worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js")
          .then((reg) => {
            console.log("📦 [PWA] Service Worker registered with scope:", reg.scope);
          })
          .catch((err) => {
            console.warn("⚠️ [PWA] Service Worker registration failed:", err);
          });
      });
    }

    // 5. Capture beforeinstallprompt event
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      window.deferredPrompt = e;
      console.log("📲 [PWA] beforeinstallprompt captured.");
      this.updateInstallUi();
    });

    // 6. Listen for successful app installation
    window.addEventListener("appinstalled", () => {
      console.log("🎉 [PWA] App successfully installed on device!");
      localStorage.setItem("ddu_pwa_installed", "true");
      window.deferredPrompt = null;
      this.updateInstallUi();
      App.toast("🎉 DDU B.Tech Notes App installed successfully!", "success");
    });

    // 7. Initial UI sync
    this.updateInstallUi();

    // 8. Global window.installPwa function callable from buttons
    window.installPwa = () => {
      if (this.isAppInstalled()) {
        App.toast("✅ App is already installed on your device!", "info");
        this.updateInstallUi();
        return;
      }

      if (window.deferredPrompt) {
        window.deferredPrompt.prompt();
        window.deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === "accepted") {
            console.log("User accepted PWA installation prompt");
            localStorage.setItem("ddu_pwa_installed", "true");
            this.updateInstallUi();
            App.toast("Installing DDU B.Tech Notes App...", "success");
          } else {
            console.log("User dismissed PWA installation prompt");
          }
          window.deferredPrompt = null;
        });
      } else {
        // Fallback helper modal for iOS Safari / Unsupported Browsers
        const modal = document.getElementById("pwa-install-modal");
        if (modal) {
          modal.style.display = "flex";
        } else {
          alert("📲 To install this app:\n\n• On iPhone / iPad: Tap the Share button (📤) in Safari and tap 'Add to Home Screen' (➕).\n• On Android / PC: Open Chrome menu (⋮) and tap 'Install App' or 'Add to Home Screen'.");
        }
      }
    };
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

  // ------------------- Content Lock Gate Component -------------------
  renderLockGate(container, title = "Study Material Access Locked", desc = "") {
    container.innerHTML = `
      <div class="container" style="padding: 40px 20px 80px;">
        <div class="content-lock-gate" style="background: var(--bg-card); border: 2px dashed rgba(217, 119, 6, 0.45); border-radius: var(--radius-lg); padding: 50px 24px; text-align: center; max-width: 680px; margin: 30px auto; box-shadow: var(--shadow-md);">
          <div style="width: 76px; height: 76px; background: rgba(217, 119, 6, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 2.3rem; border: 2px solid #d97706; box-shadow: 0 4px 15px rgba(217, 119, 6, 0.2);">
            🔒
          </div>
          <div style="font-size: 0.8rem; font-weight: 800; color: var(--accent-amber); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">
            DDU B.Tech Students Access Gate
          </div>
          <h2 style="font-size: 1.7rem; font-weight: 800; color: var(--text-main); margin-bottom: 12px; font-family: 'Outfit', sans-serif;">
            ${escapeHtml(title)}
          </h2>
          <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; margin-bottom: 26px; max-width: 540px; margin-left: auto; margin-right: auto;">
            ${escapeHtml(desc || "DDU Gorakhpur University B.Tech engineering notes, previous year question papers aur syllabus dekhne ke liye kripya pehle Apna Free Student Account banayein (Register karein).")}
          </p>
          
          <div style="display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin-bottom: 28px;">
            <button onclick="Auth.openModal('login')" class="btn-primary" style="padding: 13px 26px; font-weight: 800; font-size: 0.98rem; border-radius: var(--radius-md); box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35); display: inline-flex; align-items: center; gap: 8px;">
              <span>🔑</span> Student Log In
            </button>
            <button onclick="Auth.openModal('register')" class="btn-secondary" style="padding: 13px 22px; font-weight: 700; font-size: 0.98rem; border-radius: var(--radius-md); display: inline-flex; align-items: center; gap: 6px;">
              <span>✨</span> Create Free Student Account (Register)
            </button>
          </div>

          <div style="background: var(--bg-main); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px 22px; text-align: left; display: inline-block; max-width: 520px; width: 100%;">
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>🎯</span> Student Registration ke Fayde:
            </div>
            <ul style="font-size: 0.82rem; color: var(--text-muted); padding-left: 20px; margin: 0; line-height: 1.8;">
              <li><strong>1st to 8th Semester</strong> ke sabhi verified unit-wise notes</li>
              <li><strong>5 Saal ke Previous Year Question Papers (2021-2025)</strong> PDF download</li>
              <li><strong>Official CBCS Syllabus</strong> aur marks distribution scheme</li>
              <li>Important topics aur derivations ko <strong>Bookmark</strong> karne ki suvidha</li>
              <li>Khud ke handwritten notes <strong>Contribute</strong> karke verify karwane ka feature</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  },

  // ------------------- Router -------------------
  handleRouting() {
    // Check if query params have direct note link, e.g. ?note=123 or ?id=123
    const urlParams = new URLSearchParams(window.location.search);
    const directNoteId = urlParams.get("note") || urlParams.get("noteId") || urlParams.get("id");
    if (directNoteId && (!window.location.hash || window.location.hash === "#home" || window.location.hash === "")) {
      window.location.hash = `#note/${directNoteId}`;
      return;
    }

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

    // Update active mobile bottom navigation state
    const currentBaseRoute = hash.split('/')[0] || "home";
    document.querySelectorAll(".bottom-nav-item[data-nav]").forEach(btn => {
      if (btn.getAttribute("data-nav") === currentBaseRoute) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // Update active mobile sub-navigation links
    document.querySelectorAll(".sub-nav-link[data-subnav]").forEach(link => {
      if (link.getAttribute("data-subnav") === currentBaseRoute) {
        link.classList.add("active");
        try {
          link.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        } catch(e){}
      } else {
        link.classList.remove("active");
      }
    });

    // Auto-close mobile drawer if open
    const drawer = document.getElementById("mobile-drawer");
    const overlay = document.getElementById("mobile-drawer-overlay");
    if (drawer && drawer.classList.contains("open")) {
      drawer.classList.remove("open");
      if (overlay) overlay.classList.remove("open");
      document.body.style.overflow = "";
    }

    const mobileNavList = document.getElementById("navbar-links-list");
    if (mobileNavList && mobileNavList.classList.contains("mobile-open")) {
      mobileNavList.classList.remove("mobile-open");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });

    // Authentication Access Gate: Student must be logged in to view notes, pyq, syllabus, semesters, updates
    const protectedContentRoutes = ["notes", "pyq", "syllabus", "semesters", "updates"];
    const isProtected = protectedContentRoutes.includes(hash) || hash.startsWith("semester/");

    if (isProtected && !Auth.currentUser) {
      let title = "B.Tech Study Materials & Curriculum Locked";
      let desc = "DDU Gorakhpur University B.Tech portal ka study material dekhne ke liye kripya pehle Apna Student Account Login karein ya Free Register karein.";
      if (hash === "notes") {
        title = "B.Tech Lecture Notes & Study Materials Locked";
        desc = "DDU Gorakhpur University ke B.Tech semester-wise lecture notes dekhne ke liye kripya pehle Student Login karein ya Register karein.";
      } else if (hash === "pyq") {
        title = "Previous Year Question Papers (2021-2025) Locked";
        desc = "DDU B.Tech 5-year end-term examination question papers aur answer keys download karne ke liye kripya pehle Student Login karein.";
      } else if (hash === "syllabus") {
        title = "Official CBCS Syllabus Curricula Locked";
        desc = "Official university course scheme aur subject-wise syllabus dekhne ke liye kripya pehle Student Login karein.";
      } else if (hash === "semesters" || hash.startsWith("semester/")) {
        title = "B.Tech Academic Semesters Curriculum Locked";
        desc = "DDU Gorakhpur University 1st to 8th Semester curriculum aur subjects dekhne ke liye kripya pehle Student Login karein.";
      } else if (hash === "updates") {
        title = "Daily Academic Notices & Campus Updates Locked";
        desc = "DDU Gorakhpur University ki sabhi daily campus notices, examination circulars aur official announcements dekhne ke liye kripya pehle Student Login karein.";
      }
      this.renderLockGate(container, title, desc);
      Auth.openModal("login");
      return;
    }

    if (hash === "home") {
      this.renderHome(container);
    } else if (hash.startsWith("note/")) {
      const noteId = hash.split("/")[1];
      this.renderSharedNote(container, parseInt(noteId));
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
    if (!Auth.currentUser) {
      // Unauthenticated / Guest View: Grand Centered University Logo Stage + Parallax Overlapping Benefits Sheet
      this.renderGuestHome(container);
    } else {
      // Authenticated Student View: Personalized Dashboard with Active Semester & Bookmarks
      this.renderStudentHome(container);
    }

    // Fetch and display latest updates
    await this.loadHomeUpdates();

    // Sync PWA install state on home render
    this.updateInstallUi();
  },

  // 1A. Guest Landing: Grand Centered University Logo Stage + Parallax Overlap Sheet
  renderGuestHome(container) {
    container.innerHTML = `
      <!-- Sticky Grand University Logo Stage (Top First Screen) -->
      <section class="guest-welcome-stage" id="guest-welcome-stage">
        <div class="guest-ambient-glow"></div>
        <div class="guest-stage-inner">
          <!-- Large Centered Emblem Ring -->
          <div class="guest-emblem-ring" title="Deen Dayal Upadhyaya Gorakhpur University Crest">
            <img src="/static/ddu_official_logo.png?v=3" alt="Deen Dayal Upadhyaya Gorakhpur University Official Crest" class="guest-emblem-img" onerror="this.src='/logo.png'">
          </div>

          <!-- University Typography -->
          <h1 class="guest-uni-title-hi">दीनदयाल उपाध्याय गोरखपुर विश्वविद्यालय</h1>
          <div class="guest-uni-title-en">Deen Dayal Upadhyaya Gorakhpur University</div>
          <div class="guest-uni-faculty">Faculty of Engineering & Technology • Institute of Engineering & Technology (IET)</div>

          <!-- Accreditation Badges -->
          <div class="guest-badges-row">
            <span class="guest-badge-chip guest-badge-gold">🏛️ Estd. 1957 (State University)</span>
            <span class="guest-badge-chip guest-badge-green">✓ NAAC "A++" Grade Accredited</span>
            <span class="guest-badge-chip guest-badge-blue">🎓 8 Semesters B.Tech Curriculum</span>
          </div>

          <!-- Action Buttons -->
          <div class="guest-actions-row">
            <button onclick="Auth.openModal('register')" class="guest-btn-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7.5" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              ✨ Create Free Student Account
            </button>
            <button onclick="Auth.openModal('login')" class="guest-btn-secondary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              🔑 Student Log In
            </button>
          </div>
        </div>

        <!-- Animated Scroll Down Prompter -->
        <div class="guest-scroll-prompter" onclick="document.getElementById('guest-sheet').scrollIntoView({behavior: 'smooth'})" title="Scroll Down for Website Details & Benefits">
          <span>Explore Details & Benefits</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </section>

      <!-- Overlapping Sliding Content Sheet (Glides Over University Crest on Scroll) -->
      <section class="guest-content-sheet" id="guest-sheet">
        <div class="sheet-grab-bar" title="Elevated Content Sheet"></div>

        <div class="container">
          <!-- Sheet Hero Header -->
          <div class="guest-sheet-hero">
            <span class="guest-sheet-tag">🚀 Official Academic Ecosystem</span>
            <h2 class="guest-sheet-title">The Complete Academic Hub for <span>DDU Engineers</span></h2>
            <p class="guest-sheet-desc">
              Welcome to the official study material portal of Deen Dayal Upadhyaya Gorakhpur University. Access verified unit-wise notes, previous 5-year question papers (PYQs), official NEP 2020 syllabus curricula, and instant campus circulars in one unified place.
            </p>
          </div>

          <!-- Registration Required Alert Banner -->
          <div style="background: linear-gradient(135deg, rgba(30, 64, 175, 0.12), rgba(217, 119, 6, 0.14)); border: 1.5px solid rgba(217, 119, 6, 0.45); border-radius: var(--radius-md); padding: 18px 24px; margin-bottom: 40px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; align-items: center; gap: 14px;">
              <span style="font-size: 2.2rem;">🔐</span>
              <div>
                <div style="font-weight: 800; font-size: 1.05rem; color: var(--text-main); font-family: 'Outfit', sans-serif;">
                  Free Student Registration Required for Full Content Access
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 3px;">
                  All notes, solved question papers, and syllabus documents require a quick free student registration to read online and download.
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button onclick="Auth.openModal('register')" class="btn-primary" style="font-weight: 800; padding: 10px 20px; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
                ✨ Create Free Account
              </button>
              <button onclick="Auth.openModal('login')" class="btn-secondary" style="font-weight: 700; padding: 10px 18px; font-size: 0.9rem;">
                🔑 Log In
              </button>
            </div>
          </div>

          <!-- Statistics Counters -->
          <div class="stats-grid" id="home-stats-container" style="margin-bottom: 45px;">
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

          <!-- Core Benefits Grid (8 Major Advantages) -->
          <div class="section-header">
            <span class="section-tag" style="background: rgba(217, 119, 6, 0.12); color: #d97706; border: 1px solid rgba(217, 119, 6, 0.3);">💎 Key Benefits</span>
            <h2 class="section-title">Why Students Love DDU Notes Hub</h2>
            <p class="section-description">
              Engineered exclusively for engineering students of Deen Dayal Upadhyaya Gorakhpur University with zero distractions, zero fees, and high academic fidelity.
            </p>
          </div>

          <div class="guest-benefits-grid">
            <div class="guest-benefit-card">
              <div class="guest-benefit-icon-box" style="background: rgba(30, 64, 175, 0.1); color: var(--primary);">📚</div>
              <h3 class="guest-benefit-title">1st to 8th Sem Lecture Notes</h3>
              <p class="guest-benefit-desc">Hand-crafted, typed, and unit-wise (Units 1 to 5) study notes matching the university curriculum and syllabus scope.</p>
              <span class="guest-benefit-badge" style="background: rgba(30, 64, 175, 0.1); color: var(--primary);">Units 1–5 Covered</span>
            </div>

            <div class="guest-benefit-card">
              <div class="guest-benefit-icon-box" style="background: rgba(217, 119, 6, 0.1); color: #d97706;">📑</div>
              <h3 class="guest-benefit-title">5-Year PYQs (2021–2025)</h3>
              <p class="guest-benefit-desc">Comprehensive repository of university end-term examination papers, repeated derivation patterns, and marking schemes.</p>
              <span class="guest-benefit-badge" style="background: rgba(217, 119, 6, 0.1); color: #d97706;">2021–2025 Papers</span>
            </div>

            <div class="guest-benefit-card">
              <div class="guest-benefit-icon-box" style="background: rgba(16, 185, 129, 0.1); color: #059669;">🏛️</div>
              <h3 class="guest-benefit-title">Official CBCS & NEP 2020 Syllabus</h3>
              <p class="guest-benefit-desc">Official syllabi directly issued by Faculty of Engineering & Technology (IET DDUGU) with course outcomes, credits, and book references.</p>
              <span class="guest-benefit-badge" style="background: rgba(16, 185, 129, 0.1); color: #059669;">Verified PDFs</span>
            </div>

            <div class="guest-benefit-card">
              <div class="guest-benefit-icon-box" style="background: rgba(14, 165, 233, 0.1); color: var(--accent);">✍️</div>
              <h3 class="guest-benefit-title">Student Notes Contributions & Verification</h3>
              <p class="guest-benefit-desc">Contribute your self-prepared study notes! Once verified by administrator, your name and contributor badge appear on the platform.</p>
              <span class="guest-benefit-badge" style="background: rgba(14, 165, 233, 0.1); color: var(--accent);">Peer Learning</span>
            </div>

            <div class="guest-benefit-card">
              <div class="guest-benefit-icon-box" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6;">⚡</div>
              <h3 class="guest-benefit-title">High-Speed In-Browser PDF Reader</h3>
              <p class="guest-benefit-desc">Read notes smoothly with fullscreen viewing, mobile zoom, page navigation, and 1-tap offline PDF download.</p>
              <span class="guest-benefit-badge" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6;">1-Tap Reading</span>
            </div>

            <div class="guest-benefit-card">
              <div class="guest-benefit-icon-box" style="background: rgba(239, 68, 68, 0.1); color: #dc2626;">📱</div>
              <h3 class="guest-benefit-title">1-Tap App Install (PWA)</h3>
              <p class="guest-benefit-desc">Install directly on your Android, iOS, Windows, or Mac device with offline support and instantaneous home screen access.</p>
              <span class="guest-benefit-badge" style="background: rgba(239, 68, 68, 0.1); color: #dc2626;">Offline Ready</span>
            </div>

            <div class="guest-benefit-card">
              <div class="guest-benefit-icon-box" style="background: rgba(245, 158, 11, 0.1); color: #d97706;">🔖</div>
              <h3 class="guest-benefit-title">Personalized Student Library</h3>
              <p class="guest-benefit-desc">Bookmark vital units, track subjects, and access your favorite study materials right before exam night.</p>
              <span class="guest-benefit-badge" style="background: rgba(245, 158, 11, 0.1); color: #d97706;">Smart Revision</span>
            </div>

            <div class="guest-benefit-card">
              <div class="guest-benefit-icon-box" style="background: rgba(16, 185, 129, 0.1); color: #059669;">🛡️</div>
              <h3 class="guest-benefit-title">Zero Data Leak Security & Privacy</h3>
              <p class="guest-benefit-desc">Strict session encryption, brute-force defense, role-based access control (RBAC), and zero data sharing with third parties.</p>
              <span class="guest-benefit-badge" style="background: rgba(16, 185, 129, 0.1); color: #059669;">100% Protected</span>
            </div>
          </div>

          <!-- 3-Step "How to Get Started" Guide -->
          <div class="guest-steps-container">
            <div style="text-align: center;">
              <span class="section-tag" style="background: rgba(30, 64, 175, 0.1); color: var(--primary);">Simple 3 Steps</span>
              <h3 style="font-size: 1.5rem; font-weight: 800; color: var(--text-main); margin: 6px 0;">How to Get Started</h3>
              <p style="font-size: 0.88rem; color: var(--text-muted);">Unlock full notes, question papers, and syllabus in less than 30 seconds.</p>
            </div>
            <div class="guest-steps-grid">
              <div class="guest-step-card">
                <div class="guest-step-num">1</div>
                <div>
                  <div class="guest-step-title">Create Free Account</div>
                  <div class="guest-step-desc">Sign up in seconds using your name, email, roll number, and branch. No credit card, 100% free forever.</div>
                </div>
              </div>
              <div class="guest-step-card">
                <div class="guest-step-num">2</div>
                <div>
                  <div class="guest-step-title">Select Branch & Semester</div>
                  <div class="guest-step-desc">Pick your active semester (1st to 8th) and branch to see all mapped subjects, units, and PYQs.</div>
                </div>
              </div>
              <div class="guest-step-card">
                <div class="guest-step-num">3</div>
                <div>
                  <div class="guest-step-title">Study & Excel</div>
                  <div class="guest-step-desc">Read PDFs online in browser, download copies for offline study, practice PYQs, and score top marks!</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Supported Engineering Branches -->
          <div class="section-header" style="margin-bottom: 14px;">
            <span class="section-tag">Engineering Disciplines</span>
            <h2 class="section-title">Branches Supported</h2>
            <p class="section-description">Curriculum aligned with Institute of Engineering & Technology, DDU Gorakhpur University.</p>
          </div>
          <div class="guest-branches-grid">
            <div class="guest-branch-pill">💻 Computer Science & Engineering (CSE)</div>
            <div class="guest-branch-pill">🤖 CSE (Artificial Intelligence & ML)</div>
            <div class="guest-branch-pill">📊 CSE (Data Science)</div>
            <div class="guest-branch-pill">🌐 Information Technology (IT)</div>
            <div class="guest-branch-pill">⚡ Electronics & Communication (ECE)</div>
            <div class="guest-branch-pill">🔌 Electrical Engineering (EE)</div>
            <div class="guest-branch-pill">⚙️ Mechanical Engineering (ME)</div>
            <div class="guest-branch-pill">🏗️ Civil Engineering (CE)</div>
          </div>

          <!-- All 8 Semesters Preview Grid -->
          <div class="section-header">
            <span class="section-tag">Direct Curriculum Access</span>
            <h2 class="section-title">All 8 B.Tech Semesters</h2>
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
                    <span style="color: #d97706; font-weight: 700;">🔒 Requires Sign Up</span>
                  </div>
                  <button onclick="Auth.openModal('register')" class="btn-primary btn-sm" style="width: 100%; margin-top: 14px;">
                    🔓 Unlock ${sem === 1 ? '1st' : sem === 2 ? '2nd' : sem === 3 ? '3rd' : `${sem}th`} Semester
                  </button>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Official CBCS Curriculum Repository Section -->
          <div style="padding: 50px 0 30px;">
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
                  <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_cse_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech CSE Structure & Syllabus 2024-25')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                    ⬇ Download
                  </button>
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
                  <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_cse_aiml_syllabus.pdf', 'Official DDU B.Tech CSE (AIML) Syllabus')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                    ⬇ Download
                  </button>
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
                  <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_cse_aids_syllabus.pdf', 'Official DDU B.Tech CSE (AI & DS) Syllabus')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                    ⬇ Download
                  </button>
                </div>
              </div>

              <div class="official-syllabus-card" style="border-left-color: #06b6d4;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <span style="font-size: 0.72rem; font-weight: 800; background: rgba(6, 182, 212, 0.15); color: #06b6d4; padding: 3px 8px; border-radius: 4px;">4-YEAR B.TECH IT</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Official DDU PDF</span>
                  </div>
                  <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
                    B.Tech Information Technology (Session 2024-25)
                  </h3>
                  <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
                    Four-year degree scheme covering Network Architecture, Cloud Systems, Operating Systems, Information Security, Web Engineering, and Full-Stack development.
                  </p>
                </div>
                <div style="display: flex; gap: 10px; margin-top: auto;">
                  <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_it_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech IT Structure & Syllabus 2024-25')" class="btn-primary btn-sm" style="flex: 1;">
                    👁️ Read Online
                  </button>
                  <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_it_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech IT Structure & Syllabus 2024-25')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                    ⬇ Download
                  </button>
                </div>
              </div>

              <div class="official-syllabus-card" style="border-left-color: #f97316;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <span style="font-size: 0.72rem; font-weight: 800; background: rgba(249, 115, 22, 0.15); color: #f97316; padding: 3px 8px; border-radius: 4px;">4-YEAR B.TECH ME</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Official DDU PDF</span>
                  </div>
                  <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
                    B.Tech Mechanical Engineering (Session 2024-25)
                  </h3>
                  <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
                    Comprehensive 4-year curriculum covering Thermodynamics, Fluid Mechanics, Theory of Machines, CAD/CAM, Robotics, Heat Transfer & Industrial Automation.
                  </p>
                </div>
                <div style="display: flex; gap: 10px; margin-top: auto;">
                  <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_me_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech ME Structure & Syllabus 2024-25')" class="btn-primary btn-sm" style="flex: 1;">
                    👁️ Read Online
                  </button>
                  <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_me_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech ME Structure & Syllabus 2024-25')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                    ⬇ Download
                  </button>
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
                  <button onclick="App.downloadFile('/static/uploads/ddu_official_mtech_cse_syllabus.pdf', 'Official DDU M.Tech CSE Syllabus')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                    ⬇ Download
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Department of Computer Science & Engineering Showcase -->
          <div style="padding: 20px 0 40px;">
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
            </div>
          </div>

          <!-- Featured Developer Showcase Banner -->
          <div style="padding: 20px 0 40px;">
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

          <!-- Latest Daily Updates Teaser -->
          <div style="padding: 20px 0 50px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; flex-wrap: wrap; gap: 14px;">
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

          <!-- Bottom Grand Call-to-Action Card -->
          <div class="guest-cta-box">
            <h3 class="guest-cta-title">Ready to Excel in Your Semester Exams?</h3>
            <p class="guest-cta-desc">
              Join your fellow DDU engineering students today. Create your free student account now to get immediate access to all lecture notes, PYQs, and syllabus.
            </p>
            <button onclick="Auth.openModal('register')" class="guest-cta-btn-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7.5" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              ✨ Create Free Account (Register Now)
            </button>
          </div>
        </div>
      </section>
    `;
  },

  // 1B. Authenticated Student Dashboard: Personalized shortcuts, active semester & bookmarks
  renderStudentHome(container) {
    const user = Auth.currentUser || {};
    const userName = escapeHtml(user.name || 'Engineer');
    const userBranch = escapeHtml(user.branch || 'B.Tech CSE');
    const userSem = user.semester || 1;

    container.innerHTML = `
      <!-- Student Dashboard Hero -->
      <section class="hero-section" style="padding-top: 36px;">
        <div class="container">
          <!-- Student Greeting Card -->
          <div style="background: linear-gradient(135deg, rgba(30, 64, 175, 0.12), rgba(14, 165, 233, 0.10)); border: 1.5px solid rgba(37, 99, 235, 0.35); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 30px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; align-items: center; gap: 18px;">
              <div style="width: 58px; height: 58px; border-radius: 50%; background: linear-gradient(135deg, #1e40af, #0284c7); color: #fff; font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(30, 64, 175, 0.35);">
                ${userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-size: 0.78rem; font-weight: 800; text-transform: uppercase; color: var(--primary); letter-spacing: 0.5px;">Student Portal Dashboard</div>
                <h1 style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin: 2px 0;">
                  Welcome back, ${userName}! 👋
                </h1>
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px;">
                  <span style="font-size: 0.82rem; font-weight: 700; background: rgba(30, 64, 175, 0.1); color: var(--primary); padding: 2px 10px; border-radius: 20px;">🎓 ${userBranch}</span>
                  <span style="font-size: 0.82rem; font-weight: 700; background: rgba(217, 119, 6, 0.12); color: #d97706; padding: 2px 10px; border-radius: 20px;">📅 Semester ${userSem}</span>
                  <span style="font-size: 0.82rem; font-weight: 700; background: rgba(16, 185, 129, 0.12); color: #059669; padding: 2px 10px; border-radius: 20px;">✓ Registered Student</span>
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <a href="#semester/${userSem}" class="btn-primary" style="padding: 12px 22px; font-weight: 800;">
                🚀 Open My Semester (${userSem})
              </a>
              <button onclick="App.openSubmitNoteModal()" class="btn-secondary" style="padding: 12px 18px; font-weight: 700; border-color: rgba(217, 119, 6, 0.4); color: #d97706;">
                ➕ Add / Contribute Notes
              </button>
            </div>
          </div>

          <!-- Hero Grid Layout -->
          <div class="hero-grid-layout">
            <!-- Left: Hero Text & Actions -->
            <div class="hero-content-col">
              <div class="hero-badge">
                <span>🏛️</span> NAAC "A++" Accredited State University • Department of CSE & Engineering
              </div>
              <h2 class="hero-title" style="font-size: 2.3rem;">
                DDU B.Tech <span>Notes Hub</span>
              </h2>
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
                  <img src="/static/ddu_official_logo.png?v=3" alt="Deen Dayal Upadhyaya Gorakhpur University Official Crest" class="hero-emblem-img" onerror="this.src='/logo.png'">
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

          <!-- PWA Install Promotional Card -->
          <div id="pwa-install-card" class="pwa-install-card" style="display: none;">
            <div class="pwa-install-info">
              <div class="pwa-install-icon-wrapper">
                <img src="/static/icon-192.png" alt="DDU Notes App" class="pwa-install-logo">
              </div>
              <div class="pwa-install-text">
                <div class="pwa-install-badge">⚡ Official Web App (PWA)</div>
                <h3 class="pwa-install-title">Install DDU B.Tech Notes App</h3>
                <p class="pwa-install-desc">Install directly on your Mobile (Android/iOS), Tablet, or Laptop for 1-tap instant offline access to all 8 semester notes, PYQs, and syllabi.</p>
              </div>
            </div>
            <div class="pwa-install-actions">
              <button class="btn-pwa-install" onclick="window.installPwa()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                ⚡ Install App
              </button>
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
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_cse_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech CSE Structure & Syllabus 2024-25')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </button>
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
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_cse_aiml_syllabus.pdf', 'Official DDU B.Tech CSE (AIML) Syllabus')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </button>
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
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_cse_aids_syllabus.pdf', 'Official DDU B.Tech CSE (AI & DS) Syllabus')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </button>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #06b6d4;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <span style="font-size: 0.72rem; font-weight: 800; background: rgba(6, 182, 212, 0.15); color: #06b6d4; padding: 3px 8px; border-radius: 4px;">4-YEAR B.TECH IT</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Official DDU PDF</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
                  B.Tech Information Technology (Session 2024-25)
                </h3>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
                  Four-year degree scheme covering Network Architecture, Cloud Systems, Operating Systems, Information Security, Web Engineering, and Full-Stack development.
                </p>
              </div>
              <div style="display: flex; gap: 10px; margin-top: auto;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_it_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech IT Structure & Syllabus 2024-25')" class="btn-primary btn-sm" style="flex: 1;">
                  👁️ Read Online
                </button>
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_it_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech IT Structure & Syllabus 2024-25')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </button>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #f97316;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <span style="font-size: 0.72rem; font-weight: 800; background: rgba(249, 115, 22, 0.15); color: #f97316; padding: 3px 8px; border-radius: 4px;">4-YEAR B.TECH ME</span>
                  <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Official DDU PDF</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
                  B.Tech Mechanical Engineering (Session 2024-25)
                </h3>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
                  Comprehensive 4-year curriculum covering Thermodynamics, Fluid Mechanics, Theory of Machines, CAD/CAM, Robotics, Heat Transfer & Industrial Automation.
                </p>
              </div>
              <div style="display: flex; gap: 10px; margin-top: auto;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_me_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech ME Structure & Syllabus 2024-25')" class="btn-primary btn-sm" style="flex: 1;">
                  👁️ Read Online
                </button>
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_me_structure_syllabus_2024_25.pdf', 'Official DDU B.Tech ME Structure & Syllabus 2024-25')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </button>
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
                <button onclick="App.downloadFile('/static/uploads/ddu_official_mtech_cse_syllabus.pdf', 'Official DDU M.Tech CSE Syllabus')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">
                  ⬇ Download
                </button>
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
  },

  // 1C. Load Home Updates
  async loadHomeUpdates() {
    const listEl = document.getElementById("home-updates-list");
    if (!listEl) return;

    if (!Auth.currentUser) {
      listEl.innerHTML = `
        <div style="background: var(--bg-card); border: 2px dashed rgba(217, 119, 6, 0.4); border-radius: var(--radius-md); padding: 32px 20px; text-align: center; margin: 12px 0;">
          <span style="font-size: 2.2rem; display: block; margin-bottom: 8px;">🔒</span>
          <div style="font-weight: 800; font-size: 1.05rem; color: var(--text-main); margin-bottom: 6px;">Daily Academic Notices & Campus Updates Locked</div>
          <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 480px; margin: 0 auto 16px; line-height: 1.5;">
            DDU Gorakhpur University ki sabhi daily campus notices, examination circulars aur updates dekhne ke liye kripya pehle Apna Student Account Login karein.
          </p>
          <div style="display: flex; justify-content: center; gap: 10px;">
            <button onclick="Auth.openModal('login')" class="btn-primary btn-sm" style="font-weight: 700; padding: 8px 18px;">
              🔑 Student Login
            </button>
            <button onclick="Auth.openModal('register')" class="btn-secondary btn-sm" style="font-weight: 600; padding: 8px 14px;">
              ✨ Register Free
            </button>
          </div>
        </div>
      `;
      return;
    }

    try {
      const data = await this.safeFetch("/api/updates");
      const updates = (data.updates || []).slice(0, 3);
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
                    ${u.attachment_url ? (() => {
                      const cPath = (u.attachment_url || '').split('?')[0].toLowerCase();
                      const isImg = cPath.endsWith('.png') || cPath.endsWith('.jpg') || cPath.endsWith('.jpeg') || cPath.endsWith('.webp') || cPath.endsWith('.gif');
                      return `
                        <button onclick="App.openPdfViewer('${u.attachment_url}', '${escapeHtml(u.title)}')" class="btn-secondary btn-sm" style="padding: 4px 10px; font-size: 0.78rem;">
                          ${isImg ? '🖼️ View Image' : '📄 View Attachment'}
                        </button>
                      `;
                    })() : ''}
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
    if (!Auth.currentUser) {
      this.renderLockGate(container, "B.Tech Academic Semesters Curriculum Locked", "DDU Gorakhpur University 1st to 8th Semester curriculum aur subjects dekhne ke liye kripya pehle Student Login karein.");
      Auth.openModal("login");
      return;
    }
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
    if (!Auth.currentUser) {
      this.renderLockGate(container, `Semester ${semNumber} Study Materials Locked`, `DDU B.Tech Semester ${semNumber} ke unit-wise notes, syllabus aur PYQs dekhne ke liye kripya pehle Apna Student Account Login karein.`);
      Auth.openModal("login");
      return;
    }
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

      subjectsEl.innerHTML = `
        ${!Auth.currentUser ? `
          <div style="background: linear-gradient(135deg, rgba(30, 64, 175, 0.1), rgba(217, 119, 6, 0.14)); border: 1.5px solid rgba(217, 119, 6, 0.45); border-radius: var(--radius-md); padding: 16px 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 1.8rem;">🔐</span>
              <div>
                <div style="font-weight: 800; color: var(--accent-amber); font-size: 0.98rem; font-family: 'Outfit', sans-serif;">
                  Semester ${semNumber} Notes & PDFs Access Locked
                </div>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
                  Unit-wise lecture notes aur PDFs access karne ke liye kripya pehle Apna Free Student Account banayein ya Login karein.
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 10px;">
              <button onclick="Auth.openModal('register')" class="btn-primary btn-sm" style="font-weight: 800; padding: 8px 16px;">✨ Free Register</button>
              <button onclick="Auth.openModal('login')" class="btn-secondary btn-sm" style="font-weight: 700; padding: 8px 14px;">🔑 Log In</button>
            </div>
          </div>
        ` : ''}
        ${detailedSubjects.map(sub => `
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
              <button onclick="App.openSubmitNoteModal(${sub.id})" class="btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 5px; font-weight: 700;">
                <span>+</span> Add Notes
              </button>
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
                    ${!Auth.currentUser ? `
                      <div style="background: rgba(217, 119, 6, 0.08); border: 1px dashed rgba(217, 119, 6, 0.4); border-radius: var(--radius-sm); padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <span>🔒</span>
                          <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-main);">
                            ${unitNotes.length} study note${unitNotes.length === 1 ? '' : 's'} available (Locked)
                          </span>
                        </div>
                        <button onclick="Auth.openModal('register'); App.toast('Unit notes aur PDF dekhne ke liye kripya pehle Register / Login karein.', 'warning');" class="btn-primary btn-sm" style="font-size: 0.75rem; padding: 5px 12px; font-weight: 700;">
                          Register to Unlock →
                        </button>
                      </div>
                    ` : unitNotes.length === 0 ? `
                      <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; padding: 4px 0;">
                        Notes currently being curated for Unit ${u.unit_number}.
                      </div>
                    ` : unitNotes.map(n => `
                      <div class="note-row">
                        <div class="note-info">
                          <span style="font-size: 1.1rem;">📄</span>
                          <div>
                            <div class="note-title">${escapeHtml(n.title)}</div>
                            <div style="font-size: 0.76rem; color: var(--primary); font-weight: 500; margin-top: 2px;">
                              Detailed notes will be shared in PDF format shortly.
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                              ${n.file_size || 'PDF'}
                            </div>
                            ${n.contributed_by_name ? `
                              <div style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.7rem; background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald); border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 7px; border-radius: 99px; margin-top: 3px; font-weight: 600;">
                                <span>🌟 Contributed by ${escapeHtml(n.contributed_by_name)}</span>
                                <span style="font-weight: 800;">✓ Verified</span>
                              </div>
                            ` : ''}
                          </div>
                          ${n.is_important ? `<span class="update-badge-important">Important</span>` : ''}
                        </div>
                        <div class="note-actions">
                          <button onclick="App.openPdfViewer('${n.file_url}', '${escapeHtml(n.title)}', ${n.id})" class="btn-secondary btn-sm">
                            View PDF
                          </button>
                          <button onclick="App.downloadFile('${n.file_url}', '${escapeHtml(n.title)}', ${n.id})" class="btn-primary btn-sm">
                            Download
                          </button>
                          <button onclick="App.shareNote(${n.id}, '${escapeHtml(n.title)}')" class="btn-secondary btn-sm" title="Share Note" style="display: inline-flex; align-items: center; gap: 4px;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            Share
                          </button>
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
      `).join('')}`;

    } catch (e) {
      const el = document.getElementById("semester-subjects-container");
      if (el) el.innerHTML = `<p style="color: var(--accent-rose);">Failed to load semester curriculum: ${e.message}</p>`;
    }
  },

  // ------------------- 4. Syllabus Section -------------------
  async renderSyllabus(container) {
    if (!Auth.currentUser) {
      this.renderLockGate(container, "Official CBCS Syllabus Curricula Locked", "Official university course scheme aur subject-wise syllabus dekhne ke liye kripya pehle Student Login karein.");
      Auth.openModal("login");
      return;
    }
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
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_cse_structure_syllabus_2024_25.pdf', 'B.Tech CSE Structure & Syllabus 2024-25')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</button>
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
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_cse_aiml_syllabus.pdf', 'B.Tech CSE (AIML) Syllabus')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</button>
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
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_cse_aids_syllabus.pdf', 'B.Tech CSE (AI & DS) Syllabus')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</button>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #06b6d4;">
              <div>
                <span style="font-size: 0.72rem; font-weight: 800; background: rgba(6, 182, 212, 0.15); color: #06b6d4; padding: 3px 8px; border-radius: 4px;">4-YEAR B.TECH IT</span>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 8px 0 4px;">B.Tech Information Technology (2024-25)</h4>
                <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">Full 8-semester structure, Network Architecture, Cloud Systems, Cyber Defense & Web Engineering.</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_it_structure_syllabus_2024_25.pdf', 'B.Tech IT Structure & Syllabus 2024-25')" class="btn-primary btn-sm" style="flex: 1;">👁️ View</button>
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_it_structure_syllabus_2024_25.pdf', 'B.Tech IT Structure & Syllabus 2024-25')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</button>
              </div>
            </div>

            <div class="official-syllabus-card" style="border-left-color: #f97316;">
              <div>
                <span style="font-size: 0.72rem; font-weight: 800; background: rgba(249, 115, 22, 0.15); color: #f97316; padding: 3px 8px; border-radius: 4px;">4-YEAR B.TECH ME</span>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 8px 0 4px;">B.Tech Mechanical Engineering (2024-25)</h4>
                <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">Full 8-semester structure, Thermodynamics, SOM, Fluid Mechanics, CAD/CAM, Robotics & Automation.</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button onclick="App.openPdfViewer('/static/uploads/ddu_official_btech_me_structure_syllabus_2024_25.pdf', 'B.Tech ME Structure & Syllabus 2024-25')" class="btn-primary btn-sm" style="flex: 1;">👁️ View</button>
                <button onclick="App.downloadFile('/static/uploads/ddu_official_btech_me_structure_syllabus_2024_25.pdf', 'B.Tech ME Structure & Syllabus 2024-25')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</button>
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
                <button onclick="App.downloadFile('/static/uploads/ddu_official_mtech_cse_syllabus.pdf', 'M.Tech CSE Syllabus')" class="btn-secondary btn-sm" style="flex: 1; text-align: center;">⬇ Download</button>
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
          <select id="syl-branch-filter" onchange="App.filterSyllabus()" class="form-control" style="max-width: 240px;">
            <option value="">All Branches</option>
            <option value="CSE">Computer Science & Engg (CSE)</option>
            <option value="IT">Information Technology (IT)</option>
            <option value="ME">Mechanical Engineering (ME)</option>
            <option value="ECE">Electronics & Communication (ECE)</option>
            <option value="EE">Electrical Engineering (EE)</option>
            <option value="CE">Civil Engineering (CE)</option>
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
    const branchFilter = document.getElementById("syl-branch-filter");
    const semId = semFilter ? semFilter.value : "";
    const branch = branchFilter ? branchFilter.value : "";
    const listEl = document.getElementById("syllabus-list-container");
    if (!listEl) return;

    try {
      const params = [];
      if (semId) params.push(`semester_id=${semId}`);
      if (branch) params.push(`branch=${encodeURIComponent(branch)}`);
      const url = params.length > 0 ? `/api/syllabus?${params.join('&')}` : "/api/syllabus";
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
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <div style="font-weight: 700; font-size: 1rem; color: var(--text-main);">${escapeHtml(s.title)}</div>
                ${s.branch || s.subject_branch ? `
                  <span style="font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: rgba(59, 130, 246, 0.15); color: var(--primary);">
                    ${escapeHtml(s.branch && s.branch !== 'All Branches' ? s.branch : (s.subject_branch || 'All Branches'))}
                  </span>
                ` : ''}
              </div>
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
            <button onclick="App.downloadFile('${s.file_url}', '${escapeHtml(s.title)}')" class="btn-primary">
              Download PDF
            </button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      listEl.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- 5. All Notes Explorer -------------------
  async renderNotes(container) {
    if (!Auth.currentUser) {
      this.renderLockGate(container, "B.Tech Lecture Notes & Study Materials Locked", "DDU Gorakhpur University ke B.Tech semester notes dekhne ke liye kripya pehle Student Login karein ya Register karein.");
      Auth.openModal("login");
      return;
    }
    container.innerHTML = `
      <div class="container" style="padding: 40px 20px 80px;">
        <div class="section-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px;">
          <div>
            <span class="section-tag">Repository</span>
            <h1 class="section-title">B.Tech Notes & Study Materials</h1>
            <p class="section-description">
              Search and filter notes by semester, branch, subject, and unit modules.
            </p>
          </div>
          <button onclick="App.openSubmitNoteModal()" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700; padding: 10px 18px; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
            <span style="font-size: 1.15rem; line-height: 1;">+</span> Add / Contribute Notes
          </button>
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
              <div style="font-size: 0.78rem; color: var(--primary); font-weight: 500; margin-top: 2px;">
                Detailed notes will be shared in PDF format shortly.
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                ${escapeHtml(n.subject_name)} • Sem ${n.semester_number} • ${n.unit_number ? `Unit ${n.unit_number}` : 'General'} • ${n.file_size || 'PDF'}
              </div>
              ${n.contributed_by_name ? `
                <div style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald); border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 8px; border-radius: 99px; margin-top: 4px; font-weight: 600;">
                  <span>🌟 Contributed by ${escapeHtml(n.contributed_by_name)}</span>
                  <span style="font-weight: 800; color: var(--accent-emerald);">✓ Verified</span>
                </div>
              ` : ''}
            </div>
            ${n.is_important ? `<span class="update-badge-important">Important</span>` : ''}
          </div>
          <div class="note-actions">
            <button onclick="App.openPdfViewer('${n.file_url}', '${escapeHtml(n.title)}', ${n.id})" class="btn-secondary btn-sm">
              View PDF
            </button>
            <button onclick="App.downloadFile('${n.file_url}', '${escapeHtml(n.title)}', ${n.id})" class="btn-primary btn-sm">
              Download
            </button>
            <button onclick="App.shareNote(${n.id}, '${escapeHtml(n.title)}')" class="btn-secondary btn-sm" title="Share Note" style="display: inline-flex; align-items: center; gap: 4px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share
            </button>
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
    if (!Auth.currentUser) {
      this.renderLockGate(container, "Previous Year Question Papers (2021-2025) Locked", "DDU B.Tech 5-year end-term examination question papers aur answer keys download karne ke liye kripya pehle Student Login karein.");
      Auth.openModal("login");
      return;
    }
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
              <button onclick="App.downloadFile('${p.file_url}', '${escapeHtml(p.paper_title)}')" class="btn-primary btn-sm">
                Download
              </button>
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
    if (!Auth.currentUser) {
      this.renderLockGate(
        container,
        "Daily Academic Notices & Campus Updates Locked",
        "DDU Gorakhpur University ki sabhi daily campus notices, examination schedules aur departmental circulars dekhne ke liye kripya pehle Apna Student Account Login karein ya Register karein."
      );
      Auth.openModal("login");
      return;
    }

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

              ${u.attachment_url ? (() => {
                const cPath = (u.attachment_url || '').split('?')[0].toLowerCase();
                const isImg = cPath.endsWith('.png') || cPath.endsWith('.jpg') || cPath.endsWith('.jpeg') || cPath.endsWith('.webp') || cPath.endsWith('.gif');
                return `
                  <div style="margin-top: 10px;">
                    ${isImg ? `
                      <div style="margin-bottom: 8px; max-width: 320px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border); box-shadow: var(--shadow-sm); cursor: pointer;" onclick="App.openPdfViewer('${u.attachment_url}', '${escapeHtml(u.title)}')">
                        <img src="${u.attachment_url}" alt="Notice Preview" style="width: 100%; height: auto; display: block; max-height: 220px; object-fit: cover;" onerror="this.style.display='none'">
                      </div>
                    ` : ''}
                    <button onclick="App.openPdfViewer('${u.attachment_url}', '${escapeHtml(u.title)}')" class="btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
                      ${isImg ? '🖼️ View Full Image / Notice' : '📄 View Official Attachment / Circular'}
                    </button>
                  </div>
                `;
              })() : ''}
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
          <h1 class="section-title">About the Platform &amp; Creator</h1>
          <p class="section-description">
            Complete academic overview, official university engineering department profile, and detailed architectural biography of platform founder &amp; lead developer — <strong>Keshav Narayan</strong>.
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
                <span class="brand-naac-badge" style="background: linear-gradient(135deg, #1e40af, #0284c7); color: #fff; font-weight: 800; letter-spacing: 0.5px; padding: 4px 10px;">⭐ FOUNDER &amp; LEAD ARCHITECT (MAIN CREATOR)</span>
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

            <!-- ==================== Big Detailed LinkedIn Profile & Contact For Me ==================== -->
            <div class="dev-linkedin-card" style="margin-top: 28px; background: linear-gradient(135deg, rgba(10, 102, 194, 0.08) 0%, rgba(10, 102, 194, 0.02) 100%); border: 1.5px solid rgba(10, 102, 194, 0.35); border-radius: var(--radius-lg); padding: 26px 28px; box-shadow: 0 8px 24px rgba(10, 102, 194, 0.08); position: relative; overflow: hidden;">
              <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #0a66c2, #0077b5, #004182);"></div>
              
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 18px;">
                <div style="display: flex; align-items: center; gap: 14px;">
                  <div style="width: 54px; height: 54px; border-radius: 12px; background: #0a66c2; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.7rem; font-weight: 800; box-shadow: 0 4px 12px rgba(10, 102, 194, 0.35); flex-shrink: 0;">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.2a1.65 1.65 0 0 0-1.66 1.66c0 .92.74 1.66 1.66 1.66.92 0 1.66-.74 1.66-1.66A1.65 1.65 0 0 0 7.83 6.2Z"/>
                    </svg>
                  </div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: #0a66c2; letter-spacing: 1px; background: rgba(10, 102, 194, 0.12); padding: 3px 8px; border-radius: 4px;">
                        LinkedIn Official Profile
                      </span>
                      <span style="color: #10b981; font-size: 0.78rem; font-weight: 700;">● Available for Opportunities</span>
                    </div>
                    <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-main); margin: 4px 0 2px;">
                      Keshav Narayan
                    </h3>
                    <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">
                      Lead Architect &amp; Software Engineer • B.Tech CSE (AI &amp; ML) at DDU Gorakhpur University
                    </div>
                  </div>
                </div>

                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" class="btn-primary" style="background: linear-gradient(135deg, #0a66c2 0%, #004182 100%); border-color: #0a66c2; padding: 12px 24px; font-weight: 800; font-size: 0.94rem; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(10, 102, 194, 0.35); text-decoration: none;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.2a1.65 1.65 0 0 0-1.66 1.66c0 .92.74 1.66 1.66 1.66.92 0 1.66-.74 1.66-1.66A1.65 1.65 0 0 0 7.83 6.2Z"/></svg>
                  Connect on LinkedIn ↗
                </a>
              </div>

              <!-- Contact For Me Details Section -->
              <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px 22px; margin-top: 14px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                  <span style="font-size: 1.2rem;">📬</span>
                  <h4 style="font-size: 1.02rem; font-weight: 800; color: var(--text-main); margin: 0;">
                    Contact For Me (Aap Mujhse In Cheezon Ke Liye Sampark Kar Sakte Hain):
                  </h4>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; font-size: 0.86rem; color: var(--text-muted); line-height: 1.6;">
                  <div style="display: flex; align-items: flex-start; gap: 10px; background: var(--bg-main); padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                    <span style="color: #0a66c2; font-weight: 800; font-size: 1.1rem; line-height: 1;">💻</span>
                    <div>
                      <strong style="color: var(--text-main); display: block; font-size: 0.88rem; margin-bottom: 2px;">Software Engineering &amp; AI/ML Projects:</strong>
                      Full-stack web applications, Python multithreaded systems, AI models, deep learning research, and cloud architecture.
                    </div>
                  </div>

                  <div style="display: flex; align-items: flex-start; gap: 10px; background: var(--bg-main); padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                    <span style="color: #0a66c2; font-weight: 800; font-size: 1.1rem; line-height: 1;">📚</span>
                    <div>
                      <strong style="color: var(--text-main); display: block; font-size: 0.88rem; margin-bottom: 2px;">Study Notes &amp; Academic Inquiries:</strong>
                      Missing semester unit notes, textbook modules, syllabus roadmaps, or previous 5-year question papers (PYQs).
                    </div>
                  </div>

                  <div style="display: flex; align-items: flex-start; gap: 10px; background: var(--bg-main); padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                    <span style="color: #0a66c2; font-weight: 800; font-size: 1.1rem; line-height: 1;">🤝</span>
                    <div>
                      <strong style="color: var(--text-main); display: block; font-size: 0.88rem; margin-bottom: 2px;">Technical Mentorship &amp; Collaborations:</strong>
                      Peer coding guidance, hackathon team partnerships, open-source projects, and student tech community workshops.
                    </div>
                  </div>

                  <div style="display: flex; align-items: flex-start; gap: 10px; background: var(--bg-main); padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                    <span style="color: #0a66c2; font-weight: 800; font-size: 1.1rem; line-height: 1;">💼</span>
                    <div>
                      <strong style="color: var(--text-main); display: block; font-size: 0.88rem; margin-bottom: 2px;">Internship &amp; Career Opportunities:</strong>
                      Available for high-impact software engineering roles, research fellowships, and technical project consultations.
                    </div>
                  </div>
                </div>
                
                <div style="margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                  <div style="font-size: 0.82rem; color: var(--text-muted);">
                    💬 <em>Aap mujhe direct LinkedIn par message bhej sakte hain — main sabhi messages ka jald se jald reply karta hoon!</em>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" class="btn-primary btn-sm" style="background: #0a66c2; border-color: #0a66c2; font-weight: 700; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 6px;">
                      Open LinkedIn Profile ↗
                    </a>
                    <button onclick="App.openFeedbackModal()" class="btn-secondary btn-sm" style="font-size: 0.82rem;">
                      ✉️ Send Portal Message
                    </button>
                  </div>
                </div>
              </div>
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
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" class="btn-primary" style="background: #0a66c2; border-color: #0a66c2; padding: 10px 18px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px; font-weight: 700;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.2a1.65 1.65 0 0 0-1.66 1.66c0 .92.74 1.66 1.66 1.66.92 0 1.66-.74 1.66-1.66A1.65 1.65 0 0 0 7.83 6.2Z"/></svg>
                  Connect on LinkedIn
                </a>
                <button onclick="App.openFeedbackModal()" class="btn-secondary" style="padding: 10px 18px; font-size: 0.85rem;">
                  ✉️ Send Direct Message
                </button>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="padding: 10px 16px; font-size: 0.85rem;">
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== Supporting Co-Founder: AKASH YADAV ==================== -->
        <div style="margin-top: 24px; background: var(--bg-card); border: 1px solid var(--border); border-left: 4px solid #10b981; border-radius: var(--radius-md); padding: 18px 22px; box-shadow: var(--shadow-sm); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #059669); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.95rem; flex-shrink: 0; box-shadow: 0 2px 8px rgba(16,185,129,0.25);">
              AY
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 0;">AKASH YADAV</h4>
                <span style="font-size: 0.7rem; font-weight: 800; background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.3); padding: 1px 7px; border-radius: 4px;">CO-FOUNDER</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                B.Tech Computer Science &amp; Engineering, DDUGU • Student Community &amp; Resource Outreach
              </div>
            </div>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); max-width: 440px; line-height: 1.5; font-style: italic;">
            "Contributed towards student outreach, community coordination, and academic study material curation for DDU B.Tech Notes Hub."
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
                    <div style="font-size: 0.72rem; color: var(--primary); font-weight: 500;">Detailed notes will be shared in PDF format shortly.</div>
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

  getGoogleDriveId(url) {
    if (!url || typeof url !== 'string') return null;
    const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m1) return m1[1];
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) return m2[1];
    const m3 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m3) return m3[1];
    return null;
  },

  isGoogleDriveUrl(url) {
    return !!this.getGoogleDriveId(url);
  },

  getDownloadUrl(url) {
    if (!url) return "#";
    const driveId = this.getGoogleDriveId(url);
    if (driveId) {
      return `https://drive.google.com/uc?export=download&id=${driveId}`;
    }
    return url;
  },

  // ------------------- PDF Viewer Modal -------------------
  openPdfViewer(fileUrl, title = "Document Preview", noteId = null, isDirectShared = false) {
    if (!Auth.currentUser && !isDirectShared) {
      Auth.openModal("login");
      this.toast("Study notes aur documents dekhne ke liye kripya pahle Student Login karein.", "warning");
      return;
    }
    this.currentPdfNote = { fileUrl, title, noteId };
    const modal = document.getElementById("pdf-viewer-modal");
    if (!modal) return;
    const titleEl = document.getElementById("pdf-viewer-title");
    const frame = document.getElementById("pdf-viewer-frame");
    const imgEl = document.getElementById("pdf-viewer-image");
    const downloadBtn = document.getElementById("pdf-viewer-download-link");
    const externalBtn = document.getElementById("pdf-viewer-external-link");
    const mobileTip = document.getElementById("pdf-viewer-mobile-tip");

    fileUrl = (fileUrl || "").trim();
    if (!fileUrl) {
      App.toast("Study document link is currently being prepared.", "info");
      return;
    }
    if (titleEl) titleEl.innerText = title;

    const driveId = this.getGoogleDriveId(fileUrl);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const cleanUrlPath = fileUrl.split("?")[0].toLowerCase();
    const isImage = cleanUrlPath.endsWith(".png") || cleanUrlPath.endsWith(".jpg") || cleanUrlPath.endsWith(".jpeg") || cleanUrlPath.endsWith(".webp") || cleanUrlPath.endsWith(".gif");

    let embedUrl = fileUrl;
    let externalUrl = fileUrl;
    let downloadUrl = fileUrl;

    if (driveId) {
      embedUrl = `https://drive.google.com/file/d/${driveId}/preview`;
      externalUrl = `https://drive.google.com/file/d/${driveId}/view?usp=sharing`;
      downloadUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;
    } else {
      const absoluteUrl = (fileUrl.startsWith("http://") || fileUrl.startsWith("https://"))
        ? fileUrl
        : (window.location.origin + (fileUrl.startsWith("/") ? "" : "/") + fileUrl);
      externalUrl = absoluteUrl;
      downloadUrl = absoluteUrl;
      if (isImage) {
        embedUrl = absoluteUrl;
      } else if (isMobile && absoluteUrl.startsWith("https://") && !absoluteUrl.includes("localhost") && !absoluteUrl.includes("127.0.0.1")) {
        embedUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;
      } else {
        embedUrl = absoluteUrl;
      }
    }

    if (isImage && !driveId) {
      if (frame) {
        frame.style.display = "none";
        frame.src = "about:blank";
      }
      if (imgEl) {
        imgEl.src = embedUrl;
        imgEl.style.display = "block";
      }
    } else {
      if (imgEl) {
        imgEl.style.display = "none";
        imgEl.src = "";
      }
      if (frame) {
        frame.style.display = "block";
        frame.src = embedUrl;
      }
    }

    if (downloadBtn) {
      downloadBtn.href = downloadUrl;
      downloadBtn.innerHTML = isImage
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Image`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Document`;
      if (driveId) {
        downloadBtn.removeAttribute("download");
        downloadBtn.target = "_blank";
        downloadBtn.rel = "noopener noreferrer";
      } else {
        downloadBtn.setAttribute("download", "");
        downloadBtn.removeAttribute("target");
        downloadBtn.removeAttribute("rel");
      }
    }

    if (externalBtn) {
      externalBtn.href = externalUrl;
      externalBtn.target = "_blank";
      externalBtn.rel = "noopener noreferrer";
    }

    if (mobileTip) {
      mobileTip.style.display = "none";
      mobileTip.innerHTML = "";
    }

    if (noteId) {
      this.recordDownload(noteId);
    }

    modal.classList.add("active");
  },

  // ------------------- Secure File Download -------------------
  downloadFile(fileUrl, title = "Document", noteId = null) {
    if (!Auth.currentUser) {
      Auth.openModal("login");
      this.toast("Study notes aur documents download karne ke liye kripya pahle Student Login karein.", "warning");
      return;
    }
    if (noteId) {
      this.recordDownload(noteId);
    }
    const downloadUrl = this.getDownloadUrl(fileUrl);
    if (this.isGoogleDriveUrl(fileUrl)) {
      window.open(downloadUrl, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
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

  // ------------------- Note Sharing Engine with 1st Page Preview -------------------
  slugify(text) {
    if (!text) return "chapter-notes";
    return text
      .toString()
      .trim()
      .replace(/[\/\\#?&]/g, "-") // replace URL path and query delimiters
      .replace(/[^\w\s-]/g, "")    // strip non-alphanumeric except space and hyphen
      .replace(/[\s_-]+/g, "-")    // collapse spaces and underscores into hyphens
      .replace(/^-+|-+$/g, "");    // trim leading and trailing hyphens
  },

  shareCurrentPdf() {
    if (!this.currentPdfNote) {
      this.toast("No active document to share", "info");
      return;
    }
    const { noteId, title, fileUrl } = this.currentPdfNote;
    this.shareNote(noteId, title, fileUrl);
  },

  async shareNote(noteId, title, fileUrl = "") {
    const topic = (title || "Study Note").trim();
    const topicSlug = this.slugify(topic);

    // Requirement: "link me chapter(topic)name aaye"
    // Direct website URL pointing to this specific note, with the chapter/topic name slug right in the link!
    const origin = window.location.origin;
    const pathname = window.location.pathname.replace(/\/+$/, "");
    const shareUrl = noteId 
      ? `${origin}/note/${noteId}/${topicSlug}`
      : `${origin}${pathname}/#preview/${topicSlug}`;

    this.currentShareData = { noteId, topic, shareUrl, fileUrl, topicSlug };

    // Find note metadata for 1st page preview
    let noteMeta = null;
    if (noteId && window.DDU_DATA && window.DDU_DATA.notes) {
      noteMeta = window.DDU_DATA.notes.find(n => n.id === noteId);
      if (noteMeta) {
        const sub = (window.DDU_DATA.subjects || []).find(s => s.id === noteMeta.subject_id);
        if (sub) {
          noteMeta.subject_name = sub.name;
          noteMeta.subject_code = sub.code;
          noteMeta.semester_number = sub.semester_id;
        }
      }
    }

    // Open sleek Share Modal with 1st page preview and chapter-slugged link
    this.openShareModal(topic, shareUrl, fileUrl, noteMeta);
  },

  openShareModal(topic, shareUrl, fileUrl = "", noteMeta = null) {
    const modal = document.getElementById("share-modal");
    const topicEl = document.getElementById("share-modal-topic");
    const urlInput = document.getElementById("share-modal-url");
    const waLink = document.getElementById("share-modal-whatsapp");
    const tgLink = document.getElementById("share-modal-telegram");
    const subcodeEl = document.getElementById("share-modal-subcode");
    const semEl = document.getElementById("share-modal-sem");
    const descPreviewEl = document.getElementById("share-modal-desc-preview");
    const frameWrapper = document.getElementById("share-pdf-frame-wrapper");
    const frameEl = document.getElementById("share-modal-pdf-frame");
    const nativeBtn = document.getElementById("share-modal-native-btn");

    if (topicEl) topicEl.innerText = topic;
    if (urlInput) urlInput.value = shareUrl;

    if (noteMeta) {
      if (subcodeEl) subcodeEl.innerText = noteMeta.subject_code || (noteMeta.subject_name || "B.Tech");
      if (semEl) semEl.innerText = `Semester ${noteMeta.semester_number || 1}`;
      if (descPreviewEl && noteMeta.description) {
        descPreviewEl.innerText = noteMeta.description;
      }
      if (!fileUrl && noteMeta.file_url) {
        fileUrl = noteMeta.file_url;
      }
    } else {
      if (subcodeEl) subcodeEl.innerText = "B.Tech";
      if (semEl) semEl.innerText = "Semester Notes";
    }

    // Requirement: "jab share karu pdf to 1st page bhi thoda show"
    // If PDF file URL is available, load 1st page preview in embedded frame
    if (fileUrl && fileUrl.toLowerCase().includes(".pdf") && frameWrapper && frameEl) {
      frameWrapper.style.display = "block";
      const cleanUrl = fileUrl.startsWith("http") ? fileUrl : (window.location.origin + (fileUrl.startsWith("/") ? "" : "/") + fileUrl);
      frameEl.src = `${cleanUrl}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`;
    } else if (frameWrapper) {
      frameWrapper.style.display = "none";
    }

    // Direct WhatsApp share - strictly note topic and direct website link with chapter name
    if (waLink) {
      const waText = encodeURIComponent(`*${topic}*\n📄 DDU Gorakhpur University B.Tech Study Material (1st Page Preview):\n${shareUrl}`);
      waLink.href = `https://api.whatsapp.com/send?text=${waText}`;
    }

    // Direct Telegram share - strictly note topic and URL
    if (tgLink) {
      tgLink.href = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(topic + " (DDU B.Tech Notes)")}`;
    }

    // Native Web Share button
    if (nativeBtn) {
      if (navigator.share) {
        nativeBtn.style.display = "inline-flex";
      } else {
        nativeBtn.style.display = "none";
      }
    }

    if (modal) {
      modal.classList.add("active");
    } else {
      this.copyShareUrl(shareUrl, topic);
    }
  },

  async triggerNativeShare() {
    if (!navigator.share || !this.currentShareData) return;
    try {
      await navigator.share({
        title: this.currentShareData.topic,
        text: `*${this.currentShareData.topic}* — DDU B.Tech Study Notes`,
        url: this.currentShareData.shareUrl
      });
    } catch (e) {
      if (e.name !== 'AbortError') {
        this.copyShareUrl(this.currentShareData.shareUrl, this.currentShareData.topic);
      }
    }
  },

  async copyShareUrl(customUrl = null, customTopic = null) {
    const urlInput = document.getElementById("share-modal-url");
    const shareUrl = customUrl || (urlInput ? urlInput.value : window.location.href);
    const topic = customTopic || document.getElementById("share-modal-topic")?.innerText || "";
    // Strictly topic and website link
    const copyText = topic ? `${topic}\n${shareUrl}` : shareUrl;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else if (urlInput) {
        urlInput.select();
        document.execCommand("copy");
      }
      const copyBtn = document.getElementById("share-modal-copy-btn");
      if (copyBtn) {
        const orig = copyBtn.innerText;
        copyBtn.innerText = "✓ Copied!";
        copyBtn.style.background = "var(--accent-emerald)";
        setTimeout(() => {
          copyBtn.innerText = orig;
          copyBtn.style.background = "";
        }, 2000);
      }
      this.toast("Note link copied! Chapter name included in URL.", "success");
    } catch (e) {
      if (urlInput) {
        urlInput.select();
        document.execCommand("copy");
        this.toast("Note link copied to clipboard!", "success");
      }
    }
  },

  sharedViewerIsGdocs: false,
  toggleSharedViewerMode(directUrl, gdocsUrl) {
    const frame = document.getElementById("shared-note-web-pdf-frame");
    const btn = document.getElementById("btn-shared-toggle-viewer");
    if (!frame) return;
    if (this.sharedViewerIsGdocs) {
      frame.src = directUrl + "#view=FitH&toolbar=1";
      if (btn) btn.innerText = "🔄 Switch to Google Docs Viewer";
      this.sharedViewerIsGdocs = false;
    } else {
      frame.src = gdocsUrl;
      if (btn) btn.innerText = "🔄 Switch to Native PDF";
      this.sharedViewerIsGdocs = true;
    }
  },

  // ------------------- Shared Note Direct Landing -------------------
  async renderSharedNote(container, noteId) {
    if (!noteId || isNaN(noteId)) {
      window.location.hash = "#notes";
      return;
    }

    container.innerHTML = `
      <div class="container" style="padding: 40px 20px 80px; max-width: 900px; margin: 0 auto;">
        <div style="text-align: center; padding: 60px 0;">
          <div class="loading-spinner" style="margin: 0 auto 12px;"></div>
          <p style="color: var(--text-muted); font-size: 0.95rem;">Opening note on DDU B.Tech Notes Hub...</p>
        </div>
      </div>
    `;

    let note = null;
    try {
      const res = await fetch(`/api/notes?id=${noteId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.notes && data.notes.length > 0) {
          note = data.notes[0];
        } else if (data.note) {
          note = data.note;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch shared note via API, checking fallback:", e);
    }

    // Fallback to window.DDU_DATA
    if (!note && window.DDU_DATA && window.DDU_DATA.notes) {
      note = window.DDU_DATA.notes.find(n => n.id === noteId);
      if (note) {
        const sub = (window.DDU_DATA.subjects || []).find(s => s.id === note.subject_id);
        if (sub) {
          note.subject_name = sub.name;
          note.subject_code = sub.code;
          note.semester_number = sub.semester_id;
        }
      }
    }

    if (!note) {
      container.innerHTML = `
        <div class="container" style="padding: 60px 20px; text-align: center; max-width: 600px; margin: 0 auto;">
          <div style="font-size: 3rem; margin-bottom: 12px;">📄</div>
          <h2 style="font-size: 1.6rem; font-weight: 800; margin-bottom: 10px;">Study Note Not Found</h2>
          <p style="color: var(--text-muted); margin-bottom: 24px; font-size: 0.95rem;">
            The requested note might have been updated or moved. You can browse all verified semester notes from the portal.
          </p>
          <a href="#notes" class="btn-primary">Browse All Notes Explorer</a>
        </div>
      `;
      return;
    }

    const rawFileUrl = note.file_url || "";
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const absolutePdfUrl = rawFileUrl ? (rawFileUrl.startsWith("http") ? rawFileUrl : (window.location.origin + (rawFileUrl.startsWith("/") ? "" : "/") + rawFileUrl)) : "";
    const gdocsEmbedUrl = absolutePdfUrl ? `https://docs.google.com/viewer?url=${encodeURIComponent(absolutePdfUrl)}&embedded=true` : "";
    const defaultEmbedUrl = isMobileDevice ? gdocsEmbedUrl : (absolutePdfUrl ? `${absolutePdfUrl}#view=FitH&toolbar=1` : "");

    // Render Shared Note Card & Exploration Options
    container.innerHTML = `
      <div class="container" style="padding: 30px 16px 80px; max-width: 1000px; margin: 0 auto;">
        
        <!-- Navigation Link -->
        <div style="margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <a href="#notes" class="btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
            ← Back to All Notes Explorer
          </a>
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            DDU B.Tech Notes Hub • Official Portal
          </span>
        </div>

        <!-- Shared Note Hero Card -->
        <div style="background: var(--bg-card); border: 2px solid var(--primary-light); border-radius: var(--radius-lg); padding: 26px 24px; box-shadow: 0 10px 30px rgba(37, 99, 235, 0.08); margin-bottom: 24px; position: relative;">
          
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
            <span style="background: rgba(37, 99, 235, 0.12); color: var(--primary); font-weight: 700; font-size: 0.78rem; padding: 4px 10px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.5px;">
              Study Note
            </span>
            <span class="subject-code-tag" style="margin: 0; font-size: 0.8rem;">
              ${escapeHtml(note.subject_code || 'B.Tech')}
            </span>
            <span style="font-size: 0.82rem; color: var(--accent-emerald); font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
              <span>✓</span> Verified Material
            </span>
          </div>

          <h1 style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); line-height: 1.3; margin-bottom: 8px;">
            ${escapeHtml(note.title)}
          </h1>

          <div style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 18px;">
            ${escapeHtml(note.subject_name || '')} • Semester ${note.semester_number || '1'} • ${note.unit_title || (note.unit_number ? 'Unit ' + note.unit_number : 'General')} • ${note.file_size || 'PDF'}
          </div>

          <!-- ================= DIRECT IN-PAGE WEB PDF VIEWER ================= -->
          <div style="margin: 20px 0; border: 2px solid var(--primary); border-radius: var(--radius-md); overflow: hidden; background: #1e293b; box-shadow: 0 8px 30px rgba(0,0,0,0.25);">
            
            <!-- Viewer Toolbar -->
            <div style="background: linear-gradient(135deg, #1e40af, #0284c7); padding: 10px 16px; color: #ffffff; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 700;">
                <span>📖</span>
                <span>In-Page Web PDF Viewer</span>
                <span style="background: rgba(255,255,255,0.2); padding: 2px 7px; border-radius: 10px; font-size: 0.7rem;">Live</span>
              </div>
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <button onclick="App.toggleSharedViewerMode('${absolutePdfUrl}', '${gdocsEmbedUrl}')" id="btn-shared-toggle-viewer" class="btn-secondary btn-sm" style="background: rgba(255,255,255,0.18); color: #fff; border: none; padding: 5px 10px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                  🔄 Switch Viewer
                </button>
                <a href="${absolutePdfUrl}" target="_blank" class="btn-secondary btn-sm" style="background: rgba(255,255,255,0.18); color: #fff; border: none; padding: 5px 10px; font-size: 0.75rem; font-weight: 700; text-decoration: none;">
                  ↗ Fullscreen
                </a>
                <a href="${absolutePdfUrl}" target="_blank" download class="btn-secondary btn-sm" style="background: #ffffff; color: #1e40af; border: none; padding: 5px 12px; font-size: 0.75rem; font-weight: 800; text-decoration: none;">
                  ⬇ Download PDF
                </a>
              </div>
            </div>

            <!-- In-Page PDF Frame (Visible directly on web page) -->
            <div style="height: 75vh; min-height: 560px; max-height: 850px; background: #334155; position: relative;">
              ${absolutePdfUrl ? `
                <iframe id="shared-note-web-pdf-frame" src="${defaultEmbedUrl}" style="width: 100%; height: 100%; border: none; display: block;" title="Direct Web PDF Reader" allow="fullscreen"></iframe>
              ` : `
                <div style="padding: 40px; text-align: center; color: #94a3b8;">
                  <p>Document is being prepared for online viewing.</p>
                </div>
              `}
            </div>

            <!-- Viewer Bottom Tip -->
            <div style="background: #0f172a; padding: 8px 16px; font-size: 0.78rem; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
              <span>📄 Note: Agar browser me document render na ho, 'Switch Viewer' dabayein ya direct download karein.</span>
              <button onclick="App.copyShareUrl('${window.location.origin}/note/${note.id}/${App.slugify(note.title)}')" style="background: #1e293b; border: 1px solid #334155; color: #38bdf8; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: 600;">
                🔗 Copy Share Link
              </button>
            </div>

          </div>

          <!-- Note Actions -->
          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding-top: 14px; border-top: 1px solid var(--border);">
            <button onclick="App.openPdfViewer('${note.file_url}', '${escapeHtml(note.title)}', ${note.id}, true)" class="btn-primary" style="padding: 12px 24px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; font-size: 0.95rem;">
              👁️ Open Modal Reader
            </button>
            <button onclick="App.downloadFile('${note.file_url}', '${escapeHtml(note.title)}', ${note.id})" class="btn-secondary" style="padding: 12px 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
              ⬇ Download PDF
            </button>
            <button onclick="App.shareNote(${note.id}, '${escapeHtml(note.title)}', '${note.file_url || ''}')" class="btn-secondary" style="padding: 12px 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share with Classmates
            </button>
            ${note.semester_number ? `
              <a href="#semester/${note.semester_number}" class="btn-secondary" style="padding: 12px 20px; font-weight: 700;">
                📚 All Sem ${note.semester_number} Notes
              </a>
            ` : ''}
          </div>
        </div>

        <!-- Student Onboarding Banner for Guests -->
        ${!Auth.currentUser ? `
          <div style="background: linear-gradient(135deg, rgba(30, 64, 175, 0.08), rgba(16, 185, 129, 0.08)); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 26px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <div style="max-width: 520px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="font-size: 1.4rem;">🎓</span>
                <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin: 0;">
                  DDU B.Tech Notes Hub par naye hain?
                </h3>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-muted); margin: 0; line-height: 1.5;">
                Apna Free Student Account banayein aur sabhi 1st se 8th Semester ke subject-wise notes, 5-year PYQs aur official syllabus access karein!
              </p>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button onclick="Auth.openModal('register')" class="btn-primary" style="font-weight: 700; padding: 10px 18px;">
                ✨ Free Register (5 Sec)
              </button>
              <button onclick="Auth.openModal('login')" class="btn-secondary" style="font-weight: 700; padding: 10px 18px;">
                Student Login
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Quick Subject & Semester Navigation -->
        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 22px;">
          <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span>📖</span> Explore More Study Materials
          </h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
            Access all B.Tech curricula, semester lecture notes, previous examination question papers, and syllabus schemes on DDU Notes Hub.
          </p>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <a href="#semesters" class="btn-secondary btn-sm">All Semesters (1 to 8)</a>
            <a href="#syllabus" class="btn-secondary btn-sm">Official Syllabus</a>
            <a href="#pyq" class="btn-secondary btn-sm">PYQ Papers (2021-2025)</a>
            <a href="#notes" class="btn-secondary btn-sm">All Notes Search</a>
          </div>
        </div>

      </div>
    `;

    // Automatically open the document reader for a seamless experience
    this.openPdfViewer(note.file_url, note.title, note.id, true);
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
            const currentHash = window.location.hash.slice(1);
            if (["notes", "pyq", "syllabus"].includes(currentHash) || currentHash.startsWith("semester/") || currentHash.startsWith("note/")) {
              App.handleRouting();
            } else {
              window.location.hash = "#dashboard";
            }
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
        const confirm_password = regForm.confirm_password ? regForm.confirm_password.value : null;
        const college = regForm.college ? regForm.college.value.trim() : "Deen Dayal Upadhyaya Gorakhpur University";
        const branch = regForm.branch.value;
        const semester = parseInt(regForm.semester.value);

        if (confirm_password !== null && password !== confirm_password) {
          App.toast("Passwords do not match.", "error");
          return;
        }

        const res = await Auth.register({
          full_name,
          email,
          password,
          college: college || "Deen Dayal Upadhyaya Gorakhpur University",
          branch,
          semester,
          course: "B.Tech"
        });

        if (res.success) {
          Auth.closeModal();
          App.toast("Aapka account safalta-poorvak ban gaya! Sabhi notes aur study material unlock ho gaye hain.", "success");
          const currentHash = window.location.hash.slice(1);
          if (["notes", "pyq", "syllabus"].includes(currentHash) || currentHash.startsWith("semester/") || currentHash.startsWith("note/")) {
            App.handleRouting();
          } else {
            window.location.hash = "#dashboard";
          }
        } else {
          App.toast(res.error, "error");
        }
      };
    }

    // Forgot password form (Step 1: Request token)
    const forgotForm = document.getElementById("forgot-form-element");
    const resetConfirmForm = document.getElementById("reset-confirm-form-element");
    const forgotInstructions = document.getElementById("forgot-instructions");

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
          if (data.success) {
            App.toast(data.message || "Reset token generated.", "success");
            if (resetConfirmForm) {
              forgotForm.style.display = "none";
              resetConfirmForm.style.display = "block";
              if (data.reset_token) {
                const tokenInput = document.getElementById("reset-token-input");
                if (tokenInput) tokenInput.value = data.reset_token;
              }
              if (forgotInstructions) {
                forgotInstructions.innerHTML = `Token generated for <strong>${escapeHtml(email)}</strong>. Enter your new password below:`;
              }
            }
          } else {
            App.toast(data.error || "Failed to initiate reset.", "error");
          }
        } catch (err) {
          App.toast("Error sending reset request", "error");
        }
      };
    }

    // Reset password form (Step 2: Submit new password)
    if (resetConfirmForm) {
      resetConfirmForm.onsubmit = async (e) => {
        e.preventDefault();
        const token = resetConfirmForm.token.value.trim();
        const new_password = resetConfirmForm.new_password.value;
        try {
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, new_password })
          });
          const data = await res.json();
          if (data.success) {
            App.toast(data.message || "Password updated successfully! Please login.", "success");
            resetConfirmForm.reset();
            resetConfirmForm.style.display = "none";
            if (forgotForm) {
              forgotForm.reset();
              forgotForm.style.display = "block";
            }
            Auth.switchTab("login");
          } else {
            App.toast(data.error || "Password reset failed.", "error");
          }
        } catch (err) {
          App.toast("Error resetting password", "error");
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
    const drawer = document.getElementById("mobile-drawer");
    const overlay = document.getElementById("mobile-drawer-overlay");
    if (drawer && overlay) {
      const isOpen = drawer.classList.contains("open");
      if (isOpen) {
        drawer.classList.remove("open");
        overlay.classList.remove("open");
        document.body.style.overflow = "";
      } else {
        drawer.classList.add("open");
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
      }
    } else {
      const nav = document.getElementById("navbar-links-list");
      if (nav) nav.classList.toggle("mobile-open");
    }
  },

  async openSubmitNoteModal(preselectedSubjectId = null) {
    if (!Auth.currentUser) {
      this.toast("Study notes contribute karne ke liye kripya pahle Register / Login karein.", "warning");
      Auth.openModal("register");
      return;
    }

    // Fetch subjects if not cached
    let subjects = this.cachedSubjects || [];
    if (subjects.length === 0) {
      try {
        const res = await fetch("/api/subjects");
        const data = await res.json();
        subjects = data.subjects || [];
        this.cachedSubjects = subjects;
      } catch (e) {
        subjects = [];
      }
    }

    const subOptions = subjects.map(s => `
      <option value="${s.id}" ${preselectedSubjectId && s.id === parseInt(preselectedSubjectId) ? 'selected' : ''}>
        [Sem ${s.semester_number}] ${escapeHtml(s.code)} - ${escapeHtml(s.name)}
      </option>
    `).join('');

    const modalHtml = `
      <div class="modal-box" style="max-width: 620px;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.4rem;">📝</span>
            <div>
              <h3 class="modal-title">Contribute / Add Study Notes</h3>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">Share handwritten or digital notes with your fellow students</p>
            </div>
          </div>
          <button onclick="App.closeActiveModal()" class="modal-close-btn">✕</button>
        </div>

        <div style="background: rgba(14, 165, 233, 0.08); border-left: 3px solid var(--accent-cyan); padding: 10px 14px; font-size: 0.8rem; color: var(--text-main); margin: 16px 20px 0; border-radius: var(--radius-sm);">
          <span>🛡️ <strong>Admin Verification:</strong> Aapka submitted note Admin dwara verify ("tick") hone ke baad hi public portal par publish hoga. Note ke upar aapka naam ba-izzat <em>Contributed by</em> badge me show hoga!</span>
        </div>

        <form onsubmit="App.handleStudentNoteSubmit(event)">
          <div class="modal-body" style="padding-top: 14px;">
            <div class="form-group">
              <label class="form-label">Note Title *</label>
              <input type="text" name="title" required placeholder="e.g. Unit 2: Stack & Queue Solved Derivations" class="form-control">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Subject *</label>
                <select name="subject_id" required class="form-control">
                  <option value="">Select Subject...</option>
                  ${subOptions}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Unit Number *</label>
                <select name="unit_number" class="form-control">
                  <option value="1">Unit 1</option>
                  <option value="2">Unit 2</option>
                  <option value="3">Unit 3</option>
                  <option value="4">Unit 4</option>
                  <option value="5">Unit 5</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Brief Description / Topics Covered</label>
              <textarea name="description" rows="2" class="form-control" placeholder="Mention key topics, solved examples or chapter details..."></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Attach PDF Document *</label>
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="file" id="student-note-file" accept=".pdf" onchange="App.uploadStudentPdf('student-note-file', 'student-note-url')" class="form-control" style="flex-grow: 1;">
                <button type="button" id="student-upload-btn" onclick="App.uploadStudentPdf('student-note-file', 'student-note-url')" class="btn-secondary btn-sm" style="white-space: nowrap;">
                  Upload PDF
                </button>
              </div>
              <input type="text" name="file_url" id="student-note-url" required placeholder="/static/uploads/your-note.pdf" class="form-control" style="font-size: 0.8rem; background: var(--bg-main);">
              <small style="color: var(--text-muted); font-size: 0.74rem; display: block; margin-top: 4px;">
                💡 <strong>Tip:</strong> PDF select karte hi automatic cloud par upload ho jayegi aur link fill ho jayega.
              </small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="App.closeActiveModal()" class="btn-secondary">Cancel</button>
            <button type="submit" id="student-submit-btn" class="btn-primary" style="font-weight: 700;">
              Submit Note for Verification
            </button>
          </div>
        </form>
      </div>
    `;

    this.showGenericModal(modalHtml);
  },

  async uploadStudentPdf(fileInputId, targetUrlInputId) {
    if (!Auth.currentUser) {
      this.toast("PDF upload karne ke liye kripya pahle Student Account login karein.", "warning");
      Auth.openModal("login");
      return null;
    }
    const input = document.getElementById(fileInputId);
    if (!input || !input.files || input.files.length === 0) {
      this.toast("Please select a PDF file first.", "warning");
      return null;
    }
    const file = input.files[0];
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      this.toast("Only PDF files (.pdf) are allowed.", "error");
      return null;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.toast("File size exceeds 25 MB limit.", "error");
      return null;
    }

    const btn = document.getElementById("student-upload-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Uploading...";
    }
    this.toast("Uploading PDF securely...", "info");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", "Student_Contribution");

    try {
      const res = await fetch("/api/student/upload", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const target = document.getElementById(targetUrlInputId);
      if (target) target.value = data.file_url;
      this.toast(`PDF uploaded successfully: ${data.original_name} (${data.file_size})`, "success");
      return data.file_url;
    } catch (err) {
      this.toast(err.message || "Upload failed", "error");
      return null;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Upload PDF";
      }
    }
  },

  async handleStudentNoteSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const btn = document.getElementById("student-submit-btn");

    const title = form.title.value.trim();
    const subject_id = parseInt(form.subject_id.value);
    const unit_id = parseInt(form.unit_number.value);
    const description = (form.description.value || "").trim();
    let file_url = (form.file_url.value || "").trim();

    // Auto-upload if file is selected but not yet uploaded
    const fileInput = document.getElementById("student-note-file");
    if (!file_url && fileInput && fileInput.files && fileInput.files.length > 0) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Uploading PDF...";
      }
      file_url = await this.uploadStudentPdf("student-note-file", "student-note-url");
      if (!file_url) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Submit Note for Verification";
        }
        return;
      }
    }

    if (!title || !subject_id || !file_url) {
      this.toast("Kripya sabhi fields bharein aur PDF attach karein.", "warning");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Submit Note for Verification";
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Submitting...";
    }

    try {
      const res = await fetch("/api/student/notes/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify({
          title,
          subject_id,
          unit_id,
          description: description || "Detailed notes will be shared in PDF format shortly.",
          file_url,
          file_name: title
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit note");

      this.closeActiveModal();
      this.toast("🎉 Note submitted successfully! Admin verify karne ke baad ye public portal par live ho jayega.", "success");
      
      if (window.location.hash === "#dashboard" && typeof Dashboard !== "undefined" && Dashboard.render) {
        Dashboard.render(document.getElementById("main-content"));
      }
    } catch (err) {
      this.toast(err.message, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Submit Note for Verification";
      }
    }
  }
};

window.addEventListener("DOMContentLoaded", () => App.init());
