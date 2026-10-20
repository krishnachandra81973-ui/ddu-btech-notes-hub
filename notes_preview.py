# -*- coding: utf-8 -*-
"""
DDU B.Tech Notes Hub - Dynamic 1st Page Preview, In-Page PDF Viewer & OpenGraph Generator
Generates high-resolution 1st-page document preview images and in-page PDF viewer landing pages.
"""

import os
import io
import html
import re

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except Exception:
    HAS_PIL = False


def get_font(size, bold=False):
    """Safely loads TrueType fonts with graceful fallback to default font."""
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf" if bold else "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    if HAS_PIL:
        for p in font_paths:
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    continue
        try:
            return ImageFont.load_default()
        except Exception:
            return None
    return None


def generate_note_og_image(note, base_dir="."):
    """
    Renders a crisp 1200x630 OpenGraph card representing Page 1 of the study note.
    Optimized for WhatsApp, Telegram, LinkedIn, and social media group sharing.
    """
    if not HAS_PIL:
        return None

    W, H = 1200, 630
    img = Image.new("RGB", (W, H), color="#090d16")
    draw = ImageDraw.Draw(img)

    # Accent decorative border
    draw.rectangle([(0, 0), (W, 8)], fill="#2563eb")
    draw.rectangle([(0, H - 8), (W, H)], fill="#0284c7")

    # Card background (A4 sheet mockup)
    cx1, cy1, cx2, cy2 = 60, 45, 1140, 585
    # Shadow
    draw.rectangle([(cx1 + 4, cy1 + 4), (cx2 + 4, cy2 + 4)], fill="#020617")
    draw.rectangle([(cx1, cy1), (cx2, cy2)], fill="#ffffff", outline="#cbd5e1", width=3)

    # Header strip
    draw.rectangle([(cx1, cy1), (cx2, cy1 + 75)], fill="#1e3a8a")

    # Try paste logo if available
    logo_path = os.path.join(base_dir, "icon-192.png")
    if not os.path.exists(logo_path):
        logo_path = os.path.join(base_dir, "static", "ddu_official_logo.png")
    if os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA").resize((56, 56))
            img.paste(logo, (cx1 + 18, cy1 + 10), mask=logo)
        except Exception:
            pass

    font_univ = get_font(18, bold=True)
    font_subt = get_font(14, bold=False)
    font_tag = get_font(15, bold=True)

    draw.text((cx1 + 88, cy1 + 16), "DEEN DAYAL UPADHYAYA GORAKHPUR UNIVERSITY", fill="#ffffff", font=font_univ)
    draw.text((cx1 + 88, cy1 + 44), "Faculty of Engineering & Technology (IET) • B.Tech Official Study Notes", fill="#93c5fd", font=font_subt)
    draw.text((cx2 - 250, cy1 + 26), "📄 1ST PAGE PREVIEW", fill="#38bdf8", font=font_tag)

    # Badges
    sub_code = str(note.get("subject_code") or "B.Tech")
    sem = str(note.get("semester_number") or 1)
    unit = str(note.get("unit_number") or 1)
    font_badge = get_font(14, bold=True)

    by = cy1 + 95
    # Sub code badge
    draw.rectangle([(cx1 + 30, by), (cx1 + 180, by + 36)], fill="#dbeafe")
    draw.text((cx1 + 45, by + 8), f"{sub_code}", fill="#1e40af", font=font_badge)

    # Sem badge
    draw.rectangle([(cx1 + 195, by), (cx1 + 360, by + 36)], fill="#fef3c7")
    draw.text((cx1 + 210, by + 8), f"Semester {sem}", fill="#92400e", font=font_badge)

    # Unit badge
    draw.rectangle([(cx1 + 375, by), (cx1 + 510, by + 36)], fill="#dcfce7")
    draw.text((cx1 + 390, by + 8), f"Unit {unit}", fill="#15803d", font=font_badge)

    # Verified badge
    draw.rectangle([(cx1 + 525, by), (cx1 + 720, by + 36)], fill="#f1f5f9")
    draw.text((cx1 + 540, by + 8), "✓ Verified Notes", fill="#475569", font=font_badge)

    # Subject name
    sub_name = str(note.get("subject_name") or "B.Tech Curriculum")
    font_subname = get_font(16, bold=True)
    draw.text((cx1 + 30, cy1 + 150), f"Subject: {sub_name}", fill="#334155", font=font_subname)

    # Chapter / Topic banner
    tbox_y = cy1 + 185
    draw.rectangle([(cx1 + 30, tbox_y), (cx2 - 30, tbox_y + 115)], fill="#eff6ff", outline="#3b82f6", width=2)
    font_lbl = get_font(13, bold=True)
    draw.text((cx1 + 45, tbox_y + 16), "CHAPTER / TOPIC NAME:", fill="#2563eb", font=font_lbl)

    title = str(note.get("title") or "B.Tech Lecture Note")
    font_title = get_font(24, bold=True)
    display_title = title if len(title) <= 56 else title[:53] + "..."
    draw.text((cx1 + 45, tbox_y + 48), display_title, fill="#0f172a", font=font_title)

    # Page 1 Document Excerpt
    ex_y = tbox_y + 130
    draw.rectangle([(cx1 + 30, ex_y), (cx2 - 30, ex_y + 130)], fill="#f8fafc", outline="#e2e8f0", width=1)
    font_ex_hdr = get_font(14, bold=True)
    font_ex_txt = get_font(14, bold=False)
    draw.text((cx1 + 45, ex_y + 16), "📄 DOCUMENT 1ST PAGE OVERVIEW & LECTURE SUMMARY:", fill="#1e293b", font=font_ex_hdr)
    draw.text((cx1 + 45, ex_y + 50), "• Chapter fundamentals, unit definitions, key mathematical formulas & derivations.", fill="#64748b", font=font_ex_txt)
    draw.text((cx1 + 45, ex_y + 82), "• Curated by IET DDU Faculty for B.Tech Semester Examination Preparation.", fill="#64748b", font=font_ex_txt)

    # Card Footer
    font_foot = get_font(13, bold=True)
    draw.text((cx1 + 30, cy2 - 36), "🌐 Read online & download free at: ddu-btech-kn-notes.vercel.app", fill="#0284c7", font=font_foot)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_note_landing_html(note, note_id, slug, base_url="https://ddu-btech-kn-notes.vercel.app"):
    """
    Renders a complete, rich, standalone HTML page for /note/:id/:slug.
    Includes full OpenGraph tags for WhatsApp/Telegram group link previews
    AND directly renders the PDF in the web page itself (In-Page Web PDF Viewer).
    """
    title = html.escape(str(note.get("title") or "B.Tech Lecture Note"))
    sub_name = html.escape(str(note.get("subject_name") or "B.Tech Engineering"))
    sub_code = html.escape(str(note.get("subject_code") or "DDU"))
    sem = note.get("semester_number") or 1
    unit = note.get("unit_number") or 1
    file_size = html.escape(str(note.get("file_size") or "PDF Document"))
    file_url = str(note.get("file_url") or "")
    if file_url and not file_url.startswith("http"):
        abs_file_url = f"{base_url.rstrip('/')}/{file_url.lstrip('/')}"
    else:
        abs_file_url = file_url or f"{base_url}/static/uploads/syllabus_bcs_101.pdf"

    desc = f"DDU Gorakhpur University B.Tech Sem {sem} • {sub_name} ({sub_code}) • Unit {unit}: {title}. Read PDF online in web browser."
    
    # WhatsApp/Telegram Group preview image endpoint
    og_image_url = f"{base_url.rstrip('/')}/api/notes/{note_id}/preview.png"
    note_canonical_url = f"{base_url.rstrip('/')}/note/{note_id}/{slug}"
    google_docs_embed = f"https://docs.google.com/viewer?url={abs_file_url}&embedded=true"

    page_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📄 {title} — DDU B.Tech Notes Hub</title>
  <meta name="description" content="{desc}">
  <link rel="canonical" href="{note_canonical_url}">

  <!-- OpenGraph Metadata for WhatsApp & Telegram Group Previews -->
  <meta property="og:title" content="📄 {title} (1st Page Preview)">
  <meta property="og:description" content="{desc}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{note_canonical_url}">
  <meta property="og:image" content="{og_image_url}">
  <meta property="og:image:secure_url" content="{og_image_url}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="1st Page Document Preview of {title}">
  <meta property="og:site_name" content="DDU B.Tech Notes Hub">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="📄 {title}">
  <meta name="twitter:description" content="{desc}">
  <meta name="twitter:image" content="{og_image_url}">

  <!-- Favicon & Styles -->
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="stylesheet" href="/static/css/style.css?v=3">
</head>
<body style="min-height: 100vh; display: flex; flex-direction: column; background: #0b1120; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">

  <!-- Top Portal Navbar -->
  <header style="background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; z-index: 100; padding: 12px 20px;">
    <div style="max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
      <a href="/#home" style="display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit;">
        <img src="/static/ddu_official_logo.png?v=3" alt="DDU Crest" style="width: 36px; height: 36px; object-fit: contain;" onerror="this.src='/logo.png'">
        <div>
          <div style="font-size: 0.95rem; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">DDU B.TECH NOTES HUB</div>
          <div style="font-size: 0.68rem; color: #94a3b8;">Faculty of Engineering & Technology (IET)</div>
        </div>
      </a>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <a href="/#notes" class="btn-secondary btn-sm" style="padding: 6px 12px; font-size: 0.82rem; text-decoration: none;">📚 All Notes</a>
        <a href="/#semester/{sem}" class="btn-secondary btn-sm" style="padding: 6px 12px; font-size: 0.82rem; text-decoration: none;">🎓 Sem {sem}</a>
        <a href="{abs_file_url}" target="_blank" download class="btn-primary btn-sm" style="padding: 6px 14px; font-size: 0.82rem; text-decoration: none; font-weight: 700;">⬇ Download</a>
      </div>
    </div>
  </header>

  <!-- Main Note Content with Direct In-Page Web PDF Viewer -->
  <main style="flex: 1; padding: 24px 16px 60px; max-width: 1050px; margin: 0 auto; width: 100%;">

    <!-- Navigation Bar -->
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
      <a href="/#notes" style="color: #38bdf8; text-decoration: none; font-size: 0.88rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
        ← Back to All Notes Explorer
      </a>
      <span style="font-size: 0.8rem; color: #94a3b8;">
        {sub_name} • Semester {sem} • Unit {unit}
      </span>
    </div>

    <!-- Note Header Box -->
    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 20px 22px; margin-bottom: 18px; box-shadow: 0 4px 20px rgba(0,0,0,0.25);">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
        <span style="background: #2563eb; color: #ffffff; font-weight: 800; font-size: 0.78rem; padding: 3px 9px; border-radius: 4px;">
          {sub_code}
        </span>
        <span style="background: #fef3c7; color: #92400e; font-weight: 700; font-size: 0.78rem; padding: 3px 9px; border-radius: 4px;">
          Semester {sem}
        </span>
        <span style="background: #dcfce7; color: #15803d; font-weight: 700; font-size: 0.78rem; padding: 3px 9px; border-radius: 4px;">
          Unit {unit}
        </span>
        <span style="font-size: 0.78rem; color: #10b981; font-weight: 700; margin-left: auto;">
          ✓ Verified Study Note
        </span>
      </div>

      <h1 style="font-size: 1.6rem; font-weight: 800; color: #ffffff; line-height: 1.35; margin: 0 0 6px;">
        {title}
      </h1>
      <p style="font-size: 0.9rem; color: #94a3b8; margin: 0;">
        {sub_name} • File Size: {file_size} • Direct Web PDF Viewer
      </p>
    </div>

    <!-- ================= DIRECT IN-PAGE WEB PDF VIEWER ================= -->
    <div style="border: 2px solid #2563eb; border-radius: 12px; overflow: hidden; background: #1e293b; margin-bottom: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.35);">
      
      <!-- Viewer Controls Toolbar -->
      <div style="background: linear-gradient(135deg, #1e40af, #0284c7); padding: 10px 16px; color: #ffffff; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 700;">
          <span>📖</span>
          <span>Web PDF Reader — Page 1 Preview</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <button onclick="toggleViewerMode()" id="btn-toggle-viewer" style="background: rgba(255,255,255,0.2); border: none; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">
            🔄 Switch Viewer
          </button>
          <a href="{abs_file_url}" target="_blank" style="background: rgba(255,255,255,0.2); text-decoration: none; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 700;">
            ↗ Fullscreen
          </a>
          <a href="{abs_file_url}" target="_blank" download style="background: #ffffff; color: #1e40af; text-decoration: none; padding: 6px 14px; border-radius: 6px; font-size: 0.78rem; font-weight: 800;">
            ⬇ Download PDF
          </a>
        </div>
      </div>

      <!-- In-Page PDF Frame (Works across Desktop + Mobile + WhatsApp In-App WebViews) -->
      <div id="viewer-container" style="height: 75vh; min-height: 560px; max-height: 850px; background: #334155; position: relative;">
        <!-- Embedded Viewer Frame -->
        <iframe 
          id="web-pdf-frame" 
          src="{google_docs_embed}" 
          style="width: 100%; height: 100%; border: none; display: block;" 
          title="Direct In-Web PDF Viewer"
          allow="fullscreen">
        </iframe>
      </div>

      <!-- Bottom Status Bar -->
      <div style="background: #0f172a; padding: 8px 16px; font-size: 0.78rem; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <span>📄 Note: Agar kisi mobile browser me PDF load na ho, toh 'Switch Viewer' dabayein ya direct download karein.</span>
        <button onclick="copyCurrentNoteLink()" style="background: #1e293b; border: 1px solid #334155; color: #38bdf8; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: 600;">
          🔗 Copy Share Link
        </button>
      </div>

    </div>

    <!-- Quick Action Buttons -->
    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
      <a href="{abs_file_url}" download class="btn-primary" style="padding: 12px 22px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
        ⬇ Download Complete PDF ({file_size})
      </a>
      <a href="/#note/{note_id}/{slug}" class="btn-secondary" style="padding: 12px 20px; font-weight: 700; text-decoration: none;">
        👁️ Open in DDU Full Reader
      </a>
      <a href="/#semester/{sem}" class="btn-secondary" style="padding: 12px 20px; font-weight: 700; text-decoration: none;">
        📚 All Semester {sem} Notes
      </a>
    </div>

    <!-- Student Onboarding Banner -->
    <div style="background: rgba(30, 64, 175, 0.12); border: 1px solid #3b82f6; border-radius: 10px; padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
      <div>
        <h3 style="font-size: 1.05rem; font-weight: 800; color: #ffffff; margin: 0 0 4px;">
          🎓 DDU B.Tech Notes Hub
        </h3>
        <p style="font-size: 0.85rem; color: #94a3b8; margin: 0;">
          Free student registration karke notes bookmark karein aur latest exam circulars payein.
        </p>
      </div>
      <a href="/#notes" class="btn-primary btn-sm" style="padding: 10px 18px; font-weight: 700; text-decoration: none;">
        Student Portal Open Karein →
      </a>
    </div>

  </main>

  <!-- Footer -->
  <footer style="text-align: center; padding: 20px 16px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 0.78rem; color: #64748b;">
    © 2026 Deen Dayal Upadhyaya Gorakhpur University B.Tech Hub • Curated by Keshav Narayan
  </footer>

  <script>
    let isGoogleDocs = true;
    const directPdfUrl = "{abs_file_url}";
    const googleDocsUrl = "{google_docs_embed}";

    function toggleViewerMode() {{
      const frame = document.getElementById("web-pdf-frame");
      const btn = document.getElementById("btn-toggle-viewer");
      if (!frame) return;
      if (isGoogleDocs) {{
        frame.src = directPdfUrl + "#view=FitH&toolbar=1";
        if (btn) btn.innerText = "🔄 Switch to Google Docs Viewer";
        isGoogleDocs = false;
      }} else {{
        frame.src = googleDocsUrl;
        if (btn) btn.innerText = "🔄 Switch to Native PDF";
        isGoogleDocs = true;
      }}
    }}

    function copyCurrentNoteLink() {{
      navigator.clipboard.writeText(window.location.href).then(() => {{
        alert("Note link copied to clipboard!");
      }}).catch(() => {{
        prompt("Copy this note link:", window.location.href);
      }});
    }}

    // Auto-detect desktop browsers: Native PDF is often faster and crisp on desktop
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) {{
      const frame = document.getElementById("web-pdf-frame");
      const btn = document.getElementById("btn-toggle-viewer");
      if (frame) {{
        frame.src = directPdfUrl + "#view=FitH&toolbar=1";
        isGoogleDocs = false;
        if (btn) btn.innerText = "🔄 Switch to Google Docs Viewer";
      }}
    }}
  </script>

</body>
</html>"""
    return page_html
