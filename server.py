import os
import sys
import json
import urllib.parse
import mimetypes
import secrets
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import database as db

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
UPLOADS_DIR = os.path.join(STATIC_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

class DDURequestHandler(BaseHTTPRequestHandler):
    server_version = "DDU-NotesHub/1.0"

    def log_message(self, format, *args):
        # Clean logging
        sys.stderr.write(f"[{self.log_date_time_string()}] {self.command} {self.path} - {format % args}\n")

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Credentials", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def get_auth_user(self):
        token = None
        # 1. Bearer Header
        auth_header = self.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1].strip()
        # 2. Cookie
        if not token:
            cookie_header = self.headers.get("Cookie")
            if cookie_header:
                for part in cookie_header.split(";"):
                    if "session_token=" in part:
                        token = part.split("session_token=")[1].strip()
                        break
        if not token:
            return None
        return db.get_user_from_token(token)

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        body = self.rfile.read(content_length)
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:
            return {}

    def send_json(self, data, status=200, set_cookie=None):
        response_bytes = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_cors_headers()
        if set_cookie:
            self.send_header("Set-Cookie", f"session_token={set_cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800")
        self.end_headers()
        self.wfile.write(response_bytes)

    def send_error_json(self, message, status=400):
        self.send_json({"error": message, "status": status}, status=status)

    def serve_static(self, filepath):
        if not os.path.exists(filepath) or os.path.isdir(filepath):
            # SPA fallback: serve index.html for non-asset routes
            filepath = os.path.join(STATIC_DIR, "index.html")

        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            if filepath.endswith(".js"):
                mime_type = "application/javascript"
            elif filepath.endswith(".css"):
                mime_type = "text/css"
            elif filepath.endswith(".pdf"):
                mime_type = "application/pdf"
            elif filepath.endswith(".ico"):
                mime_type = "image/x-icon"
            elif filepath.endswith(".png"):
                mime_type = "image/png"
            else:
                mime_type = "text/html"

        try:
            file_size = os.path.getsize(filepath)
            
            # Handle HTTP Range request for PDFs
            range_header = self.headers.get("Range")
            if range_header and range_header.startswith("bytes=") and mime_type == "application/pdf":
                parts = range_header.replace("bytes=", "").split("-")
                start = int(parts[0]) if parts[0] else 0
                end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
                length = end - start + 1
                
                self.send_response(206)
                self.send_header("Content-Type", mime_type)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.send_cors_headers()
                self.end_headers()
                
                with open(filepath, "rb") as f:
                    f.seek(start)
                    self.wfile.write(f.read(length))
                return

            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            if filepath.endswith(".pdf"):
                # Suggest inline preview
                filename = os.path.basename(filepath)
                self.send_header("Content-Disposition", f'inline; filename="{filename}"')
            self.send_cors_headers()
            self.end_headers()

            with open(filepath, "rb") as f:
                while chunk := f.read(65536):
                    self.wfile.write(chunk)
        except Exception as e:
            sys.stderr.write(f"Error serving {filepath}: {e}\n")

    # ------------------- GET Requests -------------------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. SEO Endpoints
        if path == "/robots.txt":
            robots_path = os.path.join(BASE_DIR, "robots.txt")
            if os.path.exists(robots_path):
                with open(robots_path, "rb") as f:
                    content = f.read()
            else:
                content = b"User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\nSitemap: https://ddu-btech-kn-notes.vercel.app/sitemap.xml\n"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(content)
            return

        if path == "/sitemap.xml":
            sitemap_path = os.path.join(BASE_DIR, "sitemap.xml")
            if os.path.exists(sitemap_path):
                with open(sitemap_path, "rb") as f:
                    sitemap_bytes = f.read()
            else:
                sitemap_bytes = b'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://ddu-btech-kn-notes.vercel.app/</loc></url></urlset>'
            self.send_response(200)
            self.send_header("Content-Type", "application/xml; charset=utf-8")
            self.end_headers()
            self.wfile.write(sitemap_bytes)
            return

        # 2. Public Content APIs
        if path == "/api/semesters":
            data = db.get_semesters()
            self.send_json({"semesters": data})
            return

        if path == "/api/subjects":
            sem_id = query.get("semester_id", [None])[0]
            branch = query.get("branch", [None])[0]
            data = db.get_subjects(semester_id=int(sem_id) if sem_id else None, branch=branch)
            self.send_json({"subjects": data})
            return

        if path.startswith("/api/subjects/"):
            sub_id = path.split("/api/subjects/")[1].split("/")[0]
            try:
                sub_detail = db.get_subject_detail(int(sub_id))
                if sub_detail:
                    self.send_json({"subject": sub_detail})
                else:
                    self.send_error_json("Subject not found", status=404)
            except ValueError:
                self.send_error_json("Invalid subject ID", status=400)
            return

        if path == "/api/notes":
            sem_id = query.get("semester_id", [None])[0]
            sub_id = query.get("subject_id", [None])[0]
            unit = query.get("unit", [None])[0]
            branch = query.get("branch", [None])[0]
            search = query.get("search", [None])[0]
            data = db.get_notes(
                semester_id=int(sem_id) if sem_id else None,
                subject_id=int(sub_id) if sub_id else None,
                unit_number=int(unit) if unit else None,
                branch=branch,
                search=search,
                only_published=True
            )
            self.send_json({"notes": data})
            return

        if path.startswith("/api/notes/") and path.endswith("/view"):
            note_id = path.split("/api/notes/")[1].replace("/view", "")
            user = self.get_auth_user()
            user_id = user["id"] if user else None
            try:
                db.record_note_view(user_id, int(note_id))
                self.send_json({"success": True})
            except Exception as e:
                self.send_error_json(str(e))
            return

        if path == "/api/syllabus":
            sem_id = query.get("semester_id", [None])[0]
            sub_id = query.get("subject_id", [None])[0]
            data = db.get_all_syllabus(
                semester_id=int(sem_id) if sem_id else None,
                subject_id=int(sub_id) if sub_id else None,
                only_published=True
            )
            self.send_json({"syllabus": data})
            return

        if path == "/api/pyqs":
            sem_id = query.get("semester_id", [None])[0]
            sub_id = query.get("subject_id", [None])[0]
            branch = query.get("branch", [None])[0]
            year = query.get("year", [None])[0]
            data = db.get_all_pyqs(
                semester_id=int(sem_id) if sem_id else None,
                subject_id=int(sub_id) if sub_id else None,
                branch=branch,
                exam_year=int(year) if year else None,
                only_published=True
            )
            self.send_json({"pyqs": data})
            return

        if path == "/api/updates":
            category = query.get("category", [None])[0]
            search = query.get("search", [None])[0]
            data = db.get_all_updates(category=category, search=search, only_published=True)
            self.send_json({"updates": data})
            return

        if path == "/api/search":
            q = query.get("q", [""])[0]
            data = db.global_search(q)
            self.send_json(data)
            return

        # 3. Auth Current User
        if path == "/api/auth/me":
            user = self.get_auth_user()
            if not user:
                self.send_error_json("Unauthenticated", status=401)
                return
            self.send_json({"user": user})
            return

        # 4. Student Dashboard & Bookmarks
        if path == "/api/student/dashboard":
            user = self.get_auth_user()
            if not user:
                self.send_error_json("Please login to view dashboard", status=401)
                return
            dash_data = db.get_student_dashboard_data(user["id"])
            self.send_json(dash_data)
            return

        if path == "/api/student/bookmarks":
            user = self.get_auth_user()
            if not user:
                self.send_error_json("Authentication required", status=401)
                return
            data = db.get_user_bookmarks(user["id"])
            self.send_json({"bookmarks": data})
            return

        if path == "/api/student/history":
            user = self.get_auth_user()
            if not user:
                self.send_error_json("Authentication required", status=401)
                return
            data = db.get_recently_viewed(user["id"])
            self.send_json({"history": data})
            return

        # 5. ADMIN Protected Endpoints (Strict Verification)
        if path.startswith("/api/admin/"):
            admin_user = self.get_auth_user()
            if not admin_user or admin_user.get("role") != "ADMIN":
                self.send_error_json("Access Forbidden. Admin privilege required.", status=403)
                return

            if path == "/api/admin/stats":
                stats = db.get_admin_stats()
                self.send_json({"stats": stats})
                return

            if path == "/api/admin/users":
                search = query.get("search", [""])[0]
                users = db.get_all_users(search=search)
                self.send_json({"users": users})
                return

            if path == "/api/admin/notes":
                notes = db.get_notes(only_published=False)
                self.send_json({"notes": notes})
                return

            if path == "/api/admin/subjects":
                subjects = db.get_subjects()
                self.send_json({"subjects": subjects})
                return

            if path == "/api/admin/syllabus":
                syl = db.get_all_syllabus(only_published=False)
                self.send_json({"syllabus": syl})
                return

            if path == "/api/admin/pyqs":
                pyqs = db.get_all_pyqs(only_published=False)
                self.send_json({"pyqs": pyqs})
                return

            if path == "/api/admin/updates":
                updates = db.get_all_updates(only_published=False)
                self.send_json({"updates": updates})
                return

            if path == "/api/admin/files":
                files = db.get_all_uploaded_files()
                self.send_json({"files": files})
                return

        # 6. Dedicated Admin Application Route
        if path in ("/admin", "/admin/", "/admin/login"):
            self.serve_static(os.path.join(STATIC_DIR, "admin.html"))
            return

        if path == "/manifest.json":
            self.serve_static(os.path.join(BASE_DIR, "manifest.json"))
            return

        if path == "/sw.js":
            self.serve_static(os.path.join(BASE_DIR, "sw.js"))
            return

        # 7. Static files and SPA serving
        if path == "/" or path == "":
            self.serve_static(os.path.join(STATIC_DIR, "index.html"))
        elif path.startswith("/static/"):
            rel_path = path.replace("/static/", "")
            file_to_serve = os.path.join(STATIC_DIR, rel_path)
            self.serve_static(file_to_serve)
        else:
            base_file = os.path.join(BASE_DIR, path.lstrip("/"))
            if os.path.exists(base_file) and os.path.isfile(base_file):
                self.serve_static(base_file)
            else:
                # Fallback to index.html for SPA hash/history routes
                self.serve_static(os.path.join(STATIC_DIR, "index.html"))

    # ------------------- POST Requests -------------------
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # 1. Auth Endpoints
        if path == "/api/auth/register":
            body = self.read_json_body()
            full_name = body.get("full_name", "").strip()
            email = body.get("email", "").strip()
            password = body.get("password", "")
            college = body.get("college", "Deen Dayal Upadhyaya Gorakhpur University")
            course = body.get("course", "B.Tech")
            branch = body.get("branch", "CSE")
            semester = int(body.get("semester", 1))

            if not full_name or not email or not password:
                self.send_error_json("Full Name, Email and Password are required.")
                return
            if len(password) < 6:
                self.send_error_json("Password must be at least 6 characters long.")
                return

            user_id = db.create_user(full_name, email, password, college, course, branch, semester, role="STUDENT")
            if not user_id:
                self.send_error_json("An account with this email already exists.")
                return

            token = db.create_user_session(user_id)
            user = db.get_user_from_token(token)
            self.send_json({"success": True, "token": token, "user": user}, set_cookie=token)
            return

        if path == "/api/auth/login":
            body = self.read_json_body()
            email = body.get("email", "").strip()
            password = body.get("password", "")
            remember = body.get("remember", False)

            if not email or not password:
                self.send_error_json("Email and Password are required.")
                return

            res = db.authenticate_user(email, password)
            if res == "INACTIVE":
                self.send_error_json("Your account has been deactivated by administrator.", status=403)
                return
            if not res:
                self.send_error_json("Invalid email or password.", status=401)
                return

            days = 30 if remember else 7
            token = db.create_user_session(res["id"], days=days)
            user = db.get_user_from_token(token)
            self.send_json({"success": True, "token": token, "user": user}, set_cookie=token)
            return

        if path == "/api/auth/logout":
            token = None
            auth_header = self.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1].strip()
            if not token:
                cookie_header = self.headers.get("Cookie")
                if cookie_header:
                    for part in cookie_header.split(";"):
                        if "session_token=" in part:
                            token = part.split("session_token=")[1].strip()
                            break
            if token:
                db.delete_user_session(token)
            self.send_json({"success": True}, set_cookie="")
            return

        if path == "/api/auth/forgot-password":
            body = self.read_json_body()
            email = body.get("email", "")
            # In a demo/academic environment, return a helpful token confirmation
            self.send_json({
                "success": True,
                "message": f"Password reset instructions have been dispatched to {email}. For campus portal support, contact Dean of Student Welfare."
            })
            return

        # 2. Student Actions
        if path == "/api/student/bookmark":
            user = self.get_auth_user()
            if not user:
                self.send_error_json("Authentication required", status=401)
                return
            body = self.read_json_body()
            note_id = body.get("note_id")
            if not note_id:
                self.send_error_json("note_id required")
                return
            is_bookmarked = db.toggle_bookmark(user["id"], int(note_id))
            self.send_json({"success": True, "is_bookmarked": is_bookmarked})
            return

        # 3. ADMIN Protected Endpoints (Strict Verification)
        if path.startswith("/api/admin/"):
            admin_user = self.get_auth_user()
            if not admin_user or admin_user.get("role") != "ADMIN":
                self.send_error_json("Access Forbidden. Admin privilege required.", status=403)
                return

            if path == "/api/admin/upload":
                self.handle_multipart_upload()
                return

            if path == "/api/admin/users/toggle":
                body = self.read_json_body()
                user_id = body.get("user_id")
                new_status = db.toggle_user_active(int(user_id))
                self.send_json({"success": True, "is_active": new_status})
                return

            if path == "/api/admin/subjects":
                body = self.read_json_body()
                sub_id = db.create_subject(
                    semester_id=int(body["semester_id"]),
                    name=body["name"].strip(),
                    code=body["code"].strip().upper(),
                    branch=body.get("branch", "All Branches"),
                    description=body.get("description", "")
                )
                self.send_json({"success": True, "subject_id": sub_id})
                return

            if path == "/api/admin/notes":
                body = self.read_json_body()
                note_id = db.create_note(
                    subject_id=int(body["subject_id"]),
                    unit_id=int(body["unit_id"]) if body.get("unit_id") else None,
                    title=body["title"].strip(),
                    description=body.get("description", ""),
                    file_url=body["file_url"].strip(),
                    file_name=body.get("file_name", "document.pdf"),
                    file_size=body.get("file_size", "500 KB"),
                    is_important=1 if body.get("is_important") else 0,
                    is_published=1 if body.get("is_published", True) else 0
                )
                self.send_json({"success": True, "note_id": note_id})
                return

            if path == "/api/admin/syllabus":
                body = self.read_json_body()
                syl_id = db.create_syllabus(
                    semester_id=int(body["semester_id"]),
                    subject_id=int(body["subject_id"]) if body.get("subject_id") else None,
                    title=body["title"].strip(),
                    description=body.get("description", ""),
                    file_url=body["file_url"].strip(),
                    is_published=1 if body.get("is_published", True) else 0
                )
                self.send_json({"success": True, "syllabus_id": syl_id})
                return

            if path == "/api/admin/pyqs":
                body = self.read_json_body()
                pyq_id = db.create_pyq(
                    semester_id=int(body["semester_id"]),
                    subject_id=int(body["subject_id"]),
                    branch=body.get("branch", "CSE"),
                    exam_year=int(body["exam_year"]),
                    paper_title=body["paper_title"].strip(),
                    file_url=body["file_url"].strip(),
                    is_published=1 if body.get("is_published", True) else 0
                )
                self.send_json({"success": True, "pyq_id": pyq_id})
                return

            if path == "/api/admin/updates":
                body = self.read_json_body()
                up_id = db.create_update(
                    title=body["title"].strip(),
                    category=body["category"],
                    short_description=body["short_description"].strip(),
                    full_details=body.get("full_details", ""),
                    attachment_url=body.get("attachment_url"),
                    is_important=1 if body.get("is_important") else 0,
                    is_published=1 if body.get("is_published", True) else 0,
                    publish_date=body.get("publish_date")
                )
                self.send_json({"success": True, "update_id": up_id})
                return

        self.send_error_json("Endpoint Not Found", status=404)

    # ------------------- PUT Requests -------------------
    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/admin/"):
            admin_user = self.get_auth_user()
            if not admin_user or admin_user.get("role") != "ADMIN":
                self.send_error_json("Access Forbidden. Admin privilege required.", status=403)
                return

            body = self.read_json_body()

            if path.startswith("/api/admin/subjects/"):
                sub_id = int(path.split("/api/admin/subjects/")[1])
                db.update_subject(
                    sub_id,
                    semester_id=int(body["semester_id"]),
                    name=body["name"].strip(),
                    code=body["code"].strip().upper(),
                    branch=body.get("branch", "All Branches"),
                    description=body.get("description", "")
                )
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/notes/"):
                note_id = int(path.split("/api/admin/notes/")[1])
                db.update_note(
                    note_id,
                    subject_id=int(body["subject_id"]),
                    unit_id=int(body["unit_id"]) if body.get("unit_id") else None,
                    title=body["title"].strip(),
                    description=body.get("description", ""),
                    file_url=body["file_url"].strip(),
                    file_name=body.get("file_name", "document.pdf"),
                    file_size=body.get("file_size", "500 KB"),
                    is_important=1 if body.get("is_important") else 0,
                    is_published=1 if body.get("is_published", True) else 0
                )
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/syllabus/"):
                syl_id = int(path.split("/api/admin/syllabus/")[1])
                db.update_syllabus(
                    syl_id,
                    semester_id=int(body["semester_id"]),
                    subject_id=int(body["subject_id"]) if body.get("subject_id") else None,
                    title=body["title"].strip(),
                    description=body.get("description", ""),
                    file_url=body["file_url"].strip(),
                    is_published=1 if body.get("is_published", True) else 0
                )
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/pyqs/"):
                pyq_id = int(path.split("/api/admin/pyqs/")[1])
                db.update_pyq(
                    pyq_id,
                    semester_id=int(body["semester_id"]),
                    subject_id=int(body["subject_id"]),
                    branch=body.get("branch", "CSE"),
                    exam_year=int(body["exam_year"]),
                    paper_title=body["paper_title"].strip(),
                    file_url=body["file_url"].strip(),
                    is_published=1 if body.get("is_published", True) else 0
                )
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/updates/"):
                up_id = int(path.split("/api/admin/updates/")[1])
                db.update_update(
                    up_id,
                    title=body["title"].strip(),
                    category=body["category"],
                    short_description=body["short_description"].strip(),
                    full_details=body.get("full_details", ""),
                    attachment_url=body.get("attachment_url"),
                    is_important=1 if body.get("is_important") else 0,
                    is_published=1 if body.get("is_published", True) else 0,
                    publish_date=body.get("publish_date")
                )
                self.send_json({"success": True})
                return

        self.send_error_json("Endpoint Not Found", status=404)

    # ------------------- DELETE Requests -------------------
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/admin/"):
            admin_user = self.get_auth_user()
            if not admin_user or admin_user.get("role") != "ADMIN":
                self.send_error_json("Access Forbidden. Admin privilege required.", status=403)
                return

            if path.startswith("/api/admin/users/"):
                uid = int(path.split("/api/admin/users/")[1])
                db.delete_user(uid)
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/subjects/"):
                sub_id = int(path.split("/api/admin/subjects/")[1])
                db.delete_subject(sub_id)
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/notes/"):
                nid = int(path.split("/api/admin/notes/")[1])
                db.delete_note(nid)
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/syllabus/"):
                sid = int(path.split("/api/admin/syllabus/")[1])
                db.delete_syllabus(sid)
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/pyqs/"):
                pid = int(path.split("/api/admin/pyqs/")[1])
                db.delete_pyq(pid)
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/updates/"):
                uid = int(path.split("/api/admin/updates/")[1])
                db.delete_update(uid)
                self.send_json({"success": True})
                return

            if path.startswith("/api/admin/files/"):
                fid = int(path.split("/api/admin/files/")[1])
                db.delete_uploaded_file(fid)
                self.send_json({"success": True})
                return

        self.send_error_json("Endpoint Not Found", status=404)

    # ------------------- Multipart File Upload Handler -------------------
    def handle_multipart_upload(self):
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self.send_error_json("Content-Type must be multipart/form-data")
            return

        boundary = content_type.split("boundary=")[1].strip().encode("latin-1")
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 25 * 1024 * 1024:
            self.send_error_json("File size exceeds maximum permitted limit of 25MB.")
            return

        raw_data = self.rfile.read(content_length)
        parts = raw_data.split(b"--" + boundary)

        file_bytes = None
        orig_filename = "document.pdf"
        mime_type = "application/pdf"
        category = "General"
        semester = None
        subject = ""

        for part in parts:
            if not part or part == b"--\r\n" or part == b"--":
                continue
            headers_and_body = part.split(b"\r\n\r\n", 1)
            if len(headers_and_body) < 2:
                continue
            raw_headers, body = headers_and_body
            body = body.rstrip(b"\r\n")
            header_text = raw_headers.decode("latin-1", errors="replace")

            if 'name="file"' in header_text:
                file_bytes = body
                if 'filename="' in header_text:
                    orig_filename = header_text.split('filename="')[1].split('"')[0]
                if 'Content-Type: ' in header_text:
                    mime_type = header_text.split('Content-Type: ')[1].split("\r\n")[0].strip()
            elif 'name="category"' in header_text:
                category = body.decode("utf-8", errors="replace").strip()
            elif 'name="semester"' in header_text:
                val = body.decode("utf-8", errors="replace").strip()
                semester = int(val) if val.isdigit() else None
            elif 'name="subject"' in header_text:
                subject = body.decode("utf-8", errors="replace").strip()

        if not file_bytes:
            self.send_error_json("No valid file content received.")
            return

        # Validate allowed extensions
        ext = os.path.splitext(orig_filename)[1].lower()
        allowed_exts = [".pdf", ".jpg", ".jpeg", ".png", ".webp"]
        if ext not in allowed_exts:
            self.send_error_json(f"File type '{ext}' is not permitted. Allowed formats: PDF, JPG, PNG, WEBP.")
            return

        # Generate unique secure filename
        random_hex = secrets.token_hex(8)
        clean_orig = "".join(c for c in os.path.splitext(orig_filename)[0] if c.isalnum() or c in ("-", "_"))[:20]
        new_filename = f"{clean_orig}_{random_hex}{ext}"
        saved_path = os.path.join(UPLOADS_DIR, new_filename)

        with open(saved_path, "wb") as f:
            f.write(file_bytes)

        file_size_bytes = len(file_bytes)
        file_size_fmt = f"{file_size_bytes // 1024} KB" if file_size_bytes < 1024 * 1024 else f"{file_size_bytes / (1024*1024):.1f} MB"
        file_url = f"/static/uploads/{new_filename}"

        file_id = db.record_uploaded_file(
            file_name=new_filename,
            original_name=orig_filename,
            file_path=saved_path,
            file_size=file_size_bytes,
            mime_type=mime_type,
            category=category,
            semester=semester,
            subject=subject
        )

        self.send_json({
            "success": True,
            "file_id": file_id,
            "file_name": new_filename,
            "original_name": orig_filename,
            "file_url": file_url,
            "file_size": file_size_fmt,
            "mime_type": mime_type
        })

def run_server(port=PORT):
    server_address = ("0.0.0.0", port)
    httpd = ThreadingHTTPServer(server_address, DDURequestHandler)
    print(f"\n=======================================================")
    print(f" DDU B.Tech Notes Hub Server Running Successfully!")
    print(f" Port: {port}")
    print(f" URL:  http://localhost:{port}")
    print(f" Admin Portal (Isolated): http://localhost:{port}/admin")
    print(f" Student Portal: http://localhost:{port}")
    print(f"=======================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server gracefully...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
