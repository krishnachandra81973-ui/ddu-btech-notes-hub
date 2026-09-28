from http.server import BaseHTTPRequestHandler
import json
import sqlite3
import os
import sys
import shutil
import urllib.parse
import time
import secrets
import threading
import re
import html

try:
    import notes_preview
except Exception:
    notes_preview = None

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

SEED_DB = os.path.join(BASE_DIR, "ddu_seed.db")
ORIGINAL_DB = SEED_DB if os.path.exists(SEED_DB) else os.path.join(BASE_DIR, "ddu_portal.db")
TMP_DB = "/tmp/ddu_portal.db"

is_serverless = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or not os.access(BASE_DIR, os.W_OK))

if is_serverless:
    if not os.path.exists(TMP_DB) or os.path.getsize(TMP_DB) == 0:
        if os.path.exists(ORIGINAL_DB):
            try:
                shutil.copy2(ORIGINAL_DB, TMP_DB)
            except Exception:
                pass
    DB_PATH = TMP_DB
else:
    DB_PATH = ORIGINAL_DB

import database
import user_registry
database.DB_PATH = DB_PATH
try:
    database.ensure_db_initialized()
except Exception:
    pass
try:
    database.ensure_db_schema()
except Exception:
    pass

# Security & Defense Configurations
_RATE_LIMIT_LOCK = threading.Lock()
_FAILED_LOGINS = {}      # key: ip_or_email, value: [timestamps]
_REGISTER_ATTEMPTS = {}  # key: ip, value: [timestamps]
_IP_REQUEST_LOG = {}     # key: ip, value: [timestamps]

ALLOWED_ORIGINS = {
    "https://ddu-btech-kn-notes.vercel.app",
    "http://localhost:3000",
    "http://localhost:5000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5000"
}

def is_rate_limited(ip, email="", action="request"):
    now = time.time()
    with _RATE_LIMIT_LOCK:
        if action == "login":
            keys = [k for k in [ip, f"em:{email.lower().strip()}" if email else None] if k]
            for key in keys:
                attempts = [t for t in _FAILED_LOGINS.get(key, []) if now - t < 300]
                _FAILED_LOGINS[key] = attempts
                if len(attempts) >= 5:
                    retry_after = max(1, 300 - int(now - attempts[0]))
                    return True, retry_after
            return False, 0
        elif action == "register":
            attempts = [t for t in _REGISTER_ATTEMPTS.get(ip, []) if now - t < 600]
            _REGISTER_ATTEMPTS[ip] = attempts
            if len(attempts) >= 5:
                retry_after = max(1, 600 - int(now - attempts[0]))
                return True, retry_after
            return False, 0
    return False, 0

def record_failed_login(ip, email=""):
    now = time.time()
    with _RATE_LIMIT_LOCK:
        for key in [ip, f"em:{email.lower().strip()}" if email else None]:
            if key:
                lst = _FAILED_LOGINS.setdefault(key, [])
                lst.append(now)
                _FAILED_LOGINS[key] = [t for t in lst if now - t < 300]

def record_successful_login(ip, email=""):
    with _RATE_LIMIT_LOCK:
        for key in [ip, f"em:{email.lower().strip()}" if email else None]:
            if key in _FAILED_LOGINS:
                del _FAILED_LOGINS[key]

def record_successful_register(ip):
    now = time.time()
    with _RATE_LIMIT_LOCK:
        lst = _REGISTER_ATTEMPTS.setdefault(ip, [])
        lst.append(now)
        _REGISTER_ATTEMPTS[ip] = [t for t in lst if now - t < 600]

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def get_client_ip(self):
        xff = self.get_header("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
        if hasattr(self, "client_address") and self.client_address:
            return str(self.client_address[0])
        return "127.0.0.1"

    def send_cors(self):
        origin = self.get_header("Origin", "")
        if origin:
            is_allowed = (
                origin in ALLOWED_ORIGINS
                or origin.endswith(".vercel.app")
                or "localhost" in origin
                or "127.0.0.1" in origin
            )
            if is_allowed:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Credentials", "true")
            else:
                self.send_header("Access-Control-Allow-Origin", "https://ddu-btech-kn-notes.vercel.app")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def send_security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("X-XSS-Protection", "1; mode=block")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_cors()
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.send_security_headers()
        self.end_headers()

    def get_header(self, name, default=""):
        if not hasattr(self, "headers") or not self.headers:
            return default
        name_lower = name.lower()
        try:
            for k, v in self.headers.items():
                if k.lower() == name_lower:
                    return v
        except Exception:
            pass
        return self.headers.get(name, default)

    def get_auth_user(self):
        auth_header = self.get_header("Authorization", "")
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        elif auth_header:
            token = auth_header.strip()
        if not token:
            cookie_header = self.get_header("Cookie", "")
            if "ddu_token=" in cookie_header:
                for part in cookie_header.split(";"):
                    if "ddu_token=" in part:
                        token = part.split("ddu_token=")[1].strip()
                        break
        if not token:
            return None

        # 1. Primary: Stateless Cryptographic Verification (HMAC-SHA256)
        verified = user_registry.verify_auth_token(token)
        if verified:
            if verified.get("role") == "ADMIN" or verified.get("email", "").lower().strip() == user_registry.ADMIN_EMAIL.lower():
                return dict(user_registry.ADMIN_USER)
            return verified

        # 2. Database Session Lookup Fallback
        user = database.get_user_from_token(token)
        if user:
            if user.get("role") == "ADMIN" or user.get("email", "").lower().strip() == user_registry.ADMIN_EMAIL.lower():
                return dict(user_registry.ADMIN_USER)
            return user

        # Reject all unverified/backdoor tokens
        return None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            # 0. Direct File Serving for Uploaded PDFs, Images & Academic Assets
            if path.startswith("/static/uploads/") or path.startswith("/api/files/"):
                if path.startswith("/static/uploads/"):
                    rel_file = path.replace("/static/uploads/", "").lstrip("/")
                else:
                    rel_file = path.replace("/api/files/", "").lstrip("/")
                
                fname = os.path.basename(rel_file)
                candidates = [
                    os.path.join(BASE_DIR, "static", "uploads", rel_file),
                    os.path.join(BASE_DIR, "static", "uploads", "notes", fname),
                    os.path.join(BASE_DIR, "static", "uploads", fname),
                    os.path.join("/tmp", "uploads", fname),
                    os.path.join("/tmp", "uploads", "notes", fname),
                    os.path.join("/tmp", fname),
                ]
                found_path = None
                for c in candidates:
                    if os.path.exists(c) and os.path.isfile(c):
                        found_path = c
                        break
                
                if found_path:
                    ext = os.path.splitext(found_path)[1].lower()
                    mime_types = {
                        ".pdf": "application/pdf",
                        ".png": "image/png",
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".webp": "image/webp",
                        ".svg": "image/svg+xml"
                    }
                    ct = mime_types.get(ext, "application/octet-stream")
                    with open(found_path, "rb") as f:
                        file_data = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", ct)
                    self.send_header("Content-Length", str(len(file_data)))
                    self.send_header("Content-Disposition", f'inline; filename="{fname}"')
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "public, max-age=86400")
                    self.end_headers()
                    self.wfile.write(file_data)
                    return

                # If not found in local containers, redirect to CDN / GitHub Raw
                github_repo = os.environ.get("GITHUB_REPO", "krishnachandra81973-ui/ddu-btech-notes-hub")
                cdn_url = f"https://cdn.jsdelivr.net/gh/{github_repo}@main/static/uploads/{rel_file}"
                self.send_response(302)
                self.send_header("Location", cdn_url)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                return

            # Dynamic Shared Note Landing with Direct In-Page Web PDF Viewer & OpenGraph Meta
            if path.startswith("/note/"):
                parts = [p for p in path.split("/") if p]
                # parts[0] == 'note', parts[1] == note_id, parts[2] == optional slug
                note_id = None
                if len(parts) >= 2 and parts[1].isdigit():
                    note_id = int(parts[1])
                
                note = None
                if note_id:
                    notes = database.get_notes(note_id=note_id, only_published=True)
                    if notes:
                        note = notes[0]
                
                if note:
                    slug = parts[2] if len(parts) >= 3 and parts[2] else re.sub(r'[^\w\s-]', '', str(note.get("title") or "")).strip().replace(' ', '-')
                    host_header = self.headers.get("Host", "ddu-btech-kn-notes.vercel.app")
                    scheme = "https" if "vercel.app" in host_header else "http"
                    base_url = f"{scheme}://{host_header}"
                    if notes_preview:
                        page_html = notes_preview.render_note_landing_html(note, note_id, slug, base_url=base_url)
                    else:
                        title = html.escape(str(note.get("title") or "B.Tech Lecture Note"))
                        page_html = f"<!DOCTYPE html><html><head><title>{title}</title><meta http-equiv='refresh' content='0; url=/#note/{note_id}/{slug}'></head><body><p>Opening note...</p></body></html>"
                    
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Cache-Control", "public, max-age=3600")
                    self.end_headers()
                    self.wfile.write(page_html.encode("utf-8"))
                    return
                else:
                    self.send_response(302)
                    self.send_header("Location", "/#notes")
                    self.end_headers()
                    return

            # 1. Semesters
            if path == "/api/semesters":
                semesters = database.get_semesters()
                self.send_json({"semesters": semesters})
                return

            # 2. Subjects
            if path == "/api/subjects":
                sem_id = query.get("semester_id", [None])[0]
                branch = query.get("branch", [None])[0]
                subjects = database.get_subjects(
                    semester_id=int(sem_id) if sem_id else None,
                    branch=branch
                )
                self.send_json({"subjects": subjects})
                return

            if path.startswith("/api/subjects/"):
                sub_id_str = path.split("/api/subjects/")[1].split("/")[0]
                if sub_id_str.isdigit():
                    sub = database.get_subject_detail(int(sub_id_str))
                    if sub:
                        self.send_json({"subject": sub})
                        return
                    else:
                        self.send_json({"error": "Subject not found"}, 404)
                        return

            # 3. Notes
            if path == "/api/notes":
                sem_id = query.get("semester_id", [None])[0]
                sub_id = query.get("subject_id", [None])[0]
                unit_num = query.get("unit_number", [None])[0] or query.get("unit", [None])[0]
                branch = query.get("branch", [None])[0]
                search = query.get("search", [None])[0]
                note_id = query.get("id", [None])[0] or query.get("note_id", [None])[0]
                notes = database.get_notes(
                    semester_id=int(sem_id) if sem_id else None,
                    subject_id=int(sub_id) if sub_id else None,
                    unit_number=int(unit_num) if unit_num else None,
                    branch=branch,
                    search=search,
                    only_published=True,
                    note_id=int(note_id) if note_id else None
                )
                self.send_json({"notes": notes})
                return

            # Note 1st Page Preview Image for WhatsApp/Telegram OG Cards
            if path.startswith("/api/notes/") and (path.endswith("/preview.png") or path.endswith("/preview-image.png") or path.endswith("/preview")):
                nid_str = path.split("/api/notes/")[1].split("/")[0]
                note = None
                if nid_str.isdigit():
                    notes = database.get_notes(note_id=int(nid_str), only_published=True)
                    if notes:
                        note = notes[0]
                
                img_data = None
                if note and notes_preview:
                    img_data = notes_preview.generate_note_og_image(note, base_dir=BASE_DIR)
                
                if img_data:
                    self.send_response(200)
                    self.send_header("Content-Type", "image/png")
                    self.send_header("Cache-Control", "public, max-age=86400")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(img_data)
                    return
                else:
                    fb_path = os.path.join(BASE_DIR, "icon-192.png")
                    if not os.path.exists(fb_path):
                        fb_path = os.path.join(BASE_DIR, "logo.png")
                    if os.path.exists(fb_path):
                        with open(fb_path, "rb") as f:
                            fb_data = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", "image/png")
                        self.send_header("Cache-Control", "public, max-age=86400")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(fb_data)
                        return
                    self.send_response(404)
                    self.end_headers()
                    return

            if path.startswith("/api/notes/") and not path.endswith("/view"):
                nid = path.split("/api/notes/")[1].strip("/")
                try:
                    notes = database.get_notes(note_id=int(nid), only_published=True)
                    if notes:
                        self.send_json({"note": notes[0]})
                    else:
                        self.send_json({"error": "Note not found"}, 404)
                except ValueError:
                    self.send_json({"error": "Invalid note ID"}, 400)
                return

            # 4. Syllabus
            if path == "/api/syllabus":
                sem_id = query.get("semester_id", [None])[0]
                sub_id = query.get("subject_id", [None])[0]
                branch = query.get("branch", [None])[0]
                syllabus = database.get_all_syllabus(
                    semester_id=int(sem_id) if sem_id else None,
                    subject_id=int(sub_id) if sub_id else None,
                    branch=branch,
                    only_published=True
                )
                self.send_json({"syllabus": syllabus})
                return

            # 5. PYQs
            if path == "/api/pyqs":
                sem_id = query.get("semester_id", [None])[0]
                sub_id = query.get("subject_id", [None])[0]
                branch = query.get("branch", [None])[0]
                exam_year = query.get("exam_year", [None])[0]
                pyqs = database.get_all_pyqs(
                    semester_id=int(sem_id) if sem_id else None,
                    subject_id=int(sub_id) if sub_id else None,
                    branch=branch,
                    exam_year=int(exam_year) if exam_year else None,
                    only_published=True
                )
                self.send_json({"pyqs": pyqs})
                return

            # 6. Daily Updates
            if path == "/api/updates":
                category = query.get("category", [None])[0]
                search = query.get("search", [None])[0]
                updates = database.get_all_updates(category=category, search=search, only_published=True)
                self.send_json({"updates": updates})
                return

            # 7. Global Portal Search
            if path == "/api/search":
                q = query.get("q", [""])[0].strip()[:100]
                results = database.global_search(q)
                self.send_json(results)
                return

            # 8. Current User Profile
            if path == "/api/auth/me":
                user = self.get_auth_user()
                if user:
                    clean_user = {k: v for k, v in user.items() if k not in ("password_hash", "salt", "plain_password")}
                    self.send_json({"user": clean_user})
                else:
                    self.send_json({"error": "Unauthorized session"}, 401)
                return

            # 9. Student Dashboard
            if path == "/api/student/dashboard":
                user = self.get_auth_user()
                if not user:
                    self.send_json({"error": "Unauthorized session"}, 401)
                    return
                dash_data = database.get_student_dashboard_data(user["id"])
                self.send_json(dash_data)
                return

            # Student: My Submitted Notes
            if path == "/api/student/notes/my-submissions":
                user = self.get_auth_user()
                if not user:
                    self.send_json({"error": "Unauthorized session"}, 401)
                    return
                submissions = database.get_student_submissions(user["id"])
                self.send_json({"submissions": submissions})
                return

            # Admin: Pending Note Submissions Awaiting Verification
            if path == "/api/admin/notes/pending":
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                pending = database.get_pending_notes()
                self.send_json({"notes": pending})
                return

            # 10. Admin Stats Overview
            if path == "/api/admin/stats":
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                stats = database.get_admin_stats()
                self.send_json({"stats": stats})
                return

            # 11. Admin All Registered Students & Account Passwords / Timestamps
            if path == "/api/admin/users":
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                search_term = query.get("search", [""])[0]
                users_list = database.get_all_users(search=search_term)
                self.send_json({"users": users_list})
                return

            # 12. Admin Notes (All notes)
            if path == "/api/admin/notes":
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                notes = database.get_notes(only_published=False)
                self.send_json({"notes": notes})
                return

            # 13. Admin Subjects
            if path == "/api/admin/subjects":
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                subjects = database.get_subjects()
                self.send_json({"subjects": subjects})
                return

            # 14. Admin Syllabus
            if path == "/api/admin/syllabus":
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                sem_id = query.get("semester_id", [None])[0]
                branch = query.get("branch", [None])[0]
                syllabus = database.get_all_syllabus(
                    semester_id=int(sem_id) if sem_id else None,
                    branch=branch,
                    only_published=False
                )
                self.send_json({"syllabus": syllabus})
                return

            # 15. Admin PYQs
            if path == "/api/admin/pyqs":
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                pyqs = database.get_all_pyqs(only_published=False)
                self.send_json({"pyqs": pyqs})
                return

            # 16. Admin Updates
            if path == "/api/admin/updates":
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                updates = database.get_all_updates(only_published=False)
                self.send_json({"updates": updates})
                return

            if path.startswith("/api/admin/updates/"):
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                try:
                    up_id = int(path.split("/api/admin/updates/")[1].split("/")[0])
                except (ValueError, IndexError):
                    self.send_json({"error": "Invalid update ID."}, 400)
                    return
                update = database.get_update_by_id(up_id)
                if not update:
                    self.send_json({"error": "Update not found"}, 404)
                    return
                self.send_json({"update": update})
                return

            # 17. Admin Files
            if path == "/api/admin/files":
                user = self.get_auth_user()
                if not user or user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                files = database.get_all_uploaded_files()
                self.send_json({"files": files})
                return

            self.send_json({"status": "ok", "app": "DDU B.Tech Notes Hub"})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            length = int(self.get_header("Content-Length", 0))
        except Exception:
            length = 0
        body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            payload = {}

        try:
            # 1. Login with Accurate Password Checking, Brute-Force Rate Limiting & Self-Verifying Token
            if path == "/api/auth/login":
                client_ip = self.get_client_ip()
                email = payload.get("email", "").strip()
                password = payload.get("password", "")

                if not email or not password:
                    self.send_json({"error": "Email and password are required."}, 400)
                    return

                # Brute-Force Rate Limiting: max 5 failed attempts per 5 minutes
                limited, retry_after = is_rate_limited(client_ip, email, action="login")
                if limited:
                    self.send_json({
                        "error": f"Too many failed login attempts. Temporarily locked for security. Please try again in {retry_after} seconds."
                    }, 429)
                    return

                # Admin & Student Authentication via PBKDF2 Hashing
                user = database.authenticate_user(email, password)
                if user == "INACTIVE":
                    self.send_json({"error": "Your account has been deactivated. Please contact administrator."}, 403)
                    return
                if not user:
                    record_failed_login(client_ip, email)
                    self.send_json({"error": "Incorrect password or email not registered. Please verify your credentials."}, 401)
                    return

                record_successful_login(client_ip, email)
                token = user_registry.generate_auth_token(user)
                user_clean = {k: v for k, v in user.items() if k not in ("password_hash", "salt", "plain_password")}
                self.send_json({"token": token, "user": user_clean, "success": True})
                return

            # 2. Student Registration with Anti-Spam Rate Limiting & Zero Credential Leaks
            if path == "/api/auth/register":
                client_ip = self.get_client_ip()
                limited, retry_after = is_rate_limited(client_ip, action="register")
                if limited:
                    self.send_json({
                        "error": f"Too many registrations from this network. Please wait {retry_after} seconds before trying again."
                    }, 429)
                    return

                full_name = payload.get("full_name", "").strip()[:80]
                email = payload.get("email", "").strip()[:100]
                password = payload.get("password", "")
                branch = payload.get("branch", "CSE")[:30]
                try:
                    semester = int(payload.get("semester", 1))
                    if semester < 1 or semester > 8:
                        semester = 1
                except Exception:
                    semester = 1
                college = payload.get("college", "Deen Dayal Upadhyaya Gorakhpur University")[:150]

                if not full_name or not email:
                    self.send_json({"error": "Full name and email are required."}, 400)
                    return
                if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                    self.send_json({"error": "Please enter a valid email address."}, 400)
                    return
                if len(password) < 6 or len(password) > 128:
                    self.send_json({"error": "Password must be between 6 and 128 characters long."}, 400)
                    return

                email_clean = email.lower().strip()
                if email_clean in user_registry.FAKE_EMAILS:
                    self.send_json({"error": "Invalid registration email address."}, 400)
                    return

                # Check if student is already registered across registry and database
                if user_registry.find_user_in_registry(email_clean) or database.get_user_by_email(email_clean):
                    self.send_json({
                        "error": "This email address is already registered! Please log in to your account.",
                        "already_registered": True
                    }, 409)
                    return

                user_id = database.create_user(
                    full_name=full_name,
                    email=email_clean,
                    password=password,
                    college=college,
                    course="B.Tech",
                    branch=branch,
                    semester=semester,
                    role="STUDENT"
                )

                if not user_id:
                    self.send_json({
                        "error": "This email address is already registered! Please log in to your account.",
                        "already_registered": True
                    }, 409)
                    return

                record_successful_register(client_ip)
                ist_time = user_registry.get_ist_now_str()
                user = {
                    "id": user_id,
                    "full_name": full_name,
                    "email": email_clean,
                    "branch": branch,
                    "semester": semester,
                    "college": college,
                    "role": "STUDENT",
                    "created_at": ist_time
                }

                token = user_registry.generate_auth_token(user)
                # Strip password before returning response to client
                clean_user = {k: v for k, v in user.items() if k not in ("password_hash", "salt", "plain_password")}
                self.send_json({"token": token, "user": clean_user, "success": True})
                return

            # 3. Admin Direct Student Account Creation
            if path == "/api/admin/users/create":
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                full_name = payload.get("full_name", "").strip()
                email = payload.get("email", "").strip()
                password = payload.get("password", "StudentPassword123!")
                branch = payload.get("branch", "CSE")
                semester = int(payload.get("semester", 1))
                college = payload.get("college", "Deen Dayal Upadhyaya Gorakhpur University")
                if not full_name or not email:
                    self.send_json({"error": "Full name and email are required."}, 400)
                    return

                email_clean = email.lower().strip()
                if user_registry.find_user_in_registry(email_clean) or database.get_user_by_email(email_clean):
                    self.send_json({"error": "A student account with this email is already registered."}, 409)
                    return

                user_id = database.create_user(
                    full_name=full_name,
                    email=email_clean,
                    password=password,
                    college=college,
                    course="B.Tech",
                    branch=branch,
                    semester=semester,
                    role="STUDENT"
                )
                if not user_id:
                    self.send_json({"error": "A student account with this email is already registered."}, 409)
                    return

                self.send_json({"success": True, "message": "Student account created successfully.", "user_id": user_id})
                return

            # 4. Forgot Password Flow
            if path == "/api/auth/forgot-password":
                email = (payload.get("email") or "").strip().lower()
                if not email:
                    self.send_json({"error": "Please provide your registered email address."}, 400)
                    return

                reset_token = database.create_password_reset_token(email)
                self.send_json({
                    "success": True,
                    "message": f"Password reset instructions and verification code generated for {email}.",
                    "reset_token": reset_token or "dummy-token"
                })
                return

            # 5. Reset Password Flow
            if path == "/api/auth/reset-password":
                token = (payload.get("token") or "").strip()
                new_password = (payload.get("new_password") or "").strip()
                if not token or not new_password:
                    self.send_json({"error": "Reset token and new password are required."}, 400)
                    return
                if len(new_password) < 6:
                    self.send_json({"error": "New password must be at least 6 characters long."}, 400)
                    return

                ok, msg = database.verify_and_use_reset_token(token, new_password)
                if ok:
                    self.send_json({"success": True, "message": msg})
                else:
                    self.send_json({"error": msg}, 400)
                return

            # 6. Logout
            if path == "/api/auth/logout":
                auth_header = self.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header.split(" ", 1)[1].strip()
                    database.delete_user_session(token)
                self.send_json({"success": True})
                return

            # 4. Bookmark Toggle
            if path == "/api/student/bookmark":
                user = self.get_auth_user()
                if not user:
                    self.send_json({"error": "Unauthorized session"}, 401)
                    return
                note_id = payload.get("note_id")
                if not note_id:
                    self.send_json({"error": "Note ID required."}, 400)
                    return
                bookmarked = database.toggle_bookmark(user["id"], int(note_id))
                self.send_json({"success": True, "bookmarked": bookmarked})
                return

            # 4b. Student Submit Note (Pending Admin Verification)
            if path == "/api/student/notes/submit":
                user = self.get_auth_user()
                if not user:
                    self.send_json({"error": "Please log in to submit study notes."}, 401)
                    return

                title = (payload.get("title") or "").strip()
                subject_id = payload.get("subject_id")
                unit_id = payload.get("unit_id") or payload.get("unit_number") or 1
                description = (payload.get("description") or "").strip() or "Detailed notes will be shared in PDF format shortly."
                file_url = (payload.get("file_url") or "").strip()
                file_name = (payload.get("file_name") or title).strip()
                file_size = (payload.get("file_size") or "PDF Document").strip()

                if not title or len(title) < 3:
                    self.send_json({"error": "Note title must be at least 3 characters long."}, 400)
                    return
                if not subject_id:
                    self.send_json({"error": "Please select a valid subject."}, 400)
                    return
                if not file_url:
                    self.send_json({"error": "PDF file or document link is required."}, 400)
                    return

                try:
                    sub_id_int = int(subject_id)
                except Exception:
                    self.send_json({"error": "Invalid subject ID format."}, 400)
                    return

                try:
                    unit_id_int = int(unit_id) if unit_id else None
                except Exception:
                    unit_id_int = 1

                note_id = database.create_student_note_submission(
                    student_id=user["id"],
                    student_name=user.get("full_name") or "Student Contributor",
                    student_email=user.get("email") or "",
                    subject_id=sub_id_int,
                    unit_id=unit_id_int,
                    title=title,
                    description=description,
                    file_url=file_url,
                    file_name=file_name,
                    file_size=file_size
                )
                self.send_json({
                    "success": True,
                    "message": "Note submitted successfully! It will be verified by the Admin before appearing publicly.",
                    "note_id": note_id
                })
                return

            # 4c. Admin Verify Note ("Tick" / Approve or Reject)
            if path in ("/api/admin/notes/verify", "/api/admin/notes/approve"):
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                note_id = payload.get("note_id")
                action = (payload.get("action") or "approve").lower()
                if not note_id:
                    self.send_json({"error": "Note ID is required."}, 400)
                    return
                if action not in ("approve", "reject"):
                    self.send_json({"error": "Action must be 'approve' or 'reject'."}, 400)
                    return

                try:
                    database.verify_student_note(int(note_id), action=action)
                except Exception as e:
                    self.send_json({"error": f"Verification failed: {str(e)}"}, 500)
                    return

                msg = "Note verified and published live to student portal!" if action == "approve" else "Note marked as rejected."
                self.send_json({"success": True, "message": msg, "action": action, "note_id": note_id})
                return

            # 5. Admin Reset Student Password
            if path == "/api/admin/users/reset-password":
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                target_user_id = payload.get("user_id")
                new_password = payload.get("new_password", "")

                if not target_user_id or len(new_password) < 6:
                    self.send_json({"error": "Valid user ID and new password (min 6 chars) required."}, 400)
                    return

                database.update_user_password(int(target_user_id), new_password)
                self.send_json({"success": True, "message": "Password updated successfully."})
                return

            # 6. Admin Toggle Student Active/Inactive
            if path in ("/api/admin/users/toggle", "/api/admin/users/toggle-active"):
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                target_user_id = payload.get("user_id")
                if not target_user_id:
                    self.send_json({"error": "User ID required."}, 400)
                    return

                new_state = database.toggle_user_active(int(target_user_id))
                self.send_json({"success": True, "is_active": new_state})
                return

            # 7. Admin Delete Student
            if path == "/api/admin/users/delete":
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                target_user_id = payload.get("user_id")
                if not target_user_id:
                    self.send_json({"error": "User ID required."}, 400)
                    return

                database.delete_user(int(target_user_id))
                self.send_json({"success": True, "message": "User deleted successfully."})
                return

            # 8. Admin Add / Edit Note
            if path == "/api/admin/notes" or path.startswith("/api/admin/notes/"):
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                note_id = None
                if path.startswith("/api/admin/notes/"):
                    note_id_str = path.split("/api/admin/notes/")[1].split("/")[0]
                    if note_id_str.isdigit():
                        note_id = int(note_id_str)

                subject_id = payload.get("subject_id")
                unit_id = payload.get("unit_id")
                title = payload.get("title", "").strip()
                description = payload.get("description", "").strip() or "Detailed notes will be shared in PDF format shortly."
                file_url = payload.get("file_url", "").strip()
                file_name = payload.get("file_name", title)
                file_size = payload.get("file_size", "PDF Document")
                is_important = 1 if payload.get("is_important") else 0
                is_published = 1 if payload.get("is_published", True) else 0

                if not title or not subject_id or not file_url:
                    self.send_json({"error": "Title, Subject and File URL are required."}, 400)
                    return

                if note_id:
                    database.update_note(note_id, int(subject_id), int(unit_id) if unit_id else None, title, description, file_url, file_name, file_size, is_important, is_published)
                    self.send_json({"success": True, "message": "Note updated", "note_id": note_id})
                else:
                    new_id = database.create_note(int(subject_id), int(unit_id) if unit_id else None, title, description, file_url, file_name, file_size, is_important, is_published)
                    self.send_json({"success": True, "message": "Note created", "note_id": new_id})
                return

            # 9. Admin Add / Edit Subject
            if path == "/api/admin/subjects" or path.startswith("/api/admin/subjects/"):
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                sub_id = None
                if path.startswith("/api/admin/subjects/"):
                    sub_id_str = path.split("/api/admin/subjects/")[1].split("/")[0]
                    if sub_id_str.isdigit():
                        sub_id = int(sub_id_str)

                name = payload.get("name", "").strip()
                code = payload.get("code", "").strip()
                semester_id = payload.get("semester_id")
                branch = payload.get("branch", "All Branches").strip()
                description = payload.get("description", "").strip()

                if not name or not code or not semester_id:
                    self.send_json({"error": "Subject name, code and semester are required."}, 400)
                    return

                if sub_id:
                    database.update_subject(sub_id, int(semester_id), name, code, branch, description)
                    self.send_json({"success": True, "message": "Subject updated", "subject_id": sub_id})
                else:
                    new_id = database.create_subject(int(semester_id), name, code, branch, description)
                    if not new_id:
                        self.send_json({"error": "Subject with this code already exists."}, 400)
                        return
                    self.send_json({"success": True, "message": "Subject created", "subject_id": new_id})
                return

            # 10. Admin Add Syllabus
            if path == "/api/admin/syllabus":
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                title = payload.get("title", "").strip()
                semester_id = payload.get("semester_id")
                subject_id = payload.get("subject_id")
                branch = payload.get("branch", "All Branches").strip()
                description = payload.get("description", "").strip()
                file_url = payload.get("file_url", "").strip()
                is_published = 1 if payload.get("is_published", True) else 0

                if not title or not semester_id or not file_url:
                    self.send_json({"error": "Title, semester, and file URL are required."}, 400)
                    return

                new_id = database.create_syllabus(int(semester_id), int(subject_id) if subject_id else None, title, description, file_url, is_published, branch)
                self.send_json({"success": True, "message": "Syllabus uploaded", "syllabus_id": new_id})
                return

            # 11. Admin Add PYQ
            if path == "/api/admin/pyqs":
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                paper_title = payload.get("paper_title", "").strip()
                exam_year = payload.get("exam_year", 2025)
                semester_id = payload.get("semester_id")
                subject_id = payload.get("subject_id")
                branch = payload.get("branch", "CSE").strip()
                file_url = payload.get("file_url", "").strip()

                if not paper_title or not semester_id or not subject_id or not file_url:
                    self.send_json({"error": "Paper title, semester, subject, and file URL are required."}, 400)
                    return

                new_id = database.create_pyq(int(semester_id), int(subject_id), paper_title, int(exam_year), branch, file_url)
                self.send_json({"success": True, "message": "PYQ uploaded", "pyq_id": new_id})
                return

            # 12. Admin Add Campus Update
            if path == "/api/admin/updates":
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                title = (payload.get("title") or "").strip()
                category = (payload.get("category") or "University Notice").strip()
                publish_date = payload.get("publish_date") or None
                short_description = (payload.get("short_description") or "").strip() or title
                full_details = (payload.get("full_details") or "").strip()
                attachment_url = (payload.get("attachment_url") or "").strip() or None
                is_important = 1 if payload.get("is_important") else 0
                duration_days = int(payload.get("duration_days") or 0)

                if not title:
                    self.send_json({"error": "Notice title is required."}, 400)
                    return

                new_id = database.create_update(title, category, short_description, full_details, attachment_url, is_important, publish_date=publish_date, duration_days=duration_days)
                self.send_json({"success": True, "message": "Campus update published", "update_id": new_id})
                return

            if path.startswith("/api/admin/updates/"):
                current_user = self.get_auth_user()
                if not current_user or current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return
                try:
                    up_id = int(path.split("/api/admin/updates/")[1].split("/")[0])
                except (ValueError, IndexError):
                    self.send_json({"error": "Invalid update ID."}, 400)
                    return

                title = (payload.get("title") or "").strip()
                category = (payload.get("category") or "University Notice").strip()
                publish_date = payload.get("publish_date") or None
                short_description = (payload.get("short_description") or "").strip() or title
                full_details = (payload.get("full_details") or "").strip()
                attachment_url = (payload.get("attachment_url") or "").strip() or None
                is_important = 1 if payload.get("is_important") else 0
                duration_days = int(payload.get("duration_days") or 0)

                if not title:
                    self.send_json({"error": "Notice title is required."}, 400)
                    return

                database.update_update(up_id, title, category, short_description, full_details, attachment_url, is_important, 1, publish_date, duration_days=duration_days)
                self.send_json({"success": True, "message": "Campus update modified successfully", "update_id": up_id})
                return

            # 13. File Upload (Permanent Cloud Hosting via GitHub API & jsdelivr CDN)
            if path in ("/api/admin/upload", "/api/student/upload"):
                current_user = self.get_auth_user()
                if not current_user:
                    self.send_json({"error": "Authentication required to upload files."}, 401)
                    return
                if path == "/api/admin/upload" and current_user.get("role") != "ADMIN":
                    self.send_json({"error": "Admin access required"}, 403)
                    return

                orig_name = "document.pdf"
                file_size_str = "1.2 MB"
                category = "General"
                content_type = self.headers.get("content-type", "")
                file_bytes = None

                if "multipart/form-data" in content_type:
                    # Robust multipart boundary extractor
                    try:
                        boundary = content_type.split("boundary=")[1].strip()
                        if ";" in boundary:
                            boundary = boundary.split(";")[0].strip()
                        if (boundary.startswith('"') and boundary.endswith('"')) or (boundary.startswith("'") and boundary.endswith("'")):
                            boundary = boundary[1:-1]
                        boundary_bytes = boundary.encode("latin-1")
                        parts = body.split(b"--" + boundary_bytes)
                        for part in parts:
                            if not part or part == b"--\r\n" or part == b"--" or part == b"\r\n":
                                continue
                            if b"\r\n\r\n" in part:
                                raw_hdr, part_body = part.split(b"\r\n\r\n", 1)
                            elif b"\n\n" in part:
                                raw_hdr, part_body = part.split(b"\n\n", 1)
                            else:
                                continue

                            if part_body.endswith(b"\r\n"):
                                part_body = part_body[:-2]
                            elif part_body.endswith(b"\n"):
                                part_body = part_body[:-1]

                            hdr_text = raw_hdr.decode("latin-1", errors="replace")
                            if 'name="file"' in hdr_text:
                                file_bytes = part_body
                                if 'filename="' in hdr_text:
                                    orig_name = hdr_text.split('filename="')[1].split('"')[0]
                            elif 'name="category"' in hdr_text:
                                category = part_body.decode("utf-8", errors="replace").strip()
                    except Exception:
                        pass

                    # Fallback to cgi.FieldStorage if boundary split didn't find file_bytes
                    if not file_bytes:
                        try:
                            import cgi
                            import io
                            environ = {
                                'REQUEST_METHOD': 'POST',
                                'CONTENT_TYPE': content_type,
                                'CONTENT_LENGTH': str(length)
                            }
                            fs = cgi.FieldStorage(fp=io.BytesIO(body), headers=self.headers, environ=environ)
                            if 'category' in fs:
                                category = fs['category'].value
                            if 'file' in fs:
                                file_item = fs['file']
                                orig_name = file_item.filename or "uploaded_file.pdf"
                                file_bytes = file_item.file.read()
                        except Exception:
                            pass

                if not file_bytes:
                    self.send_json({"error": "No file received or file content is empty."}, 400)
                    return

                # Validate magic bytes / content signature (PDF and approved images only)
                is_pdf = b"%PDF-" in file_bytes[:1024]
                is_valid_magic = (
                    is_pdf or
                    file_bytes.startswith(b"\xff\xd8\xff") or
                    file_bytes.startswith(b"\x89PNG") or
                    (file_bytes.startswith(b"RIFF") and b"WEBP" in file_bytes[:16])
                )
                if not is_valid_magic:
                    self.send_json({"error": "Invalid or corrupted file format. Only verified PDF, JPG, PNG, and WEBP documents are allowed."}, 400)
                    return

                # Strict PDF check for student contributions
                if path == "/api/student/upload" and not is_pdf:
                    self.send_json({"error": "Student study notes must be a valid PDF document."}, 400)
                    return

                sz_kb = round(len(file_bytes) / 1024, 1)
                file_size_str = f"{sz_kb} KB" if sz_kb < 1024 else f"{round(sz_kb / 1024, 2)} MB"

                # Generate unique clean file path preserving original extension
                base_part, raw_ext = os.path.splitext(orig_name)
                ext = raw_ext.lower() if raw_ext else ".pdf"
                if ext not in [".pdf", ".png", ".jpg", ".jpeg", ".webp"]:
                    ext = ".pdf"
                clean_base = re.sub(r'[^a-zA-Z0-9._-]', '_', base_part).strip('_') or "document"
                random_hex = secrets.token_hex(4)
                unique_filename = f"{clean_base}_{random_hex}{ext}"
                rel_path = f"static/uploads/notes/{unique_filename}"

                # Determine accurate MIME type
                mime_map = {
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".webp": "image/webp",
                    ".pdf": "application/pdf"
                }
                upload_mime = mime_map.get(ext, "application/pdf")

                # Default relative URL
                saved_url = f"/{rel_path}"

                # Commit permanently to GitHub repository for global CDN accessibility
                github_token = os.environ.get("GITHUB_TOKEN", "")
                github_repo = os.environ.get("GITHUB_REPO", "krishnachandra81973-ui/ddu-btech-notes-hub")
                if github_token:
                    try:
                        import base64
                        gh_api_url = f"https://api.github.com/repos/{github_repo}/contents/{rel_path}"
                        gh_payload = json.dumps({
                            "message": f"Upload study note/notice: {orig_name}",
                            "content": base64.b64encode(file_bytes).decode("utf-8"),
                            "branch": "main"
                        }).encode("utf-8")
                        req = urllib.request.Request(
                            gh_api_url,
                            data=gh_payload,
                            headers={
                                "Authorization": f"Bearer {github_token}",
                                "User-Agent": "DDU-Portal-Serverless",
                                "Content-Type": "application/json"
                            },
                            method="PUT"
                        )
                        with urllib.request.urlopen(req, timeout=12) as resp:
                            if resp.status in (200, 201):
                                saved_url = f"https://raw.githubusercontent.com/{github_repo}/main/{rel_path}"
                    except Exception:
                        pass

                # Also save locally across uploads directories
                for folder in [
                    os.path.join(BASE_DIR, "static", "uploads", "notes"),
                    os.path.join(BASE_DIR, "static", "uploads"),
                    "/tmp/uploads"
                ]:
                    try:
                        os.makedirs(folder, exist_ok=True)
                        with open(os.path.join(folder, unique_filename), "wb") as f:
                            f.write(file_bytes)
                    except Exception:
                        pass

                file_id = database.record_uploaded_file(unique_filename, orig_name, saved_url, file_size_str, upload_mime, category=category)
                self.send_json({
                    "success": True,
                    "file_id": file_id,
                    "file_url": saved_url,
                    "original_name": orig_name,
                    "file_size": file_size_str
                })
                return

            # 14. Student Requests / Feedback
            if path in ("/api/feedback", "/api/requests"):
                self.send_json({"success": True, "message": "Request received by Keshav Sir."})
                return

            self.send_json({"success": True})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def do_PUT(self):
        return self.do_POST()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        user = self.get_auth_user()
        if not user or user.get("role") != "ADMIN":
            self.send_json({"error": "Admin access required"}, 403)
            return

        try:
            if path.startswith("/api/admin/users/"):
                user_id = int(path.split("/api/admin/users/")[1].split("/")[0])
                database.delete_user(user_id)
                self.send_json({"success": True, "message": "User deleted"})
                return

            if path.startswith("/api/admin/notes/"):
                note_id = int(path.split("/api/admin/notes/")[1].split("/")[0])
                database.delete_note(note_id)
                self.send_json({"success": True, "message": "Note deleted"})
                return

            if path.startswith("/api/admin/subjects/"):
                sub_id = int(path.split("/api/admin/subjects/")[1].split("/")[0])
                database.delete_subject(sub_id)
                self.send_json({"success": True, "message": "Subject deleted"})
                return

            if path.startswith("/api/admin/syllabus/"):
                syl_id = int(path.split("/api/admin/syllabus/")[1].split("/")[0])
                database.delete_syllabus(syl_id)
                self.send_json({"success": True, "message": "Syllabus deleted"})
                return

            if path.startswith("/api/admin/pyqs/"):
                pyq_id = int(path.split("/api/admin/pyqs/")[1].split("/")[0])
                database.delete_pyq(pyq_id)
                self.send_json({"success": True, "message": "PYQ deleted"})
                return

            if path.startswith("/api/admin/updates/"):
                up_id = int(path.split("/api/admin/updates/")[1].split("/")[0])
                database.delete_update(up_id)
                self.send_json({"success": True, "message": "Update deleted"})
                return

            if path.startswith("/api/admin/files/"):
                file_id = int(path.split("/api/admin/files/")[1].split("/")[0])
                database.delete_uploaded_file(file_id)
                self.send_json({"success": True, "message": "File record deleted"})
                return

            self.send_json({"success": True})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()
