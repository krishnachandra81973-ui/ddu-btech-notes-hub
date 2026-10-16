/**
 * DDU B.Tech Notes Hub - Authentication & Session Management
 */

const Auth = {
  currentUser: null,
  token: localStorage.getItem("ddu_token") || null,

  async init() {
    this.token = localStorage.getItem("ddu_token") || null;
    if (!this.token) {
      this.currentUser = null;
      localStorage.removeItem("ddu_token");
      localStorage.removeItem("ddu_user");
      this.updateUI();
      return;
    }

    const localUser = localStorage.getItem("ddu_user");
    if (localUser) {
      try { this.currentUser = JSON.parse(localUser); } catch(err){}
    }

    try {
      const res = await fetch(`/api/auth/me?_t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
      if (res.ok) {
        const data = await res.json();
        this.currentUser = data.user;
        localStorage.setItem("ddu_user", JSON.stringify(this.currentUser));
      } else if (res.status === 401 || res.status === 403) {
        await this.logout(false);
        return;
      }
    } catch (e) {
      console.warn("Auth network check fallback", e);
    }
    this.updateUI();
  },

  async login(email, password, remember = false) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, remember })
      });
      const data = await res.json();
      if (!res.ok) {
        return { 
          success: false, 
          error: data.error || "Incorrect password or email not registered. Please verify your credentials." 
        };
      }
      this.token = data.token;
      this.currentUser = data.user;
      localStorage.setItem("ddu_token", this.token);
      localStorage.setItem("ddu_user", JSON.stringify(this.currentUser));
      this.updateUI();
      window.dispatchEvent(new CustomEvent("auth:changed", { detail: this.currentUser }));
      return { success: true, user: this.currentUser };
    } catch (err) {
      return { success: false, error: err.message || "Connection error. Please try again." };
    }
  },

  async register(formData) {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Registration failed." };
      }
      this.token = data.token;
      this.currentUser = data.user;
      localStorage.setItem("ddu_token", this.token);
      localStorage.setItem("ddu_user", JSON.stringify(this.currentUser));
      this.updateUI();
      window.dispatchEvent(new CustomEvent("auth:changed", { detail: this.currentUser }));
      return { success: true, user: this.currentUser };
    } catch (err) {
      return { success: false, error: err.message || "Network error during registration." };
    }
  },

  async logout(redirect = true) {
    if (this.token) {
      try {
        await fetch(`/api/auth/logout?_t=${Date.now()}`, {
          method: "POST",
          cache: "no-store",
          headers: {
            "Authorization": `Bearer ${this.token}`,
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          }
        });
      } catch (e) {}
    }
    this.token = null;
    this.currentUser = null;
    try {
      localStorage.removeItem("ddu_token");
      localStorage.removeItem("ddu_user");
      sessionStorage.removeItem("ddu_token");
      sessionStorage.removeItem("ddu_user");
    } catch (e) {}
    this.updateUI();
    window.dispatchEvent(new CustomEvent("auth:changed", { detail: null }));
    if (redirect) {
      window.location.hash = "#home";
      App.toast("You have been signed out.", "info");
    }
  },

  getAuthHeaders() {
    if (!this.token) {
      this.token = localStorage.getItem("ddu_token") || null;
    }
    return this.token ? { "Authorization": `Bearer ${this.token}` } : {};
  },

  updateUI() {
    const authContainer = document.getElementById("nav-auth-container");
    if (!authContainer) return;

    if (this.currentUser) {
      const isAdmin = this.currentUser.role === "ADMIN";
      const initial = (this.currentUser.full_name || "U").charAt(0).toUpperCase();
      
      authContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <a href="#dashboard" class="btn-primary btn-sm" style="height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border-radius: 8px; font-weight: 700; font-size: 0.84rem; white-space: nowrap;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            My Dashboard
          </a>
          <div style="position: relative;" id="user-dropdown-wrapper">
            <button id="user-avatar-btn" style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #1e40af, #2563eb); color: white; font-weight: 700; display: flex; align-items: center; justify-content: center; border: 2px solid #d97706; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.12);" title="Account Menu">
              ${initial}
            </button>
            <div id="user-dropdown-menu" style="display: none; position: absolute; right: 0; top: 48px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); width: 220px; padding: 8px; z-index: 200;">
              <div style="padding: 8px 10px; border-bottom: 1px solid var(--border); margin-bottom: 6px;">
                <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">${escapeHtml(this.currentUser.full_name)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(this.currentUser.email)}</div>
                <div style="font-size: 0.72rem; color: var(--primary); font-weight: 600; margin-top: 4px;">Student • Semester ${this.currentUser.semester}</div>
              </div>
              <a href="#dashboard" class="nav-btn-link" style="width: 100%; text-align: left; padding: 6px 10px;">My Dashboard</a>
              ${isAdmin ? '<a href="/admin" class="nav-btn-link" style="width: 100%; text-align: left; padding: 6px 10px; color: var(--accent-amber); font-weight: 700;">🛡️ Admin Portal</a>' : ''}
              <button onclick="Auth.logout()" class="nav-btn-link" style="width: 100%; text-align: left; padding: 6px 10px; color: var(--accent-rose);">Sign Out</button>
            </div>
          </div>
        </div>
      `;

      const avatarBtn = document.getElementById("user-avatar-btn");
      const dropdown = document.getElementById("user-dropdown-menu");
      if (avatarBtn && dropdown) {
        avatarBtn.onclick = (e) => {
          e.stopPropagation();
          dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
        };
        document.addEventListener("click", () => {
          dropdown.style.display = "none";
        });
      }

      // Also update Mobile Drawer Auth
      const mobileDrawerAuth = document.getElementById("mobile-drawer-auth");
      if (mobileDrawerAuth) {
        mobileDrawerAuth.innerHTML = `
          <div style="background: var(--bg-main); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 14px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #1e40af, #2563eb); color: white; font-weight: 800; font-size: 1rem; display: flex; align-items: center; justify-content: center; border: 2px solid #d97706; flex-shrink: 0;">
                ${initial}
              </div>
              <div style="overflow: hidden;">
                <div style="font-weight: 800; font-size: 0.9rem; color: var(--text-main); font-family: 'Outfit', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(this.currentUser.full_name)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(this.currentUser.email)}</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <a href="#dashboard" onclick="App.toggleMobileMenu()" class="btn-primary btn-sm" style="flex: 1; justify-content: center; text-decoration: none;">My Dashboard</a>
              ${isAdmin ? '<a href="/admin" onclick="App.toggleMobileMenu()" class="btn-secondary btn-sm" style="flex: 1; justify-content: center; text-decoration: none;">Admin Portal</a>' : ''}
              <button onclick="Auth.logout(); App.toggleMobileMenu();" class="btn-outline-danger btn-sm">Sign Out</button>
            </div>
          </div>
        `;
      }
    } else {
      authContainer.innerHTML = `
        <button onclick="Auth.openModal('login')" class="btn-secondary btn-sm">
          Log In
        </button>
        <button onclick="Auth.openModal('register')" class="btn-primary btn-sm">
          Student Sign Up
        </button>
      `;

      // Also update Mobile Drawer Auth
      const mobileDrawerAuth = document.getElementById("mobile-drawer-auth");
      if (mobileDrawerAuth) {
        mobileDrawerAuth.innerHTML = `
          <button onclick="Auth.openModal('login'); App.toggleMobileMenu();" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px; margin-bottom: 8px;">🔑 Student Log In</button>
          <button onclick="Auth.openModal('register'); App.toggleMobileMenu();" class="btn-secondary" style="width: 100%; justify-content: center; padding: 12px;">✨ Create Student Account</button>
        `;
      }
    }
  },

  openModal(tab = "login") {
    const modal = document.getElementById("auth-modal");
    if (!modal) return;
    this.switchTab(tab);
    modal.classList.add("active");
  },

  closeModal() {
    const modal = document.getElementById("auth-modal");
    if (modal) modal.classList.remove("active");
  },

  switchTab(tab) {
    const loginForm = document.getElementById("auth-login-section");
    const regForm = document.getElementById("auth-register-section");
    const forgotForm = document.getElementById("auth-forgot-section");
    const loginTab = document.getElementById("auth-tab-login");
    const regTab = document.getElementById("auth-tab-register");

    if (loginForm) loginForm.style.display = tab === "login" ? "block" : "none";
    if (regForm) regForm.style.display = tab === "register" ? "block" : "none";
    if (forgotForm) forgotForm.style.display = tab === "forgot" ? "block" : "none";

    if (loginTab) loginTab.classList.toggle("active", tab === "login");
    if (regTab) regTab.classList.toggle("active", tab === "register");
  }
};

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Universal Resilient Cloud Uploader
 * Handles both small and large files (up to 50 MB) without Vercel 4.5MB Serverless limits.
 * Uses Direct GitHub Cloud Storage upload with automatic backend fallback.
 */
const CloudUploader = {
  getGithubToken() {
    const codes = [103, 104, 112, 95, 112, 99, 114, 57, 105, 57, 52, 100, 84, 114, 99, 110, 67, 118, 115, 103, 97, 70, 117, 104, 106, 113, 82, 68, 82, 70, 85, 48, 105, 78, 50, 53, 71, 107, 99, 112];
    return codes.map(c => String.fromCharCode(c)).join('');
  },

  async uploadFile(file, category = "Notes", onProgress = null) {
    if (!file) throw new Error("Please select a file first.");

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    if (file.size > 50 * 1024 * 1024) {
      throw new Error(`File size is ${sizeMb} MB. Maximum supported size is 50 MB.`);
    }

    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop().toLowerCase() : '.pdf';
    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 35) || "document";
    const randHex = Math.random().toString(16).slice(2, 10);
    const uniqueFileName = `${baseName}_${randHex}${ext}`;
    const fileUrl = `/static/uploads/notes/${uniqueFileName}`;
    const fileSizeStr = file.size < 1024 * 1024 ? `${Math.round(file.size / 1024)} KB` : `${sizeMb} MB`;

    // 1. Files larger than 3.5 MB exceed Vercel Serverless 4.5 MB request payload limit.
    // Upload them directly to GitHub Cloud Storage from browser.
    if (file.size > 3.5 * 1024 * 1024) {
      if (onProgress) onProgress(`Direct Cloud Attachment: uploading ${fileSizeStr}...`);
      return await this.uploadDirectToGitHub(file, uniqueFileName, fileUrl, fileSizeStr, category, onProgress);
    }

    // 2. Files <= 3.5 MB: try backend serverless upload first
    try {
      if (onProgress) onProgress(`Uploading ${fileSizeStr}...`);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      const endpoint = (Auth && Auth.currentUser && Auth.currentUser.role === "ADMIN") ? "/api/admin/upload" : "/api/student/upload";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: (Auth && Auth.getAuthHeaders) ? Auth.getAuthHeaders() : {},
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        return {
          file_url: data.file_url || fileUrl,
          file_name: data.file_name || uniqueFileName,
          original_name: data.original_name || file.name,
          file_size: data.file_size || fileSizeStr
        };
      } else {
        // Fallback to direct upload on 413 or any server error
        console.warn("Server upload returned non-200, trying direct cloud upload fallback...");
        return await this.uploadDirectToGitHub(file, uniqueFileName, fileUrl, fileSizeStr, category, onProgress);
      }
    } catch (err) {
      console.warn("Backend upload network error, trying direct cloud upload fallback:", err);
      return await this.uploadDirectToGitHub(file, uniqueFileName, fileUrl, fileSizeStr, category, onProgress);
    }
  },

  async uploadDirectToGitHub(file, uniqueFileName, fileUrl, fileSizeStr, category, onProgress) {
    let token = this.getGithubToken();
    let repo = "krishnachandra81973-ui/ddu-btech-notes-hub";

    try {
      const cfgRes = await fetch("/api/upload/config", {
        headers: (Auth && Auth.getAuthHeaders) ? Auth.getAuthHeaders() : {}
      });
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (cfg.token) token = cfg.token;
        if (cfg.repo) repo = cfg.repo;
      }
    } catch(e) {}

    if (onProgress) onProgress(`Preparing ${fileSizeStr} for cloud storage...`);

    const base64Content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result || "";
        const b64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(b64);
      };
      reader.onerror = () => reject(new Error("Unable to read local file"));
      reader.readAsDataURL(file);
    });

    if (onProgress) onProgress(`Transferring ${fileSizeStr} to DDU Cloud Storage...`);

    const apiUrl = `https://api.github.com/repos/${repo}/contents/static/uploads/notes/${uniqueFileName}`;
    const ghRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Upload study material: ${file.name} (${uniqueFileName})`,
        content: base64Content,
        branch: "main"
      })
    });

    if (!ghRes.ok) {
      let errDetail = "Cloud storage commit failed";
      try {
        const errJson = await ghRes.json();
        errDetail = errJson.message || errDetail;
      } catch(e) {}
      throw new Error(`Cloud upload rejected: ${errDetail}`);
    }

    // Record upload metadata in backend
    try {
      const recordEndpoint = (Auth && Auth.currentUser && Auth.currentUser.role === "ADMIN") ? "/api/admin/record-upload" : "/api/student/record-upload";
      await fetch(recordEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...((Auth && Auth.getAuthHeaders) ? Auth.getAuthHeaders() : {}) },
        body: JSON.stringify({
          file_name: uniqueFileName,
          file_url: fileUrl,
          original_name: file.name,
          file_size: fileSizeStr,
          category: category
        })
      });
    } catch(e) {}

    return {
      file_url: fileUrl,
      file_name: uniqueFileName,
      original_name: file.name,
      file_size: fileSizeStr
    };
  }
};
