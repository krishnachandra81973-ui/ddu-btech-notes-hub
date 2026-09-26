from http.server import BaseHTTPRequestHandler
import json
import sqlite3
import os
import urllib.parse

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "ddu_portal.db")
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(os.getcwd(), "ddu_portal.db")

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            if path == "/api/semesters":
                cur.execute("SELECT * FROM semesters ORDER BY semester_number ASC")
                rows = [dict(r) for r in cur.fetchall()]
                self.wfile.write(json.dumps({"semesters": rows}).encode("utf-8"))
                conn.close()
                return

            if path == "/api/subjects":
                sem_id = query.get("semester_id", [None])[0]
                if sem_id:
                    cur.execute("SELECT * FROM subjects WHERE semester_id = ? ORDER BY id ASC", (int(sem_id),))
                else:
                    cur.execute("SELECT * FROM subjects ORDER BY semester_id, id ASC")
                rows = [dict(r) for r in cur.fetchall()]
                self.wfile.write(json.dumps({"subjects": rows}).encode("utf-8"))
                conn.close()
                return

            if path.startswith("/api/subjects/"):
                sub_id = int(path.split("/api/subjects/")[1].split("/")[0])
                cur.execute("SELECT s.*, sem.semester_number, sem.title as semester_title FROM subjects s JOIN semesters sem ON s.semester_id = sem.id WHERE s.id = ?", (sub_id,))
                sub = cur.fetchone()
                if sub:
                    sub_dict = dict(sub)
                    cur.execute("SELECT * FROM units WHERE subject_id = ? ORDER BY unit_number ASC", (sub_id,))
                    sub_dict["units"] = [dict(u) for u in cur.fetchall()]
                    self.wfile.write(json.dumps({"subject": sub_dict}).encode("utf-8"))
                else:
                    self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
                conn.close()
                return

            if path == "/api/notes":
                sem_id = query.get("semester_id", [None])[0]
                sub_id = query.get("subject_id", [None])[0]
                sql = "SELECT n.*, s.name as subject_name, s.code as subject_code, sem.semester_number FROM notes n JOIN subjects s ON n.subject_id = s.id JOIN semesters sem ON n.semester_id = sem.id WHERE n.is_published = 1"
                params = []
                if sem_id:
                    sql += " AND n.semester_id = ?"
                    params.append(int(sem_id))
                if sub_id:
                    sql += " AND n.subject_id = ?"
                    params.append(int(sub_id))
                sql += " ORDER BY n.id DESC"
                cur.execute(sql, params)
                rows = [dict(r) for r in cur.fetchall()]
                self.wfile.write(json.dumps({"notes": rows}).encode("utf-8"))
                conn.close()
                return

            if path == "/api/syllabus":
                cur.execute("SELECT syl.*, s.name as subject_name, s.code as subject_code, sem.semester_number FROM syllabus syl LEFT JOIN subjects s ON syl.subject_id = s.id LEFT JOIN semesters sem ON syl.semester_id = sem.id WHERE syl.is_published = 1 ORDER BY syl.id DESC")
                rows = [dict(r) for r in cur.fetchall()]
                self.wfile.write(json.dumps({"syllabus": rows}).encode("utf-8"))
                conn.close()
                return

            if path == "/api/pyqs":
                cur.execute("SELECT p.*, s.name as subject_name, s.code as subject_code, sem.semester_number FROM pyqs p JOIN subjects s ON p.subject_id = s.id JOIN semesters sem ON p.semester_id = sem.id WHERE p.is_published = 1 ORDER BY p.exam_year DESC, p.id DESC")
                rows = [dict(r) for r in cur.fetchall()]
                self.wfile.write(json.dumps({"pyqs": rows}).encode("utf-8"))
                conn.close()
                return

            if path == "/api/updates":
                cur.execute("SELECT * FROM daily_updates WHERE is_published = 1 ORDER BY is_pinned DESC, date_posted DESC, id DESC")
                rows = [dict(r) for r in cur.fetchall()]
                self.wfile.write(json.dumps({"updates": rows}).encode("utf-8"))
                conn.close()
                return

            self.wfile.write(json.dumps({"status": "ok", "app": "DDU B.Tech Notes Hub"}).encode("utf-8"))
            conn.close()
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(body.decode("utf-8"))
        except:
            payload = {}

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        if path == "/api/auth/login":
            email = payload.get("email", "")
            user = {
                "id": 1,
                "full_name": "Keshav Narayan" if "keshav" in email else "Student Engineer",
                "email": email or "student@ddu.ac.in",
                "branch": "CSE / IT",
                "semester": 6,
                "role": "STUDENT"
            }
            token = "ddu_token_verified"
            self.wfile.write(json.dumps({"token": token, "user": user}).encode("utf-8"))
            return

        if path == "/api/feedback":
            self.wfile.write(json.dumps({"success": True, "message": "Feedback received"}).encode("utf-8"))
            return

        self.wfile.write(json.dumps({"success": True}).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
