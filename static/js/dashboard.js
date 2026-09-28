/**
 * DDU B.Tech Notes Hub - Student Dashboard Controller
 */

const Dashboard = {
  async render(container) {
    if (!Auth.currentUser) {
      container.innerHTML = `
        <div style="text-align: center; padding: 80px 20px;">
          <div style="font-size: 3rem; margin-bottom: 12px;">🔒</div>
          <h2 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 10px;">Student Login Required</h2>
          <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto 24px;">
            Please log in or create a student account to access your personal dashboard, bookmarks, and recent notes.
          </p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button onclick="Auth.openModal('login')" class="btn-primary">Log In Now</button>
            <button onclick="Auth.openModal('register')" class="btn-secondary">Create Account</button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="text-align: center; padding: 40px 0;">
        <div class="loading-spinner" style="margin: 0 auto 12px;"></div>
        <p style="color: var(--text-muted);">Loading your student dashboard...</p>
      </div>
    `;

    try {
      const [dashRes, subRes] = await Promise.all([
        fetch("/api/student/dashboard", { headers: Auth.getAuthHeaders() }),
        fetch("/api/student/notes/my-submissions", { headers: Auth.getAuthHeaders() })
      ]);
      if (!dashRes.ok) {
        throw new Error("Failed to load dashboard data");
      }
      const data = await dashRes.json();
      const subData = subRes.ok ? await subRes.json() : { submissions: [] };
      this.renderDashboardView(container, data, subData.submissions || []);
    } catch (err) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <p style="color: var(--accent-rose); font-weight: 600;">Error: ${err.message}</p>
          <button onclick="Dashboard.render(document.getElementById('main-content'))" class="btn-primary btn-sm" style="margin-top: 14px;">Retry</button>
        </div>
      `;
    }
  },

  renderDashboardView(container, data, submissions = []) {
    const { user, bookmarks, recent_notes, latest_updates, recent_papers } = data;
    
    container.innerHTML = `
      <div class="container" style="padding-top: 40px; padding-bottom: 60px;">
        <!-- Welcome Banner -->
        <div style="background: linear-gradient(135deg, rgba(30, 64, 175, 0.12), rgba(14, 165, 233, 0.08)); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 30px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
              <span class="hero-badge" style="margin-bottom: 0;">Student Portal</span>
              <span style="font-size: 0.85rem; color: var(--text-muted);">ID: #DDU-${user.id.toString().padStart(4, '0')}</span>
            </div>
            <h1 style="font-size: 2rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">
              Welcome back, ${escapeHtml(user.full_name)}! 👋
            </h1>
            <p style="color: var(--text-muted); font-size: 0.95rem;">
              <strong>${escapeHtml(user.branch)}</strong> • Semester ${user.semester} • ${escapeHtml(user.college)}
            </p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button onclick="App.openSubmitNoteModal()" class="btn-primary" style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #10b981, #059669); border: none; font-weight: 700;">
              <span>+</span> Add / Contribute Note
            </button>
            <a href="#semester/${user.semester}" class="btn-secondary" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              My Semester Notes
            </a>
            <a href="#syllabus" class="btn-secondary">
              View Syllabus
            </a>
          </div>
        </div>

        <!-- Quick Stats Cards -->
        <div class="stats-grid" style="margin-bottom: 36px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
          <div class="stat-card">
            <div class="stat-icon" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);">
              🔖
            </div>
            <div>
              <div class="stat-value">${bookmarks.length}</div>
              <div class="stat-label">Bookmarked Notes</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: rgba(14, 165, 233, 0.15); color: var(--accent-cyan);">
              📝
            </div>
            <div>
              <div class="stat-value">${submissions.length}</div>
              <div class="stat-label">My Contributions</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">
              ⏱️
            </div>
            <div>
              <div class="stat-value">${recent_notes.length}</div>
              <div class="stat-label">Recently Viewed</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber);">
              📑
            </div>
            <div>
              <div class="stat-value">${recent_papers.length}</div>
              <div class="stat-label">Available PYQs</div>
            </div>
          </div>
        </div>

        <!-- Main Dashboard 2-Column Grid -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 30px;" id="dashboard-two-col">
          <!-- Left Column: Bookmarks & History -->
          <div>
            <!-- Bookmarked Notes -->
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 24px; margin-bottom: 30px; box-shadow: var(--shadow-sm);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
                <h3 style="font-size: 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                  <span>⭐</span> Saved / Bookmarked Notes
                </h3>
                <span class="badge" style="background: var(--primary-light); color: var(--primary); padding: 3px 8px; border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 700;">
                  ${bookmarks.length} Notes
                </span>
              </div>

              ${bookmarks.length === 0 ? `
                <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                  <p>You haven't bookmarked any notes yet.</p>
                  <p style="font-size: 0.85rem; margin-top: 6px;">Click the bookmark icon (⭐) on any subject note to save it here for quick exam revision.</p>
                  <a href="#notes" class="btn-secondary btn-sm" style="margin-top: 12px;">Browse All Notes</a>
                </div>
              ` : `
                <div class="notes-pill-list">
                  ${bookmarks.map(b => `
                    <div class="note-row">
                      <div class="note-info">
                        <span class="subject-code-tag">${escapeHtml(b.subject_code)}</span>
                        <div>
                          <div class="note-title">${escapeHtml(b.title)}</div>
                          <div style="font-size: 0.76rem; color: var(--primary); font-weight: 500; margin-top: 2px;">
                            Detailed notes will be shared in PDF format shortly.
                          </div>
                          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                            ${escapeHtml(b.subject_name)} • Sem ${b.semester_number} • ${b.file_size || 'PDF'}
                          </div>
                        </div>
                      </div>
                      <div class="note-actions">
                        <button onclick="App.openPdfViewer('${b.file_url}', '${escapeHtml(b.title)}', ${b.id})" class="btn-secondary btn-sm">
                          View
                        </button>
                        <a href="${App.getDownloadUrl(b.file_url)}" ${App.isGoogleDriveUrl(b.file_url) ? 'target="_blank" rel="noopener noreferrer"' : 'download'} class="btn-primary btn-sm">
                          Download
                        </a>
                        <button onclick="App.shareNote(${b.id}, '${escapeHtml(b.title)}')" class="btn-secondary btn-sm" title="Share Note" style="display: inline-flex; align-items: center; gap: 4px;">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                          Share
                        </button>
                        <button onclick="Dashboard.removeBookmark(${b.id})" title="Remove bookmark" style="color: var(--accent-amber); font-size: 1.1rem; padding: 4px;">
                          ★
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- My Contributed Notes Section -->
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 24px; margin-bottom: 30px; box-shadow: var(--shadow-sm);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                <div>
                  <h3 style="font-size: 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                    <span>📝</span> My Contributed Notes
                  </h3>
                  <p style="font-size: 0.8rem; color: var(--text-muted); margin: 2px 0 0 0;">Track verification & live status of notes submitted by you</p>
                </div>
                <button onclick="App.openSubmitNoteModal()" class="btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 700;">
                  <span>+</span> Submit New Note
                </button>
              </div>

              ${submissions.length === 0 ? `
                <div style="text-align: center; padding: 26px 20px; color: var(--text-muted); font-size: 0.88rem; background: var(--bg-main); border-radius: var(--radius-sm); border: 1px dashed var(--border);">
                  <div style="font-size: 2rem; margin-bottom: 8px;">📚</div>
                  <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Aapne abhi tak koi study note contribute nahi kiya hai.</div>
                  <p style="font-size: 0.8rem; max-width: 440px; margin: 0 auto 14px;">Apne handwritten ya digitized notes submit karein — admin verification ("tick") ke baad pure DDU ke students ke saath share honge!</p>
                  <button onclick="App.openSubmitNoteModal()" class="btn-secondary btn-sm">+ Share Notes Now</button>
                </div>
              ` : `
                <div class="notes-pill-list">
                  ${submissions.map(s => {
                    let statusBadge = '';
                    if (s.status === 'APPROVED' || s.is_verified === 1) {
                      statusBadge = '<span style="background: rgba(16, 185, 129, 0.15); color: #059669; border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><span>✅</span> Verified & Live on Portal</span>';
                    } else if (s.status === 'REJECTED') {
                      statusBadge = '<span style="background: rgba(239, 68, 68, 0.15); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.3); padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><span>❌</span> Rejected / Needs Revision</span>';
                    } else {
                      statusBadge = '<span style="background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><span>⏳</span> Pending Admin Verification</span>';
                    }
                    return `
                      <div class="note-row" style="padding: 12px 16px;">
                        <div class="note-info">
                          <span class="subject-code-tag">${escapeHtml(s.subject_code || 'NOTE')}</span>
                          <div>
                            <div style="font-weight: 700; font-size: 0.92rem;">${escapeHtml(s.title)}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                              ${escapeHtml(s.subject_name || '')} • ${s.unit_number ? `Unit ${s.unit_number}` : 'General'} • ${s.created_at || ''}
                            </div>
                            <div style="margin-top: 6px;">
                              ${statusBadge}
                            </div>
                          </div>
                        </div>
                        <div class="note-actions">
                          <button onclick="App.openPdfViewer('${s.file_url}', '${escapeHtml(s.title)}', ${s.id})" class="btn-secondary btn-sm">
                            Preview
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>

            <!-- Recently Viewed Notes -->
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 24px; box-shadow: var(--shadow-sm);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
                <h3 style="font-size: 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                  <span>🕒</span> Recently Viewed Notes
                </h3>
              </div>

              ${recent_notes.length === 0 ? `
                <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.9rem;">
                  No recently viewed notes. Start exploring your semester subjects!
                </div>
              ` : `
                <div class="notes-pill-list">
                  ${recent_notes.map(r => `
                    <div class="note-row">
                      <div class="note-info">
                        <span style="font-weight: 700; font-size: 0.82rem; color: var(--primary);">${escapeHtml(r.subject_code)}</span>
                        <div>
                          <div style="font-weight: 600; font-size: 0.88rem;">${escapeHtml(r.title)}</div>
                          <div style="font-size: 0.75rem; color: var(--primary); font-weight: 500; margin-top: 2px;">
                            Detailed notes will be shared in PDF format shortly.
                          </div>
                          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                            ${escapeHtml(r.subject_name)}
                          </div>
                        </div>
                      </div>
                      <div class="note-actions">
                        <button onclick="App.openPdfViewer('${r.file_url}', '${escapeHtml(r.title)}', ${r.id})" class="btn-secondary btn-sm">
                          View PDF
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>

          <!-- Right Column: Campus Notices & Quick Actions -->
          <div>
            <!-- Latest Updates Card -->
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 24px; margin-bottom: 30px; box-shadow: var(--shadow-sm);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                <h3 style="font-size: 1.15rem; font-weight: 700;">📢 Campus Updates</h3>
                <a href="#updates" style="font-size: 0.82rem; color: var(--primary); font-weight: 600;">View All →</a>
              </div>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                ${latest_updates.map(u => `
                  <div style="padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                      <span style="font-size: 0.72rem; font-weight: 700; color: var(--primary);">${escapeHtml(u.category)}</span>
                      ${u.is_important ? `<span class="update-badge-important">Important</span>` : ''}
                      <span style="font-size: 0.72rem; color: var(--text-muted); margin-left: auto;">${u.publish_date}</span>
                    </div>
                    <div style="font-weight: 600; font-size: 0.88rem; margin-bottom: 4px; color: var(--text-main);">
                      ${escapeHtml(u.title)}
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
                      ${escapeHtml(u.short_description)}
                    </p>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Profile Info Card -->
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 24px; box-shadow: var(--shadow-sm);">
              <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                👤 Academic Profile
              </h3>
              <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.88rem;">
                <div><strong>Full Name:</strong> ${escapeHtml(user.full_name)}</div>
                <div><strong>Email:</strong> ${escapeHtml(user.email)}</div>
                <div><strong>Course:</strong> ${escapeHtml(user.course)}</div>
                <div><strong>Branch:</strong> ${escapeHtml(user.branch)}</div>
                <div><strong>Current Semester:</strong> Semester ${user.semester}</div>
                <div><strong>University:</strong> ${escapeHtml(user.college)}</div>
              </div>
              <button onclick="App.toast('Profile settings are currently synced with university registration.', 'info')" class="btn-secondary btn-sm" style="width: 100%; margin-top: 18px;">
                Edit Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async removeBookmark(noteId) {
    try {
      const res = await fetch("/api/student/bookmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...Auth.getAuthHeaders()
        },
        body: JSON.stringify({ note_id: noteId })
      });
      if (res.ok) {
        App.toast("Bookmark removed.", "info");
        this.render(document.getElementById("main-content"));
      }
    } catch (e) {
      App.toast("Failed to update bookmark.", "error");
    }
  }
};
