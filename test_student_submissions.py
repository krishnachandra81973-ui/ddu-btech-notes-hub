import http.client
import json
import time
import threading
from http.server import ThreadingHTTPServer
import server
import database as db

PORT = 8999

def test_workflow():
    db.ensure_db_schema()
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), server.DDURequestHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)

    conn = http.client.HTTPConnection("127.0.0.1", PORT)
    
    # 1. Register a student contributor
    unique_ts = int(time.time())
    student_email = f"contributor_{unique_ts}@gmail.com"
    student_pass = "StudentPass123!"
    
    reg_body = json.dumps({
        "full_name": "Aman Verma",
        "email": student_email,
        "password": student_pass,
        "college": "Deen Dayal Upadhyaya Gorakhpur University",
        "course": "B.Tech",
        "branch": "CSE",
        "semester": 3
    })
    conn.request("POST", "/api/auth/register", reg_body, {"Content-Type": "application/json"})
    res = conn.getresponse()
    assert res.status == 200, f"Register failed: {res.status}"
    reg_data = json.loads(res.read().decode())
    student_token = reg_data["token"]
    print("✓ Student registered successfully.")

    # 2. Login as Admin
    admin_body = json.dumps({
        "email": "admin@ddunotes.ac.in",
        "password": "AdminPassword123!"
    })
    conn.request("POST", "/api/auth/login", admin_body, {"Content-Type": "application/json"})
    res = conn.getresponse()
    assert res.status == 200, f"Admin login failed: {res.status}"
    admin_token = json.loads(res.read().decode())["token"]
    print("✓ Admin login successful.")

    # 3. Student submits a new note
    submit_body = json.dumps({
        "title": f"Unit 2: Graph Theory Handwritten Notes {unique_ts}",
        "subject_id": 16,
        "unit_id": 2,
        "description": "Clean handwritten notes covering Euler and Hamiltonian graphs.",
        "file_url": "https://example.com/notes_unit2.pdf",
        "file_name": "graph_theory_notes.pdf",
        "file_size": "2.4 MB"
    })
    conn.request("POST", "/api/student/notes/submit", submit_body, {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {student_token}"
    })
    res = conn.getresponse()
    assert res.status == 200, f"Student submission failed: {res.status}"
    sub_res = json.loads(res.read().decode())
    note_id = sub_res["note_id"]
    print(f"✓ Student submitted note #{note_id}. Status: PENDING.")

    # 4. Verify note is NOT in public notes API
    conn.request("GET", f"/api/notes?subject_id=16")
    res = conn.getresponse()
    notes = json.loads(res.read().decode())["notes"]
    matching = [n for n in notes if n["id"] == note_id]
    assert len(matching) == 0, "Security Violation: Pending note appeared in public notes list!"
    print("✓ Security Check: Pending note is properly HIDDEN from public portal.")

    # 5. Check student's personal submissions list
    conn.request("GET", "/api/student/notes/my-submissions", headers={"Authorization": f"Bearer {student_token}"})
    res = conn.getresponse()
    submissions = json.loads(res.read().decode())["submissions"]
    my_note = [s for s in submissions if s["id"] == note_id]
    assert len(my_note) == 1, "Student submission not found in my-submissions!"
    assert my_note[0]["status"] == "PENDING", f"Expected PENDING, got {my_note[0]['status']}"
    assert my_note[0]["is_verified"] == 0, "Expected is_verified=0"
    print("✓ Student can see submitted note in My Submissions with status PENDING.")

    # 6. Admin checks pending notes list
    conn.request("GET", "/api/admin/notes/pending", headers={"Authorization": f"Bearer {admin_token}"})
    res = conn.getresponse()
    pending_notes = json.loads(res.read().decode())["notes"]
    admin_note = [p for p in pending_notes if p["id"] == note_id]
    assert len(admin_note) == 1, "Admin failed to see pending note!"
    assert admin_note[0]["contributed_by_name"] == "Aman Verma"
    print("✓ Admin successfully sees student's pending note in verification queue.")

    # 7. Admin 'Ticks' (Approves) the note
    verify_body = json.dumps({
        "note_id": note_id,
        "action": "approve"
    })
    conn.request("POST", "/api/admin/notes/verify", verify_body, {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}"
    })
    res = conn.getresponse()
    assert res.status == 200, f"Admin verify failed: {res.status}"
    print("✓ Admin successfully approved (ticked) the note.")

    # 8. Note is now LIVE in public notes API
    conn.request("GET", f"/api/notes?subject_id=16")
    res = conn.getresponse()
    public_notes = json.loads(res.read().decode())["notes"]
    now_live = [n for n in public_notes if n["id"] == note_id]
    assert len(now_live) == 1, "Approved note did not appear in public notes list!"
    assert now_live[0]["contributed_by_name"] == "Aman Verma"
    assert now_live[0]["is_verified"] == 1
    print(f"✓ LIVE TEST PASSED: Approved note is now active on public student portal with Contributor '{now_live[0]['contributed_by_name']}'!")

    # 9. Clean up test note
    conn.request("DELETE", f"/api/admin/notes/{note_id}", headers={"Authorization": f"Bearer {admin_token}"})
    conn.getresponse()
    print("✓ Test cleanup completed.")
    conn.close()
    httpd.server_close()
    print("==================================================")
    print("🎉 ALL STUDENT SUBMISSION TESTS PASSED (100% SUCCESS)!")
    print("==================================================")

if __name__ == "__main__":
    test_workflow()
