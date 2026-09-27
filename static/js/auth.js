/**
 * DDU B.Tech Notes Hub - Authentication & Session Management
 */

const Auth = {
  currentUser: null,
  token: localStorage.getItem("ddu_token") || null,

  async init() {
    // 1. Immediately read from localStorage so UI is responsive with no delay
    const localUser = localStorage.getItem("ddu_user");
    if (localUser) {
      try { this.currentUser = JSON.parse(localUser); } catch(err){}
    }

    if (this.token) {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { "Authorization": `Bearer ${this.token}` }
        });
        if (res.ok) {
          const data = await res.json();
          this.currentUser = data.user;
          localStorage.setItem("ddu_user", JSON.stringify(this.currentUser));
        } else if (res.status === 401) {
          // If admin, keep session alive to prevent lockouts
          if (this.currentUser && this.currentUser.role === "ADMIN") {
            console.warn("Preserving administrator session");
          } else {
            this.logout(false);
          }
        }
      } catch (e) {
        console.warn("Auth network check fallback", e);
      }
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
        return {
          success: false,
          error: data.error || "Registration failed.",
          already_registered: data.already_registered || res.status === 409
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
      return { success: false, error: err.message || "Network error during registration." };
    }
  },

  async logout(redirect = true) {
    if (this.token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Authorization": `Bearer ${this.token}` }
        });
      } catch (e) {}
    }
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem("ddu_token");
    this.updateUI();
    window.dispatchEvent(new CustomEvent("auth:changed", { detail: null }));
    if (redirect) {
      window.location.hash = "#home";
      App.toast("You have been signed out.", "info");
    }
  },

  getAuthHeaders() {
    return this.token ? { "Authorization": `Bearer ${this.token}` } : {};
  },

  updateUI() {
    const authContainer = document.getElementById("nav-auth-container");
    if (!authContainer) return;

    if (this.currentUser) {
      const isAdmin = this.currentUser.role === "ADMIN";
      const initial = (this.currentUser.full_name || "U").charAt(0).toUpperCase();
      
      authContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <a href="#dashboard" class="btn-primary btn-sm desktop-only-dashboard" style="height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border-radius: 8px; font-weight: 700; font-size: 0.84rem; white-space: nowrap;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            My Dashboard
          </a>
          <div style="position: relative;" id="user-dropdown-wrapper">
            <button id="user-avatar-btn" class="user-avatar-btn" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #1e40af, #2563eb); color: white; font-weight: 700; display: flex; align-items: center; justify-content: center; border: 2px solid #d97706; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.12);" title="Student Profile & Menu">
              ${initial}
            </button>
            <div id="user-dropdown-menu" style="display: none; position: absolute; right: 0; top: 44px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); width: 230px; padding: 10px; z-index: 1000;">
              <div style="padding: 6px 10px; border-bottom: 1px solid var(--border); margin-bottom: 8px;">
                <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">${escapeHtml(this.currentUser.full_name)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis;">${escapeHtml(this.currentUser.email)}</div>
                <div style="font-size: 0.72rem; color: var(--primary); font-weight: 600; margin-top: 4px;">Student • Semester ${this.currentUser.semester} (${escapeHtml(this.currentUser.branch || 'CSE')})</div>
              </div>
              <a href="#dashboard" onclick="const m=document.getElementById('user-dropdown-menu');if(m)m.style.display='none';" class="nav-btn-link" style="width: 100%; text-align: left; padding: 7px 10px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                <span>📊</span> My Dashboard & Notes
              </a>
              ${isAdmin ? `
              <a href="/admin" class="nav-btn-link" style="width: 100%; text-align: left; padding: 7px 10px; font-weight: 600; color: var(--accent-amber); display: flex; align-items: center; gap: 6px;">
                <span>🛡️</span> Admin Portal
              </a>
              ` : ''}
              <button onclick="Auth.logout()" class="nav-btn-link" style="width: 100%; text-align: left; padding: 7px 10px; color: var(--accent-rose); font-weight: 600; display: flex; align-items: center; gap: 6px; margin-top: 4px; border-top: 1px solid var(--border);">
                <span>🚪</span> Sign Out
              </button>
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
            <div style="display: flex; gap: 8px;">
              <a href="#dashboard" onclick="App.toggleMobileMenu()" class="btn-primary btn-sm" style="flex: 1; justify-content: center; text-decoration: none;">My Dashboard</a>
              <button onclick="Auth.logout(); App.toggleMobileMenu();" class="btn-outline-danger btn-sm">Sign Out</button>
            </div>
          </div>
        `;
      }
    } else {
      authContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <button onclick="Auth.openModal('login')" class="btn-primary btn-sm nav-login-btn">
            Log In
          </button>
          <button onclick="Auth.openModal('register')" class="btn-secondary btn-sm nav-signup-btn">
            Sign Up
          </button>
        </div>
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

    // Also sync Sub-Navigation Profile Pill
    const subNavProfile = document.getElementById("sub-nav-profile-link");
    if (subNavProfile) {
      if (this.currentUser) {
        const firstName = this.currentUser.full_name ? this.currentUser.full_name.split(' ')[0] : 'Profile';
        subNavProfile.innerHTML = `👤 ${escapeHtml(firstName)}`;
      } else {
        subNavProfile.innerHTML = "👤 Log In";
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
    const errBox = document.getElementById("register-error-msg");
    if (errBox) errBox.style.display = "none";
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
