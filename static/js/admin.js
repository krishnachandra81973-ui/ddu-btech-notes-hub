/**
 * DDU B.Tech Notes Hub - Admin Portal Controller
 * Full CRUD Data Management & File Upload System
 */

const Admin = {
  currentTab: "dashboard",
  statsData: null,
  cachedSubjects: [],
  cachedSemesters: [],

  async render(container) {
    // 1. Strict Security Guard
    if (!Auth.currentUser || Auth.currentUser.role !== "ADMIN") {
      container.innerHTML = `
        <div class="container" style="text-align: center; padding: 100px 20px;">
          <div style="font-size: 3.5rem; margin-bottom: 16px;">🛑</div>
          <h1 style="font-size: 2.2rem; font-weight: 800; color: var(--accent-rose); margin-bottom: 12px;">
            403 - Admin Access Restricted
          </h1>
          <p style="color: var(--text-muted); max-width: 500px; margin: 0 auto 24px;">
            The Admin Portal is accessible only to authorized administrators of DDU B.Tech Notes Hub.
            Your current account does not have administrative privileges.
          </p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <a href="#home" class="btn-primary">Return to Home</a>
            ${!Auth.currentUser ? `<button onclick="Auth.openModal('login')" class="btn-secondary">Admin Login</button>` : ''}
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="admin-layout">
        <!-- Sidebar Navigation -->
        <aside class="admin-sidebar">
          <div style="padding: 10px 14px 20px; border-bottom: 1px solid var(--border); margin-bottom: 12px;">
            <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--primary); letter-spacing: 1px;">
              Admin Control Panel
            </div>
            <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-main);">DDU Hub Admin</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(Auth.currentUser.full_name)}</div>
          </div>
          
          <button onclick="Admin.switchTab('dashboard')" class="admin-nav-item ${this.currentTab === 'dashboard' ? 'active' : ''}">
            📊 Dashboard Overview
          </button>
          <button onclick="Admin.switchTab('notes')" class="admin-nav-item ${this.currentTab === 'notes' ? 'active' : ''}">
            📚 Notes Management
          </button>
          <button onclick="Admin.switchTab('subjects')" class="admin-nav-item ${this.currentTab === 'subjects' ? 'active' : ''}">
            📖 Subjects & Branches
          </button>
          <button onclick="Admin.switchTab('syllabus')" class="admin-nav-item ${this.currentTab === 'syllabus' ? 'active' : ''}">
            📑 Syllabus Explorer
          </button>
          <button onclick="Admin.switchTab('pyqs')" class="admin-nav-item ${this.currentTab === 'pyqs' ? 'active' : ''}">
            📝 Previous Year Papers
          </button>
          <button onclick="Admin.switchTab('updates')" class="admin-nav-item ${this.currentTab === 'updates' ? 'active' : ''}">
            📢 Daily Updates & Notices
          </button>
          <button onclick="Admin.switchTab('students')" class="admin-nav-item ${this.currentTab === 'students' ? 'active' : ''}">
            🎓 Student Accounts
          </button>
          <button onclick="Admin.switchTab('files')" class="admin-nav-item ${this.currentTab === 'files' ? 'active' : ''}">
            📁 Uploaded Media / PDFs
          </button>

          <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid var(--border);">
            <a href="#home" class="btn-secondary btn-sm" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;">
              ← Back to Student Portal
            </a>
          </div>
        </aside>

        <!-- Main Content Area -->
        <main class="admin-content" id="admin-tab-content">
          <div style="text-align: center; padding: 40px 0;">
            <p style="color: var(--text-muted);">Loading admin modules...</p>
          </div>
        </main>
      </div>
    `;

    // Preload subjects & semesters for dropdowns
    this.preloadDropdowns();
    this.loadTabContent();
  },

  async preloadDropdowns() {
    try {
      const [semRes, subRes] = await Promise.all([
        fetch("/api/semesters"),
        fetch("/api/subjects")
      ]);
      const semData = await semRes.json();
      const subData = await subRes.json();
      this.cachedSemesters = semData.semesters || [];
      this.cachedSubjects = subData.subjects || [];
    } catch (e) {
      console.error("Dropdown preload failed", e);
    }
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll(".admin-nav-item").forEach(item => {
      item.classList.remove("active");
      if (item.getAttribute("onclick").includes(tab)) {
        item.classList.add("active");
      }
    });
    this.loadTabContent();
  },

  async loadTabContent() {
    const content = document.getElementById("admin-tab-content");
    if (!content) return;

    if (this.currentTab === "dashboard") {
      await this.renderDashboardTab(content);
    } else if (this.currentTab === "notes") {
      await this.renderNotesTab(content);
    } else if (this.currentTab === "subjects") {
      await this.renderSubjectsTab(content);
    } else if (this.currentTab === "syllabus") {
      await this.renderSyllabusTab(content);
    } else if (this.currentTab === "pyqs") {
      await this.renderPyqsTab(content);
    } else if (this.currentTab === "updates") {
      await this.renderUpdatesTab(content);
    } else if (this.currentTab === "students") {
      await this.renderStudentsTab(content);
    } else if (this.currentTab === "files") {
      await this.renderFilesTab(content);
    }
  },

  // ------------------- 1. Dashboard Tab -------------------
  async renderDashboardTab(container) {
    try {
      const res = await fetch("/api/admin/stats", { headers: Auth.getAuthHeaders() });
      const data = await res.json();
      const stats = data.stats || {
        total_students: 0,
        total_notes: 0,
        total_subjects: 0,
        total_pyqs: 0,
        total_syllabus: 0,
        total_updates: 0,
        total_pdfs: 0,
        recent_students: [],
        recent_uploads: []
      };
      this.statsData = stats;

      const recentStudents = stats.recent_students || [];
      const recentUploads = stats.recent_uploads || [];

      container.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: 1.8rem; font-weight: 800; color: var(--text-main);">Admin Operations Dashboard</h2>
              <p style="color: var(--text-muted); font-size: 0.9rem;">Live analytics, active uploads, and real-time portal statistics.</p>
            </div>
            <div style="display: flex; gap: 10px;">
              <button onclick="Admin.openAddStudentModal()" class="btn-secondary btn-sm">+ Register Student</button>
              <button onclick="Admin.openAddNoteModal()" class="btn-primary btn-sm">+ Add New Note</button>
              <button onclick="Admin.openAddUpdateModal()" class="btn-secondary btn-sm">+ Post Notice</button>
            </div>
          </div>

          <!-- KPI Cards -->
          <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 30px;">
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(30, 64, 175, 0.15);">👥</div>
              <div>
                <div class="stat-value">${stats.total_students || 0}</div>
                <div class="stat-label">Students</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(14, 165, 233, 0.15); color: var(--accent);">📚</div>
              <div>
                <div class="stat-value">${stats.total_notes || 0}</div>
                <div class="stat-label">Total Notes</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);">📖</div>
              <div>
                <div class="stat-value">${stats.total_subjects || 0}</div>
                <div class="stat-label">Subjects</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber);">📝</div>
              <div>
                <div class="stat-value">${stats.total_pyqs || 0}</div>
                <div class="stat-label">PYQ Papers</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">📑</div>
              <div>
                <div class="stat-value">${stats.total_syllabus || 0}</div>
                <div class="stat-label">Syllabus Files</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(239, 68, 68, 0.15); color: var(--accent-rose);">📢</div>
              <div>
                <div class="stat-value">${stats.total_updates || 0}</div>
                <div class="stat-label">Campus Notices</div>
              </div>
            </div>
          </div>

          <!-- Two Column Activity Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;" id="admin-dash-two-col">
            <!-- Recent Students -->
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <h3 style="font-size: 1.1rem; font-weight: 700;">Recent Registrations</h3>
                <button onclick="Admin.switchTab('students')" style="font-size: 0.8rem; color: var(--primary); font-weight: 600;">View All →</button>
              </div>
              <div class="table-responsive">
                <table class="modern-table">
                  <thead>
                    <tr><th>Name</th><th>Branch</th><th>Sem</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    ${recentStudents.length === 0 ? `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">No student registrations yet.</td></tr>` : recentStudents.map(s => `
                      <tr>
                        <td style="font-weight: 600;">${escapeHtml(s.full_name)}<div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(s.email)}</div></td>
                        <td>${escapeHtml(s.branch)}</td>
                        <td>Sem ${s.semester}</td>
                        <td>
                          <span style="padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; ${s.is_active ? 'background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);' : 'background: rgba(239, 68, 68, 0.15); color: var(--accent-rose);'}">
                            ${s.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Recent Uploads -->
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <h3 style="font-size: 1.1rem; font-weight: 700;">Recent Uploaded Files</h3>
                <button onclick="Admin.switchTab('files')" style="font-size: 0.8rem; color: var(--primary); font-weight: 600;">View All →</button>
              </div>
              <div class="table-responsive">
                <table class="modern-table">
                  <thead>
                    <tr><th>File Name</th><th>Category</th><th>Size</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    ${recentUploads.length === 0 ? `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">No uploads found.</td></tr>` : recentUploads.map(f => `
                      <tr>
                        <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600;">
                          ${escapeHtml(f.original_name)}
                        </td>
                        <td><span style="font-size: 0.75rem; background: var(--primary-light); color: var(--primary); padding: 2px 6px; border-radius: 4px;">${escapeHtml(f.category || 'PDF')}</span></td>
                        <td>${(f.file_size / 1024).toFixed(0)} KB</td>
                        <td>
                          <button onclick="App.openPdfViewer('/static/uploads/${f.file_name}', '${escapeHtml(f.original_name)}')" class="btn-secondary btn-sm" style="padding: 3px 8px; font-size: 0.75rem;">
                            View
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Error loading stats: ${e.message}</p>`;
    }
  },

  // ------------------- 2. Notes CRUD -------------------
  async renderNotesTab(container) {
    container.innerHTML = `<p style="color: var(--text-muted);">Loading notes...</p>`;
    try {
      const res = await fetch("/api/admin/notes", { headers: Auth.getAuthHeaders() });
      const data = await res.json();
      const notes = data.notes || [];

      container.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800;">Notes & Study Material Manager</h2>
              <p style="color: var(--text-muted); font-size: 0.88rem;">Add, edit, upload PDF files, assign units, and publish semester notes.</p>
            </div>
            <button onclick="Admin.openAddNoteModal()" class="btn-primary">
              + Upload / Add New Note
            </button>
          </div>

          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; gap: 10px; margin-bottom: 16px;">
              <input type="text" id="notes-filter-input" onkeyup="Admin.filterTable('notes-filter-input', 'notes-admin-table')" placeholder="Search notes by title, subject or code..." class="form-control" style="max-width: 380px;">
            </div>

            <div class="table-responsive">
              <table class="modern-table" id="notes-admin-table">
                <thead>
                  <tr>
                    <th>Title & Description</th>
                    <th>Subject & Sem</th>
                    <th>Unit</th>
                    <th>PDF File</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${notes.map(n => `
                    <tr>
                      <td style="max-width: 250px;">
                        <div style="font-weight: 700;">${escapeHtml(n.title)}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${escapeHtml(n.description || 'No description')}
                        </div>
                        ${n.is_important ? `<span class="update-badge-important" style="font-size: 0.65rem; margin-top: 4px; display: inline-block;">Important</span>` : ''}
                      </td>
                      <td>
                        <span class="subject-code-tag">${escapeHtml(n.subject_code)}</span>
                        <div style="font-size: 0.75rem; margin-top: 4px;">Sem ${n.semester_number}</div>
                      </td>
                      <td>
                        <strong>${n.unit_number ? `Unit ${n.unit_number}` : 'General'}</strong>
                      </td>
                      <td>
                        <button onclick="App.openPdfViewer('${n.file_url}', '${escapeHtml(n.title)}')" class="btn-secondary btn-sm" style="font-size: 0.75rem; padding: 4px 8px;">
                          View PDF
                        </button>
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">${n.file_size || 'PDF'}</div>
                      </td>
                      <td>
                        <span style="padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; ${n.is_published ? 'background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);' : 'background: rgba(239, 68, 68, 0.15); color: var(--accent-rose);'}">
                          ${n.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          <button onclick="Admin.openEditNoteModal(${JSON.stringify(n).replace(/"/g, '&quot;')})" class="btn-secondary btn-sm">Edit</button>
                          <button onclick="Admin.deleteNote(${n.id})" class="btn-outline-danger btn-sm">Delete</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load notes: ${e.message}</p>`;
    }
  },

  // ------------------- 3. Subjects CRUD -------------------
  async renderSubjectsTab(container) {
    try {
      const res = await fetch("/api/admin/subjects", { headers: Auth.getAuthHeaders() });
      const data = await res.json();
      const subjects = data.subjects || [];

      container.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800;">Subjects & Course Structure</h2>
              <p style="color: var(--text-muted); font-size: 0.88rem;">Manage subject curriculum across 8 semesters and engineering branches.</p>
            </div>
            <button onclick="Admin.openAddSubjectModal()" class="btn-primary">
              + Add New Subject
            </button>
          </div>

          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm);">
            <div class="table-responsive">
              <table class="modern-table">
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Name</th>
                    <th>Semester</th>
                    <th>Branch</th>
                    <th>Notes Count</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${subjects.map(s => `
                    <tr>
                      <td><span class="subject-code-tag">${escapeHtml(s.code)}</span></td>
                      <td style="font-weight: 700;">${escapeHtml(s.name)}</td>
                      <td>Sem ${s.semester_number}</td>
                      <td>${escapeHtml(s.branch)}</td>
                      <td>${s.notes_count} Notes</td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          <button onclick="Admin.openEditSubjectModal(${JSON.stringify(s).replace(/"/g, '&quot;')})" class="btn-secondary btn-sm">Edit</button>
                          <button onclick="Admin.deleteSubject(${s.id})" class="btn-outline-danger btn-sm">Delete</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- 4. Syllabus CRUD -------------------
  async renderSyllabusTab(container) {
    try {
      const res = await fetch("/api/admin/syllabus", { headers: Auth.getAuthHeaders() });
      const data = await res.json();
      const list = data.syllabus || [];

      container.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800;">Official Syllabus Documents</h2>
              <p style="color: var(--text-muted); font-size: 0.88rem;">Upload and manage DDU verified semester and subject syllabi.</p>
            </div>
            <button onclick="Admin.openAddSyllabusModal()" class="btn-primary">
              + Upload Syllabus PDF
            </button>
          </div>

          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm);">
            <div class="table-responsive">
              <table class="modern-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Semester & Subject</th>
                    <th>PDF File</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map(s => `
                    <tr>
                      <td style="font-weight: 700;">${escapeHtml(s.title)}</td>
                      <td>Sem ${s.semester_number} • ${escapeHtml(s.subject_name || 'All Subjects')}</td>
                      <td>
                        <button onclick="App.openPdfViewer('${s.file_url}', '${escapeHtml(s.title)}')" class="btn-secondary btn-sm">
                          View PDF
                        </button>
                      </td>
                      <td>
                        <span style="padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; ${s.is_published ? 'background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);' : 'background: rgba(239, 68, 68, 0.15); color: var(--accent-rose);'}">
                          ${s.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td>
                        <button onclick="Admin.deleteSyllabus(${s.id})" class="btn-outline-danger btn-sm">Delete</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- 5. PYQ Papers CRUD -------------------
  async renderPyqsTab(container) {
    try {
      const res = await fetch("/api/admin/pyqs", { headers: Auth.getAuthHeaders() });
      const data = await res.json();
      const list = data.pyqs || [];

      container.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800;">Previous Year Examination Papers (PYQs)</h2>
              <p style="color: var(--text-muted); font-size: 0.88rem;">Upload real university question papers tagged with Exam Year, Semester, and Branch.</p>
            </div>
            <button onclick="Admin.openAddPyqModal()" class="btn-primary">
              + Upload PYQ Paper
            </button>
          </div>

          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm);">
            <div class="table-responsive">
              <table class="modern-table">
                <thead>
                  <tr>
                    <th>Paper Title</th>
                    <th>Year</th>
                    <th>Subject & Sem</th>
                    <th>Branch</th>
                    <th>Preview</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map(p => `
                    <tr>
                      <td style="font-weight: 700;">${escapeHtml(p.paper_title)}</td>
                      <td><span style="font-weight: 800; color: var(--primary);">${p.exam_year}</span></td>
                      <td>Sem ${p.semester_number} • ${escapeHtml(p.subject_name)}</td>
                      <td>${escapeHtml(p.branch)}</td>
                      <td>
                        <button onclick="App.openPdfViewer('${p.file_url}', '${escapeHtml(p.paper_title)}')" class="btn-secondary btn-sm">
                          View PDF
                        </button>
                      </td>
                      <td>
                        <button onclick="Admin.deletePyq(${p.id})" class="btn-outline-danger btn-sm">Delete</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- 6. Daily Updates CRUD -------------------
  async renderUpdatesTab(container) {
    try {
      const res = await fetch("/api/admin/updates", { headers: Auth.getAuthHeaders() });
      const data = await res.json();
      const list = data.updates || [];

      container.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800;">Campus Notices & Daily Updates</h2>
              <p style="color: var(--text-muted); font-size: 0.88rem;">Publish exam timetables, admit card notices, syllabus changes, and university alerts.</p>
            </div>
            <button onclick="Admin.openAddUpdateModal()" class="btn-primary">
              + Post New Update
            </button>
          </div>

          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm);">
            <div class="table-responsive">
              <table class="modern-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Title & Short Details</th>
                    <th>Important</th>
                    <th>Attachment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map(u => `
                    <tr>
                      <td style="white-space: nowrap; font-size: 0.82rem; color: var(--text-muted);">${u.publish_date}</td>
                      <td><span style="font-size: 0.75rem; font-weight: 700; color: var(--primary);">${escapeHtml(u.category)}</span></td>
                      <td style="max-width: 280px;">
                        <div style="font-weight: 700;">${escapeHtml(u.title)}</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(u.short_description)}</div>
                      </td>
                      <td>
                        ${u.is_important ? `<span class="update-badge-important">Important</span>` : 'Normal'}
                      </td>
                      <td>
                        ${u.attachment_url ? `
                          <button onclick="App.openPdfViewer('${u.attachment_url}', '${escapeHtml(u.title)}')" class="btn-secondary btn-sm" style="font-size: 0.72rem; padding: 2px 6px;">
                            Attachment
                          </button>
                        ` : '<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>'}
                      </td>
                      <td>
                        <button onclick="Admin.deleteUpdate(${u.id})" class="btn-outline-danger btn-sm">Delete</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- 7. Students Tab -------------------
  async renderStudentsTab(container) {
    try {
      const res = await fetch("/api/admin/users", { headers: Auth.getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          container.innerHTML = `
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 40px 20px; text-align: center; max-width: 500px; margin: 40px auto;">
              <div style="font-size: 2.5rem; margin-bottom: 12px;">🔒</div>
              <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">Admin Authorization Required</h3>
              <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 20px;">Please re-authenticate with administrator credentials to view registered students.</p>
              <button onclick="AdminApp.logout(); AdminApp.renderState();" class="btn-primary">Log In as Administrator</button>
            </div>
          `;
          return;
        }
      }
      const data = await res.json();
      const users = data.users || [];
      const studentCount = users.filter(u => u.role !== "ADMIN").length;

      container.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800;">Registered Student Accounts (${studentCount})</h2>
              <p style="color: var(--text-muted); font-size: 0.88rem;">Live student credentials, registration timestamps, and administrative controls.</p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button onclick="Admin.openAddStudentModal()" class="btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
                + Register Student
              </button>
              <button onclick="Admin.syncStudents()" class="btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;" title="Refresh student data">
                🔄 Sync Accounts
              </button>
              <button onclick="Admin.exportStudents()" class="btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;" title="Export student data in JSON">
                📥 JSON
              </button>
              <button onclick="Admin.exportStudentsCsv()" class="btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;" title="Export student data in CSV (Excel)">
                📊 Export CSV
              </button>
              <button onclick="Admin.revealAllPasswords()" class="btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
                👁️ Toggle Passwords
              </button>
            </div>
          </div>

          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; gap: 10px; margin-bottom: 16px;">
              <input type="text" id="students-filter-input" onkeyup="Admin.filterTable('students-filter-input', 'students-admin-table')" placeholder="Filter students by name, email or branch..." class="form-control" style="max-width: 380px;">
            </div>

            <div class="table-responsive">
              <table class="modern-table" id="students-admin-table">
                <thead>
                  <tr>
                    <th>Student Name & Email</th>
                    <th>Branch, Sem & College</th>
                    <th>Account Password</th>
                    <th>Signed Up Date & Time</th>
                    <th>Account Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${users.length === 0 ? `
                    <tr>
                      <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
                        No students registered yet. Click <strong>+ Register Student</strong> to add an account manually.
                      </td>
                    </tr>
                  ` : users.map(u => `
                    <tr>
                      <td>
                        <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(u.full_name)} ${u.role === 'ADMIN' ? '<span style="font-size: 0.68rem; background: var(--primary); color: white; padding: 1px 6px; border-radius: 4px; vertical-align: middle;">ADMIN</span>' : ''}</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(u.email)}</div>
                      </td>
                      <td>
                        <div style="font-weight: 600;">${escapeHtml(u.branch || 'B.Tech CSE')}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Semester ${u.semester}</div>
                        <div style="font-size: 0.71rem; color: var(--text-muted); opacity: 0.85;">🏛️ ${escapeHtml(u.college || 'DDU Gorakhpur University')}</div>
                      </td>
                      <td style="white-space: nowrap;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                          <code id="pass-field-${u.id}" data-revealed="false" data-pass="${escapeHtml(u.plain_password || 'StudentPassword123!')}" style="font-family: monospace; font-size: 0.84rem; background: var(--bg-surface); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border); color: #2563eb; font-weight: 700; min-width: 80px; text-align: center; display: inline-block;">••••••••</code>
                          <button onclick="Admin.togglePasswordVisibility(${u.id})" class="btn-secondary btn-sm" style="padding: 2px 7px; font-size: 0.78rem;" title="Show/Hide Password">
                            👁️
                          </button>
                        </div>
                      </td>
                      <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">
                        📅 ${u.created_at || 'Recently'}
                      </td>
                      <td>
                        <span style="padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; ${u.is_active ? 'background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);' : 'background: rgba(239, 68, 68, 0.15); color: var(--accent-rose);'}">
                          ${u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                          <button onclick="Admin.resetStudentPassword(${u.id}, '${escapeHtml(u.full_name)}')" class="btn-primary btn-sm" style="padding: 4px 8px; font-size: 0.75rem;">
                            🔑 Reset Pass
                          </button>
                          <button onclick="Admin.toggleUserActive(${u.id})" class="btn-secondary btn-sm" style="padding: 4px 8px; font-size: 0.75rem;">
                            ${u.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button onclick="Admin.deleteStudent(${u.id})" class="btn-outline-danger btn-sm" style="padding: 4px 8px; font-size: 0.75rem;">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- 8. Uploaded Media / Files Tab -------------------
  async renderFilesTab(container) {
    try {
      const res = await fetch("/api/admin/files", { headers: Auth.getAuthHeaders() });
      const data = await res.json();
      const files = data.files || [];

      container.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800;">Cloud & File Upload Storage</h2>
              <p style="color: var(--text-muted); font-size: 0.88rem;">Securely uploaded documents (PDF, JPG, PNG, WEBP) stored with unique hashes.</p>
            </div>
            <button onclick="Admin.openUploadModal()" class="btn-primary">
              + Upload File
            </button>
          </div>

          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm);">
            <div class="table-responsive">
              <table class="modern-table">
                <thead>
                  <tr>
                    <th>Original Name</th>
                    <th>Storage Key</th>
                    <th>Category</th>
                    <th>Size</th>
                    <th>Upload Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${files.map(f => `
                    <tr>
                      <td style="font-weight: 700;">${escapeHtml(f.original_name)}</td>
                      <td style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(f.file_name)}</td>
                      <td><span class="badge" style="background: var(--primary-light); color: var(--primary); padding: 2px 6px; border-radius: 4px; font-size: 0.72rem;">${escapeHtml(f.category || 'General')}</span></td>
                      <td>${(f.file_size / 1024).toFixed(0)} KB</td>
                      <td style="font-size: 0.8rem; color: var(--text-muted);">${f.uploaded_at}</td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          <button onclick="App.openPdfViewer('/static/uploads/${f.file_name}', '${escapeHtml(f.original_name)}')" class="btn-secondary btn-sm">Preview</button>
                          <button onclick="Admin.deleteFile(${f.id})" class="btn-outline-danger btn-sm">Delete</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Error: ${e.message}</p>`;
    }
  },

  // ------------------- Helper Modals & Actions -------------------

  filterTable(inputId, tableId) {
    const input = document.getElementById(inputId);
    const filter = input.value.toLowerCase();
    const table = document.getElementById(tableId);
    if (!table) return;
    const tr = table.getElementsByTagName("tr");
    for (let i = 1; i < tr.length; i++) {
      const text = tr[i].textContent || tr[i].innerText;
      tr[i].style.display = text.toLowerCase().indexOf(filter) > -1 ? "" : "none";
    }
  },

  // Modal: Add / Edit Note
  openAddNoteModal(note = null) {
    const isEdit = !!note;
    const subOptions = this.cachedSubjects.map(s => `
      <option value="${s.id}" ${isEdit && note.subject_id === s.id ? 'selected' : ''}>
        [Sem ${s.semester_number}] ${escapeHtml(s.code)} - ${escapeHtml(s.name)}
      </option>
    `).join('');

    const modalHtml = `
      <div class="modal-box" style="max-width: 650px;">
        <div class="modal-header">
          <h3 class="modal-title">${isEdit ? 'Edit Note' : 'Add New Note & Study Material'}</h3>
          <button onclick="App.closeActiveModal()" class="modal-close-btn">✕</button>
        </div>
        <form id="admin-note-form" onsubmit="Admin.handleSaveNote(event, ${isEdit ? note.id : 'null'})">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Note Title *</label>
              <input type="text" name="title" required value="${isEdit ? escapeHtml(note.title) : ''}" placeholder="e.g. Unit 1: Successive Differentiation Solved Derivations" class="form-control">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Subject *</label>
                <select name="subject_id" required class="form-control">
                  ${subOptions}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Unit Number (1 to 5)</label>
                <select name="unit_number" class="form-control">
                  <option value="1" ${isEdit && note.unit_number === 1 ? 'selected' : ''}>Unit 1</option>
                  <option value="2" ${isEdit && note.unit_number === 2 ? 'selected' : ''}>Unit 2</option>
                  <option value="3" ${isEdit && note.unit_number === 3 ? 'selected' : ''}>Unit 3</option>
                  <option value="4" ${isEdit && note.unit_number === 4 ? 'selected' : ''}>Unit 4</option>
                  <option value="5" ${isEdit && note.unit_number === 5 ? 'selected' : ''}>Unit 5</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Brief Description / Topics Covered</label>
              <textarea name="description" rows="2" class="form-control" placeholder="Highlights of topics, formulas, and DDU questions included...">${isEdit ? escapeHtml(note.description || '') : ''}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Attach PDF Document *</label>
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="file" id="note-file-upload" accept=".pdf" class="form-control" style="flex-grow: 1;">
                <button type="button" onclick="Admin.uploadFileField('note-file-upload', 'note-file-url-input', 'Notes')" class="btn-secondary btn-sm">
                  Upload File
                </button>
              </div>
              <input type="text" name="file_url" id="note-file-url-input" required value="${isEdit ? escapeHtml(note.file_url) : ''}" placeholder="/static/uploads/document.pdf" class="form-control" style="font-size: 0.8rem; background: var(--bg-main);">
            </div>

            <div style="display: flex; gap: 20px; align-items: center; margin-top: 10px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.88rem; cursor: pointer;">
                <input type="checkbox" name="is_important" ${isEdit && note.is_important ? 'checked' : ''}>
                Mark as High-Yield / Important
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.88rem; cursor: pointer;">
                <input type="checkbox" name="is_published" ${!isEdit || note.is_published ? 'checked' : ''}>
                Publish Immediately
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="App.closeActiveModal()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create & Publish Note'}</button>
          </div>
        </form>
      </div>
    `;
    App.showGenericModal(modalHtml);
  },

  openEditNoteModal(note) {
    this.openAddNoteModal(note);
  },

  async handleSaveNote(e, noteId) {
    e.preventDefault();
    const form = e.target;
    const body = {
      title: form.title.value.strip ? form.title.value.trim() : form.title.value,
      subject_id: parseInt(form.subject_id.value),
      unit_id: parseInt(form.unit_number.value), // maps to unit
      description: form.description.value,
      file_url: form.file_url.value,
      is_important: form.is_important.checked,
      is_published: form.is_published.checked
    };

    try {
      const url = noteId ? `/api/admin/notes/${noteId}` : "/api/admin/notes";
      const method = noteId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        App.closeActiveModal();
        App.toast(noteId ? "Note updated successfully!" : "New note published successfully!", "success");
        this.renderNotesTab(document.getElementById("admin-tab-content"));
      } else {
        const err = await res.json();
        App.toast(err.error || "Save failed", "error");
      }
    } catch (err) {
      App.toast(err.message, "error");
    }
  },

  async deleteNote(noteId) {
    if (!confirm("Are you sure you want to delete this study note?")) return;
    try {
      const res = await fetch(`/api/admin/notes/${noteId}`, {
        method: "DELETE",
        headers: Auth.getAuthHeaders()
      });
      if (res.ok) {
        App.toast("Note deleted successfully.", "info");
        this.renderNotesTab(document.getElementById("admin-tab-content"));
      }
    } catch (e) {
      App.toast("Delete failed", "error");
    }
  },

  // Modal: Add / Edit Subject
  openAddSubjectModal(subject = null) {
    const isEdit = !!subject;
    const modalHtml = `
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title">${isEdit ? 'Edit Subject' : 'Add New Subject'}</h3>
          <button onclick="App.closeActiveModal()" class="modal-close-btn">✕</button>
        </div>
        <form onsubmit="Admin.handleSaveSubject(event, ${isEdit ? subject.id : 'null'})">
          <div class="modal-body">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Subject Code *</label>
                <input type="text" name="code" required value="${isEdit ? escapeHtml(subject.code) : ''}" placeholder="e.g. BCS-301" class="form-control">
              </div>
              <div class="form-group">
                <label class="form-label">Semester *</label>
                <select name="semester_id" required class="form-control">
                  ${[1, 2, 3, 4, 5, 6, 7, 8].map(s => `
                    <option value="${s}" ${isEdit && subject.semester_number === s ? 'selected' : ''}>Semester ${s}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Subject Name *</label>
              <input type="text" name="name" required value="${isEdit ? escapeHtml(subject.name) : ''}" placeholder="e.g. Discrete Mathematics" class="form-control">
            </div>

            <div class="form-group">
              <label class="form-label">Branch *</label>
              <input type="text" name="branch" value="${isEdit ? escapeHtml(subject.branch) : 'CSE / IT'}" placeholder="e.g. CSE / IT or All Branches" class="form-control">
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea name="description" rows="2" class="form-control" placeholder="Course overview and syllabus highlights...">${isEdit ? escapeHtml(subject.description || '') : ''}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="App.closeActiveModal()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create Subject'}</button>
          </div>
        </form>
      </div>
    `;
    App.showGenericModal(modalHtml);
  },

  openEditSubjectModal(sub) {
    this.openAddSubjectModal(sub);
  },

  async handleSaveSubject(e, subId) {
    e.preventDefault();
    const form = e.target;
    const body = {
      code: form.code.value.trim().toUpperCase(),
      name: form.name.value.trim(),
      semester_id: parseInt(form.semester_id.value),
      branch: form.branch.value.trim(),
      description: form.description.value.trim()
    };

    try {
      const url = subId ? `/api/admin/subjects/${subId}` : "/api/admin/subjects";
      const method = subId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        App.closeActiveModal();
        App.toast(subId ? "Subject updated!" : "Subject created with 5 units!", "success");
        await this.preloadDropdowns();
        this.renderSubjectsTab(document.getElementById("admin-tab-content"));
      } else {
        const err = await res.json();
        App.toast(err.error || "Save failed", "error");
      }
    } catch (err) {
      App.toast(err.message, "error");
    }
  },

  async deleteSubject(subId) {
    if (!confirm("Are you sure? This will also remove associated units, notes, and pyqs for this subject!")) return;
    try {
      const res = await fetch(`/api/admin/subjects/${subId}`, {
        method: "DELETE",
        headers: Auth.getAuthHeaders()
      });
      if (res.ok) {
        App.toast("Subject deleted.", "info");
        await this.preloadDropdowns();
        this.renderSubjectsTab(document.getElementById("admin-tab-content"));
      }
    } catch (e) {
      App.toast("Delete failed", "error");
    }
  },

  // Modal: Add Syllabus
  openAddSyllabusModal() {
    const subOptions = this.cachedSubjects.map(s => `
      <option value="${s.id}">[Sem ${s.semester_number}] ${escapeHtml(s.code)} - ${escapeHtml(s.name)}</option>
    `).join('');

    const modalHtml = `
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title">Upload Syllabus PDF</h3>
          <button onclick="App.closeActiveModal()" class="modal-close-btn">✕</button>
        </div>
        <form onsubmit="Admin.handleSaveSyllabus(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Syllabus Title *</label>
              <input type="text" name="title" required placeholder="e.g. Official B.Tech CSE 3rd Sem Syllabus 2026" class="form-control">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Semester *</label>
                <select name="semester_id" required class="form-control">
                  ${[1, 2, 3, 4, 5, 6, 7, 8].map(s => `<option value="${s}">Semester ${s}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Subject</label>
                <select name="subject_id" class="form-control">
                  <option value="">-- All Semester Subjects --</option>
                  ${subOptions}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea name="description" rows="2" class="form-control" placeholder="Marks distribution, credit scheme, practicals..."></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Upload Syllabus PDF *</label>
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="file" id="syl-file-upload" accept=".pdf" class="form-control">
                <button type="button" onclick="Admin.uploadFileField('syl-file-upload', 'syl-file-url-input', 'Syllabus')" class="btn-secondary btn-sm">
                  Upload File
                </button>
              </div>
              <input type="text" name="file_url" id="syl-file-url-input" required placeholder="/static/uploads/syllabus.pdf" class="form-control">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="App.closeActiveModal()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Upload & Publish</button>
          </div>
        </form>
      </div>
    `;
    App.showGenericModal(modalHtml);
  },

  async handleSaveSyllabus(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
      title: form.title.value.trim(),
      semester_id: parseInt(form.semester_id.value),
      subject_id: form.subject_id.value ? parseInt(form.subject_id.value) : null,
      description: form.description.value.trim(),
      file_url: form.file_url.value.trim(),
      is_published: true
    };

    try {
      const res = await fetch("/api/admin/syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        App.closeActiveModal();
        App.toast("Syllabus uploaded successfully!", "success");
        this.renderSyllabusTab(document.getElementById("admin-tab-content"));
      }
    } catch (e) {
      App.toast(e.message, "error");
    }
  },

  async deleteSyllabus(id) {
    if (!confirm("Delete this syllabus entry?")) return;
    try {
      await fetch(`/api/admin/syllabus/${id}`, { method: "DELETE", headers: Auth.getAuthHeaders() });
      App.toast("Syllabus deleted", "info");
      this.renderSyllabusTab(document.getElementById("admin-tab-content"));
    } catch (e) {}
  },

  // Modal: Add PYQ
  openAddPyqModal() {
    const subOptions = this.cachedSubjects.map(s => `
      <option value="${s.id}">[Sem ${s.semester_number}] ${escapeHtml(s.code)} - ${escapeHtml(s.name)}</option>
    `).join('');

    const modalHtml = `
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title">Upload Previous Year Paper (PYQ)</h3>
          <button onclick="App.closeActiveModal()" class="modal-close-btn">✕</button>
        </div>
        <form onsubmit="Admin.handleSavePyq(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Paper Title *</label>
              <input type="text" name="paper_title" required placeholder="e.g. Data Structures End-Sem Exam Paper 2025" class="form-control">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Exam Year *</label>
                <input type="number" name="exam_year" required min="2018" max="2030" value="2025" class="form-control">
              </div>
              <div class="form-group">
                <label class="form-label">Semester *</label>
                <select name="semester_id" required class="form-control">
                  ${[1, 2, 3, 4, 5, 6, 7, 8].map(s => `<option value="${s}">Semester ${s}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Subject *</label>
                <select name="subject_id" required class="form-control">
                  ${subOptions}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Branch *</label>
                <input type="text" name="branch" value="CSE" required class="form-control">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Upload Question Paper PDF *</label>
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="file" id="pyq-file-upload" accept=".pdf" class="form-control">
                <button type="button" onclick="Admin.uploadFileField('pyq-file-upload', 'pyq-file-url-input', 'PYQ')" class="btn-secondary btn-sm">
                  Upload File
                </button>
              </div>
              <input type="text" name="file_url" id="pyq-file-url-input" required placeholder="/static/uploads/pyq.pdf" class="form-control">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="App.closeActiveModal()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Save & Publish Paper</button>
          </div>
        </form>
      </div>
    `;
    App.showGenericModal(modalHtml);
  },

  async handleSavePyq(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
      paper_title: form.paper_title.value.trim(),
      exam_year: parseInt(form.exam_year.value),
      semester_id: parseInt(form.semester_id.value),
      subject_id: parseInt(form.subject_id.value),
      branch: form.branch.value.trim(),
      file_url: form.file_url.value.trim()
    };

    try {
      const res = await fetch("/api/admin/pyqs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        App.closeActiveModal();
        App.toast("Previous year paper uploaded!", "success");
        this.renderPyqsTab(document.getElementById("admin-tab-content"));
      }
    } catch (e) {
      App.toast(e.message, "error");
    }
  },

  async deletePyq(id) {
    if (!confirm("Delete this PYQ paper?")) return;
    try {
      await fetch(`/api/admin/pyqs/${id}`, { method: "DELETE", headers: Auth.getAuthHeaders() });
      App.toast("Paper deleted", "info");
      this.renderPyqsTab(document.getElementById("admin-tab-content"));
    } catch (e) {}
  },

  // Modal: Add Daily Update
  openAddUpdateModal() {
    const modalHtml = `
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title">Post New Campus Update / Notice</h3>
          <button onclick="App.closeActiveModal()" class="modal-close-btn">✕</button>
        </div>
        <form onsubmit="Admin.handleSaveUpdate(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Notice Title *</label>
              <input type="text" name="title" required placeholder="e.g. Odd Semester Exam Timetable Dec 2026" class="form-control">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Category *</label>
                <select name="category" required class="form-control">
                  <option value="University Notice">University Notice</option>
                  <option value="Exam">Exam</option>
                  <option value="Result">Result</option>
                  <option value="Admit Card">Admit Card</option>
                  <option value="Syllabus">Syllabus</option>
                  <option value="Notes">Notes</option>
                  <option value="Previous Year Paper">Previous Year Paper</option>
                  <option value="Important Announcement">Important Announcement</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Publish Date</label>
                <input type="date" name="publish_date" value="${new Date().toISOString().split('T')[0]}" class="form-control">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Short Description *</label>
              <textarea name="short_description" required rows="2" class="form-control" placeholder="Quick 1-2 sentence preview for student noticeboard..."></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Full Details (Optional)</label>
              <textarea name="full_details" rows="3" class="form-control" placeholder="Complete circular content, guidelines, instructions..."></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Attachment (PDF or Image)</label>
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="file" id="update-file-upload" accept=".pdf,.png,.jpg,.jpeg,.webp" class="form-control">
                <button type="button" onclick="Admin.uploadFileField('update-file-upload', 'update-file-url-input', 'Notice')" class="btn-secondary btn-sm">
                  Upload Attachment
                </button>
              </div>
              <input type="text" name="attachment_url" id="update-file-url-input" placeholder="/static/uploads/circular.pdf" class="form-control">
            </div>

            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.88rem; cursor: pointer; margin-top: 10px;">
              <input type="checkbox" name="is_important">
              Mark as <span class="update-badge-important">Important</span> (Pins with visual indicator)
            </label>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="App.closeActiveModal()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Publish Update</button>
          </div>
        </form>
      </div>
    `;
    App.showGenericModal(modalHtml);
  },

  async handleSaveUpdate(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
      title: form.title.value.trim(),
      category: form.category.value,
      publish_date: form.publish_date.value,
      short_description: form.short_description.value.trim(),
      full_details: form.full_details.value.trim(),
      attachment_url: form.attachment_url.value.trim() || null,
      is_important: form.is_important.checked
    };

    try {
      const res = await fetch("/api/admin/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        App.closeActiveModal();
        App.toast("Campus update published successfully!", "success");
        this.renderUpdatesTab(document.getElementById("admin-tab-content"));
      }
    } catch (e) {
      App.toast(e.message, "error");
    }
  },

  async deleteUpdate(id) {
    if (!confirm("Delete this campus update?")) return;
    try {
      await fetch(`/api/admin/updates/${id}`, { method: "DELETE", headers: Auth.getAuthHeaders() });
      App.toast("Update deleted", "info");
      this.renderUpdatesTab(document.getElementById("admin-tab-content"));
    } catch (e) {}
  },

  // Student Account Status Toggle
  async toggleUserActive(userId) {
    try {
      const res = await fetch("/api/admin/users/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify({ user_id: userId })
      });
      if (res.ok) {
        App.toast("Student account status updated.", "success");
        this.renderStudentsTab(document.getElementById("admin-tab-content"));
      }
    } catch (e) {
      App.toast("Failed to toggle status", "error");
    }
  },

  async resetStudentPassword(userId, userName) {
    const newPass = prompt(`Set new password for student "${userName}" (minimum 6 characters):`);
    if (!newPass) return;
    if (newPass.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }
    try {
      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify({ user_id: userId, new_password: newPass })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Success! Password for "${userName}" has been updated to "${newPass}".`);
        App.toast(`Password updated for ${userName}`, "success");
      } else {
        alert("Failed to update password: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  },

  async deleteStudent(userId) {
    if (!confirm("Are you sure you want to permanently delete this student account?")) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: Auth.getAuthHeaders()
      });
      if (res.ok) {
        App.toast("Student account deleted.", "info");
        this.renderStudentsTab(document.getElementById("admin-tab-content"));
      }
    } catch (e) {
      App.toast("Delete failed", "error");
    }
  },

  togglePasswordVisibility(userId) {
    const el = document.getElementById(`pass-field-${userId}`);
    if (!el) return;
    const isRevealed = el.dataset.revealed === "true";
    if (isRevealed) {
      el.textContent = "••••••••";
      el.dataset.revealed = "false";
    } else {
      el.textContent = el.dataset.pass || "StudentPassword123!";
      el.dataset.revealed = "true";
    }
  },

  revealAllPasswords() {
    const passElements = document.querySelectorAll("[id^='pass-field-']");
    if (!passElements.length) return;
    const anyHidden = Array.from(passElements).some(el => el.dataset.revealed !== "true");
    passElements.forEach(el => {
      const pass = el.dataset.pass || "StudentPassword123!";
      if (anyHidden) {
        el.textContent = pass;
        el.dataset.revealed = "true";
      } else {
        el.textContent = "••••••••";
        el.dataset.revealed = "false";
      }
    });
    App.toast(anyHidden ? "Student passwords revealed." : "Student passwords hidden.", "info");
  },

  openAddStudentModal() {
    let modal = document.getElementById("admin-add-student-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "admin-add-student-modal";
      modal.className = "modal-overlay";
      modal.innerHTML = `
        <div class="modal-box" style="max-width: 500px; padding: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
            <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--text-main);">+ Register New Student</h3>
            <button type="button" onclick="document.getElementById('admin-add-student-modal').style.display='none'" class="modal-close" style="font-size: 1.4rem; background: none; border: none; cursor: pointer; color: var(--text-muted);">&times;</button>
          </div>
          <form id="admin-create-student-form" onsubmit="Admin.handleCreateStudent(event)">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.85rem;">Full Name *</label>
              <input type="text" name="full_name" required placeholder="e.g. Rahul Sharma" class="form-control" style="width: 100%;">
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.85rem;">Student Email *</label>
              <input type="email" name="email" required placeholder="e.g. rahul@ddu.ac.in" class="form-control" style="width: 100%;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label class="form-label" style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.85rem;">Branch</label>
                <select name="branch" class="form-control" style="width: 100%;">
                  <option value="CSE">CSE</option>
                  <option value="IT">IT</option>
                  <option value="ECE">ECE</option>
                  <option value="ME">ME</option>
                  <option value="CE">CE</option>
                  <option value="EE">EE</option>
                </select>
              </div>
              <div>
                <label class="form-label" style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.85rem;">Semester</label>
                <select name="semester" class="form-control" style="width: 100%;">
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                  <option value="3">Semester 3</option>
                  <option value="4">Semester 4</option>
                  <option value="5">Semester 5</option>
                  <option value="6">Semester 6</option>
                  <option value="7">Semester 7</option>
                  <option value="8">Semester 8</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 20px;">
              <label class="form-label" style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.85rem;">Account Password *</label>
              <input type="text" name="password" required value="StudentPassword123!" class="form-control" style="width: 100%;">
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button type="button" onclick="document.getElementById('admin-add-student-modal').style.display='none'" class="btn-secondary">Cancel</button>
              <button type="submit" class="btn-primary">Create Student Account</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.style.display = "flex";
  },

  async handleCreateStudent(e) {
    e.preventDefault();
    const form = e.target;
    const payload = {
      full_name: form.full_name.value.trim(),
      email: form.email.value.trim(),
      branch: form.branch.value,
      semester: parseInt(form.semester.value, 10),
      password: form.password.value
    };
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...Auth.getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        App.toast("Student account created successfully!", "success");
        document.getElementById("admin-add-student-modal").style.display = "none";
        form.reset();
        this.renderStudentsTab(document.getElementById("admin-tab-content"));
      } else {
        alert(data.error || "Failed to create student account.");
      }
    } catch(err) {
      alert("Error: " + err.message);
    }
  },

  syncStudents() {
    App.toast("Refreshing student accounts...", "info");
    this.renderStudentsTab(document.getElementById("admin-tab-content"));
  },

  async exportStudents() {
    try {
      const res = await fetch("/api/admin/users", { headers: Auth.getAuthHeaders() });
      const data = await res.json();
      const users = data.users || [];
      const blob = new Blob([JSON.stringify(users, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ddu_student_accounts_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      App.toast("Student accounts exported successfully!", "success");
    } catch(err) {
      alert("Export failed: " + err.message);
    }
  },

  async exportStudentsCsv() {
    try {
      const res = await fetch("/api/admin/users", { headers: Auth.getAuthHeaders() });
      const data = await res.json();
      const users = (data.users || []).filter(u => u.role !== 'ADMIN');
      if (users.length === 0) {
        App.toast("No student accounts found to export.", "info");
        return;
      }
      const headers = ["ID", "Full Name", "Email", "Password", "Branch", "Semester", "College", "Registration Time (IST)", "Status"];
      const rows = users.map(u => [
        u.id || "",
        `"${(u.full_name || "").replace(/"/g, '""')}"`,
        `"${(u.email || "").replace(/"/g, '""')}"`,
        `"${(u.plain_password || "").replace(/"/g, '""')}"`,
        `"${(u.branch || "CSE").replace(/"/g, '""')}"`,
        u.semester || 1,
        `"${(u.college || "Deen Dayal Upadhyaya Gorakhpur University").replace(/"/g, '""')}"`,
        `"${(u.created_at || "").replace(/"/g, '""')}"`,
        u.is_active ? "Active" : "Disabled"
      ]);
      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ddu_students_list_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      App.toast("Student accounts CSV exported successfully!", "success");
    } catch (err) {
      alert("CSV export failed: " + err.message);
    }
  },

  // Generic File Upload helper
  async uploadFileField(fileInputId, targetUrlInputId, category = "General") {
    const input = document.getElementById(fileInputId);
    if (!input || !input.files || input.files.length === 0) {
      App.toast("Please select a file to upload first.", "warning");
      return;
    }
    const file = input.files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    App.toast("Uploading file securely...", "info");
    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const target = document.getElementById(targetUrlInputId);
      if (target) target.value = data.file_url;
      App.toast(`File uploaded: ${data.original_name} (${data.file_size})`, "success");
    } catch (err) {
      App.toast(err.message, "error");
    }
  },

  openUploadModal() {
    const modalHtml = `
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title">Direct File Upload to Cloud Storage</h3>
          <button onclick="App.closeActiveModal()" class="modal-close-btn">✕</button>
        </div>
        <form onsubmit="Admin.handleDirectUpload(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Select Document / Image (PDF, JPG, PNG, WEBP)</label>
              <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" class="form-control">
            </div>
            <div class="form-group">
              <label class="form-label">Category</label>
              <select name="category" class="form-control">
                <option value="Notes">Notes Document</option>
                <option value="Syllabus">Syllabus PDF</option>
                <option value="PYQ">Previous Year Question Paper</option>
                <option value="Notice">University Circular / Notice</option>
                <option value="General">General Academic Resource</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="App.closeActiveModal()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Upload Now</button>
          </div>
        </form>
      </div>
    `;
    App.showGenericModal(modalHtml);
  },

  async handleDirectUpload(e) {
    e.preventDefault();
    const form = e.target;
    const file = form.file.files[0];
    const cat = form.category.value;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", cat);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      App.closeActiveModal();
      App.toast(`Uploaded ${data.original_name} successfully!`, "success");
      this.renderFilesTab(document.getElementById("admin-tab-content"));
    } catch (err) {
      App.toast(err.message, "error");
    }
  },

  async deleteFile(fileId) {
    if (!confirm("Delete this stored file? Any note referencing it may no longer display.")) return;
    try {
      await fetch(`/api/admin/files/${fileId}`, { method: "DELETE", headers: Auth.getAuthHeaders() });
      App.toast("File deleted from server.", "info");
      this.renderFilesTab(document.getElementById("admin-tab-content"));
    } catch (e) {}
  }
};
