import os
import sys
import json
import time
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
import server
import database as db

PORT = 8999
BASE_URL = f"http://127.0.0.1:{PORT}"

def run_tests():
    print("==================================================")
    print(" DDU B.Tech Notes Hub - Comprehensive Test Suite")
    print("==================================================")

    # 1. Start Server in thread
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), server.DDURequestHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)

    def request(path, method="GET", body=None, token=None, headers=None):
        url = f"{BASE_URL}{path}"
        req_headers = headers.copy() if headers else {}
        if token:
            req_headers["Authorization"] = f"Bearer {token}"
        data = None
        if body is not None and not isinstance(body, bytes):
            data = json.dumps(body).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        elif isinstance(body, bytes):
            data = body

        req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                status = resp.status
                content = resp.read()
                return status, content, resp.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers

    try:
        # TEST 1: Public Static & SEO Endpoints
        print("\n[TEST 1] Verifying Static & SEO Endpoints...")
        status, content, _ = request("/")
        assert status == 200, f"Expected 200 for /, got {status}"
        assert b"DDU B.Tech Notes Hub" in content, "Home page missing title"
        print("  ✓ Home page HTML rendered successfully.")

        status, content, _ = request("/robots.txt")
        assert status == 200 and b"Disallow: /admin" in content
        print("  ✓ robots.txt SEO verified.")

        status, content, _ = request("/sitemap.xml")
        assert status == 200 and b"<urlset" in content
        print("  ✓ sitemap.xml SEO verified.")

        status, content, _ = request("/static/css/style.css")
        assert status == 200 and b"--primary" in content
        print("  ✓ CSS stylesheet served with status 200.")

        # TEST 2: Student Registration & Login
        print("\n[TEST 2] Verifying Student Authentication...")
        reg_payload = {
            "full_name": "Test Student",
            "email": f"test_student_{int(time.time())}@ddu.ac.in",
            "password": "Password123!",
            "college": "DDU Gorakhpur University",
            "branch": "CSE",
            "semester": 3
        }
        status, content, _ = request("/api/auth/register", method="POST", body=reg_payload)
        assert status == 200, f"Register failed: {content}"
        reg_data = json.loads(content.decode())
        student_token = reg_data["token"]
        student_id = reg_data["user"]["id"]
        assert reg_data["user"]["role"] == "STUDENT"
        print("  ✓ Student registration successful. Received session token.")

        # Student Login
        login_payload = {"email": reg_payload["email"], "password": "Password123!"}
        status, content, _ = request("/api/auth/login", method="POST", body=login_payload)
        assert status == 200
        print("  ✓ Student login successful.")

        # Invalid password check
        bad_login = {"email": reg_payload["email"], "password": "WrongPassword!"}
        status, _, _ = request("/api/auth/login", method="POST", body=bad_login)
        assert status == 401
        print("  ✓ Invalid password rejected with HTTP 401.")

        # TEST 3: Admin Login & Role Protection (RBAC)
        print("\n[TEST 3] Verifying Admin Authentication & RBAC Protection...")
        admin_login = {"email": "admin@ddunotes.ac.in", "password": "AdminPassword123!"}
        status, content, _ = request("/api/auth/login", method="POST", body=admin_login)
        assert status == 200, f"Admin login failed: {content}"
        admin_data = json.loads(content.decode())
        admin_token = admin_data["token"]
        assert admin_data["user"]["role"] == "ADMIN"
        print("  ✓ Admin login successful. Role verified as 'ADMIN'.")

        # Student attempting to access /api/admin/stats -> MUST BE 403 FORBIDDEN!
        status, content, _ = request("/api/admin/stats", token=student_token)
        assert status == 403, f"Expected 403 Forbidden for student on admin API, got {status}"
        print("  ✓ Security Guard: Student access to Admin API blocked with HTTP 403 Forbidden.")

        # Unauthenticated user attempting to access admin API -> MUST BE 403
        status, _, _ = request("/api/admin/stats")
        assert status == 403
        print("  ✓ Security Guard: Unauthenticated access to Admin API blocked with HTTP 403.")

        # Admin accessing /api/admin/stats -> 200 OK
        status, content, _ = request("/api/admin/stats", token=admin_token)
        assert status == 200
        stats = json.loads(content.decode())["stats"]
        assert stats["total_subjects"] > 0
        assert stats["total_notes"] > 0
        print(f"  ✓ Admin Stats Verified: {stats['total_students']} Students, {stats['total_notes']} Notes, {stats['total_subjects']} Subjects, {stats['total_pyqs']} PYQs.")

        # TEST 4: Student Features (Dashboard, Bookmarks, Views)
        print("\n[TEST 4] Verifying Student Portal Features...")
        # Get notes
        status, content, _ = request("/api/notes?semester_id=1")
        notes = json.loads(content.decode())["notes"]
        assert len(notes) > 0
        first_note_id = notes[0]["id"]

        # Bookmark note
        status, content, _ = request("/api/student/bookmark", method="POST", body={"note_id": first_note_id}, token=student_token)
        assert status == 200
        bm_res = json.loads(content.decode())
        assert bm_res["is_bookmarked"] is True
        print("  ✓ Note bookmarked successfully.")

        # Check student bookmarks
        status, content, _ = request("/api/student/bookmarks", token=student_token)
        bms = json.loads(content.decode())["bookmarks"]
        assert len(bms) >= 1
        print("  ✓ Student bookmarks retrieved.")

        # Record note view
        status, _, _ = request(f"/api/notes/{first_note_id}/view", token=student_token)
        assert status == 200
        print("  ✓ Note view tracked.")

        # Check dashboard
        status, content, _ = request("/api/student/dashboard", token=student_token)
        assert status == 200
        dash = json.loads(content.decode())
        assert dash["user"]["id"] == student_id
        assert len(dash["bookmarks"]) >= 1
        print("  ✓ Student Dashboard data loaded with bookmarks and personalized stats.")

        # TEST 5: Public Study Material APIs
        print("\n[TEST 5] Verifying Public Academic Material APIs...")
        status, content, _ = request("/api/semesters")
        assert len(json.loads(content.decode())["semesters"]) == 8
        print("  ✓ 8 Semesters API verified.")

        status, content, _ = request("/api/syllabus?semester_id=1")
        assert len(json.loads(content.decode())["syllabus"]) > 0
        print("  ✓ Syllabus API verified.")

        status, content, _ = request("/api/pyqs?year=2024")
        assert len(json.loads(content.decode())["pyqs"]) > 0
        print("  ✓ Previous Year Papers API verified.")

        status, content, _ = request("/api/updates")
        assert len(json.loads(content.decode())["updates"]) > 0
        print("  ✓ Daily Campus Notices API verified.")

        status, content, _ = request("/api/search?q=Data")
        search_res = json.loads(content.decode())
        assert len(search_res["subjects"]) > 0 or len(search_res["notes"]) > 0
        print(f"  ✓ Global Search verified: Found matching subjects/notes for query 'Data'.")

        # TEST 6: Admin CRUD Operations & Dynamic Reflectivity
        print("\n[TEST 6] Verifying Admin CRUD & Instant Website Updates...")
        
        # 1. Create a new Subject
        new_sub = {
            "name": "Cloud Computing and DevOps",
            "code": f"BCS-TEST-{int(time.time())}",
            "semester_id": 8,
            "branch": "CSE",
            "description": "Docker, Kubernetes, AWS, and CI/CD pipelines"
        }
        status, content, _ = request("/api/admin/subjects", method="POST", body=new_sub, token=admin_token)
        assert status == 200
        new_sub_id = json.loads(content.decode())["subject_id"]
        print(f"  ✓ Admin created Subject {new_sub['code']} (ID: {new_sub_id})")

        # 2. Create a new Note for this subject
        new_note = {
            "title": "Unit 1: Introduction to Containerization & Docker",
            "subject_id": new_sub_id,
            "unit_id": 1,
            "description": "Container architecture, cgroups, namespaces and Dockerfile optimization.",
            "file_url": "/static/uploads/notes_bcs_201_u1_asymptotic.pdf",
            "file_name": "docker_unit1.pdf",
            "file_size": "450 KB",
            "is_important": True,
            "is_published": True
        }
        status, content, _ = request("/api/admin/notes", method="POST", body=new_note, token=admin_token)
        assert status == 200
        new_note_id = json.loads(content.decode())["note_id"]
        print(f"  ✓ Admin added new note (ID: {new_note_id})")

        # 3. Verify the newly created note IMMEDIATELY appears on the student website API
        status, content, _ = request(f"/api/notes?subject_id={new_sub_id}")
        notes_found = json.loads(content.decode())["notes"]
        assert len(notes_found) == 1
        assert notes_found[0]["title"] == new_note["title"]
        print("  ✓ Requirement 25 Verified: Admin changes immediately reflect on the public student website!")

        # 4. Edit Note
        edit_note = new_note.copy()
        edit_note["title"] = "Unit 1: Advanced Docker & Container Security (Updated)"
        status, _, _ = request(f"/api/admin/notes/{new_note_id}", method="PUT", body=edit_note, token=admin_token)
        assert status == 200
        
        status, content, _ = request(f"/api/notes?subject_id={new_sub_id}")
        updated_note = json.loads(content.decode())["notes"][0]
        assert updated_note["title"] == edit_note["title"]
        print("  ✓ Admin updated note verified.")

        # 5. Delete Note
        status, _, _ = request(f"/api/admin/notes/{new_note_id}", method="DELETE", token=admin_token)
        assert status == 200
        status, content, _ = request(f"/api/notes?subject_id={new_sub_id}")
        assert len(json.loads(content.decode())["notes"]) == 0
        print("  ✓ Admin deleted note verified.")

        # 6. Delete Subject
        status, _, _ = request(f"/api/admin/subjects/{new_sub_id}", method="DELETE", token=admin_token)
        assert status == 200
        print("  ✓ Admin deleted test subject verified.")

        # 7. Post Daily Update
        new_update = {
            "title": "Urgent: Library Reading Room Extended Hours for End-Sem Exam Prep",
            "category": "University Notice",
            "short_description": "Central Library will remain open 24x7 during examination weeks.",
            "full_details": "Special quiet study zones and high-speed Wi-Fi access available for all B.Tech students.",
            "is_important": True,
            "publish_date": "2026-09-26"
        }
        status, content, _ = request("/api/admin/updates", method="POST", body=new_update, token=admin_token)
        assert status == 200
        new_up_id = json.loads(content.decode())["update_id"]
        print(f"  ✓ Admin posted campus update (ID: {new_up_id})")

        # 8. Toggle Student Active Status
        status, content, _ = request("/api/admin/users/toggle", method="POST", body={"user_id": student_id}, token=admin_token)
        assert status == 200
        print("  ✓ Admin toggled student account status.")

        # TEST 7: Secure Multipart File Upload
        print("\n[TEST 7] Verifying Secure Multipart File Upload & PDF Serving...")
        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
        test_pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n180\n%%EOF"
        
        multipart_body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="sample_exam_notes.pdf"\r\n'
            f"Content-Type: application/pdf\r\n\r\n"
        ).encode("utf-8") + test_pdf_content + (
            f"\r\n--{boundary}\r\n"
            f'Content-Disposition: form-data; name="category"\r\n\r\n'
            f"Notes\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        status, content, _ = request(
            "/api/admin/upload",
            method="POST",
            body=multipart_body,
            token=admin_token,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
        )
        assert status == 200, f"Upload failed: {content}"
        upload_data = json.loads(content.decode())
        uploaded_url = upload_data["file_url"]
        print(f"  ✓ File upload successful: {upload_data['original_name']} saved as {upload_data['file_name']}")

        # Verify downloading / viewing the uploaded PDF
        status, downloaded_bytes, headers = request(uploaded_url)
        assert status == 200, f"Failed to download uploaded PDF: {status}"
        assert headers.get("Content-Type") == "application/pdf"
        assert b"%PDF-1.4" in downloaded_bytes
        print(f"  ✓ PDF document streamed and verified ({len(downloaded_bytes)} bytes).")

        print("\n==================================================")
        print(" ALL TESTS PASSED! (100% SUCCESS)")
        print("==================================================")

    finally:
        httpd.shutdown()

if __name__ == "__main__":
    run_tests()
