import sqlite3
import os
import hashlib
import secrets
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ddu_portal.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000
    )
    return key.hex(), salt

def verify_password(password: str, password_hash: str, salt: str) -> bool:
    new_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(new_hash, password_hash)

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Users
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        college TEXT DEFAULT 'Deen Dayal Upadhyaya Gorakhpur University',
        course TEXT DEFAULT 'B.Tech',
        branch TEXT DEFAULT 'CSE',
        semester INTEGER DEFAULT 1,
        role TEXT NOT NULL DEFAULT 'STUDENT', -- 'STUDENT' or 'ADMIN'
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Sessions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 3. Semesters
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS semesters (
        id INTEGER PRIMARY KEY, -- 1 to 8
        number INTEGER NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT
    );
    """)

    # 4. Subjects
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semester_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        branch TEXT DEFAULT 'All Branches',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
    );
    """)

    # 5. Units
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        unit_number INTEGER NOT NULL, -- 1 to 5
        title TEXT NOT NULL,
        description TEXT,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        UNIQUE (subject_id, unit_number)
    );
    """)

    # 6. Notes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        unit_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        file_url TEXT NOT NULL,
        file_name TEXT,
        file_size TEXT,
        is_important INTEGER DEFAULT 0,
        is_published INTEGER DEFAULT 1,
        download_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
    );
    """)

    # 7. Syllabus
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS syllabus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semester_id INTEGER NOT NULL,
        subject_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        file_url TEXT NOT NULL,
        is_published INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );
    """)

    # 8. Previous Year Papers (PYQs)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pyqs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semester_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        branch TEXT NOT NULL DEFAULT 'CSE',
        exam_year INTEGER NOT NULL,
        paper_title TEXT NOT NULL,
        file_url TEXT NOT NULL,
        is_published INTEGER DEFAULT 1,
        download_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );
    """)

    # 9. Daily Updates
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS daily_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL, -- 'University Notice', 'Exam', 'Result', 'Admit Card', 'Syllabus', 'Notes', 'Previous Year Paper', 'Important Announcement'
        short_description TEXT NOT NULL,
        full_details TEXT,
        attachment_url TEXT,
        is_important INTEGER DEFAULT 0,
        is_published INTEGER DEFAULT 1,
        publish_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 10. Bookmarks
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        note_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
        UNIQUE (user_id, note_id)
    );
    """)

    # 11. Recently Viewed Notes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recently_viewed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        note_id INTEGER NOT NULL,
        viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    """)

    # 12. Uploaded Files Log
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS uploaded_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        category TEXT,
        semester INTEGER,
        subject TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Performance Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_subjects_sem ON subjects(semester_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_sub ON notes(subject_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_unit ON notes(unit_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pyqs_filter ON pyqs(semester_id, subject_id, branch, exam_year);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_updates_date ON daily_updates(publish_date DESC);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);")

    conn.commit()
    conn.close()

# ----------------- Auth & User Queries -----------------

def create_user(full_name, email, password, college="Deen Dayal Upadhyaya Gorakhpur University",
                course="B.Tech", branch="CSE", semester=1, role="STUDENT"):
    conn = get_connection()
    cursor = conn.cursor()
    hash_val, salt = hash_password(password)
    try:
        cursor.execute("""
        INSERT INTO users (full_name, email, password_hash, salt, college, course, branch, semester, role)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (full_name, email.lower().strip(), hash_val, salt, college, course, branch, semester, role))
        user_id = cursor.lastrowid
        conn.commit()
        return user_id
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def authenticate_user(email, password):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email.lower().strip(),))
    user = cursor.fetchone()
    conn.close()
    if not user:
        return None
    if not user["is_active"]:
        return "INACTIVE"
    if verify_password(password, user["password_hash"], user["salt"]):
        return dict(user)
    return None

def create_user_session(user_id, days=7):
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=days)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
                   (user_id, token, expires_at.isoformat()))
    conn.commit()
    conn.close()
    return token

def get_user_from_token(token):
    if not token:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT u.id, u.full_name, u.email, u.college, u.course, u.branch, u.semester, u.role, u.is_active, s.expires_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
    """, (token,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    try:
        exp = datetime.fromisoformat(row["expires_at"])
        if datetime.utcnow() > exp:
            return None
    except Exception:
        pass
    if not row["is_active"]:
        return None
    return dict(row)

def delete_user_session(token):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

def get_all_users(search=""):
    conn = get_connection()
    cursor = conn.cursor()
    query = """
    SELECT id, full_name, email, college, course, branch, semester, role, is_active, created_at
    FROM users
    WHERE 1=1
    """
    params = []
    if search:
        query += " AND (full_name LIKE ? OR email LIKE ? OR branch LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term])
    query += " ORDER BY created_at DESC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def toggle_user_active(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?", (user_id,))
    conn.commit()
    cursor.execute("SELECT is_active FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return row["is_active"] if row else None

def delete_user(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True

def update_user_password(user_id, new_password):
    conn = get_connection()
    cursor = conn.cursor()
    hash_val, salt = hash_password(new_password)
    cursor.execute("""
    UPDATE users SET password_hash = ?, salt = ? WHERE id = ?
    """, (hash_val, salt, user_id))
    conn.commit()
    conn.close()
    return True

# ----------------- Semesters, Subjects, Units -----------------

def get_semesters():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT s.*, 
        (SELECT COUNT(*) FROM subjects WHERE semester_id = s.id) AS subject_count,
        (SELECT COUNT(*) FROM notes n JOIN subjects sub ON n.subject_id = sub.id WHERE sub.semester_id = s.id AND n.is_published = 1) AS note_count
    FROM semesters s
    ORDER BY s.number ASC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_subjects(semester_id=None, branch=None):
    conn = get_connection()
    cursor = conn.cursor()
    query = """
    SELECT sub.*, sem.number AS semester_number, sem.title AS semester_title,
        (SELECT COUNT(*) FROM notes WHERE subject_id = sub.id AND is_published = 1) AS notes_count,
        (SELECT COUNT(*) FROM pyqs WHERE subject_id = sub.id AND is_published = 1) AS pyq_count
    FROM subjects sub
    JOIN semesters sem ON sub.semester_id = sem.id
    WHERE 1=1
    """
    params = []
    if semester_id:
        query += " AND sub.semester_id = ?"
        params.append(semester_id)
    if branch and branch != 'All Branches':
        query += " AND (sub.branch = ? OR sub.branch = 'All Branches')"
        params.append(branch)
    query += " ORDER BY sem.number ASC, sub.name ASC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_subject_detail(subject_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT sub.*, sem.number as semester_number, sem.title as semester_title
    FROM subjects sub
    JOIN semesters sem ON sub.semester_id = sem.id
    WHERE sub.id = ?
    """, (subject_id,))
    sub = cursor.fetchone()
    if not sub:
        conn.close()
        return None
    subject = dict(sub)
    
    # fetch units
    cursor.execute("SELECT * FROM units WHERE subject_id = ? ORDER BY unit_number ASC", (subject_id,))
    subject["units"] = [dict(u) for u in cursor.fetchall()]
    
    # fetch notes
    cursor.execute("""
    SELECT n.*, u.unit_number, u.title as unit_title
    FROM notes n
    LEFT JOIN units u ON n.unit_id = u.id
    WHERE n.subject_id = ? AND n.is_published = 1
    ORDER BY u.unit_number ASC, n.id ASC
    """, (subject_id,))
    subject["notes"] = [dict(n) for n in cursor.fetchall()]

    # fetch pyqs
    cursor.execute("""
    SELECT * FROM pyqs WHERE subject_id = ? AND is_published = 1 ORDER BY exam_year DESC
    """, (subject_id,))
    subject["pyqs"] = [dict(p) for p in cursor.fetchall()]

    # fetch syllabus
    cursor.execute("""
    SELECT * FROM syllabus WHERE subject_id = ? AND is_published = 1
    """, (subject_id,))
    syl = cursor.fetchone()
    subject["syllabus"] = dict(syl) if syl else None

    conn.close()
    return subject

# ----------------- Notes Queries & CRUD -----------------

def get_notes(semester_id=None, subject_id=None, unit_number=None, branch=None, search=None, only_published=True):
    conn = get_connection()
    cursor = conn.cursor()
    query = """
    SELECT n.*, sub.name as subject_name, sub.code as subject_code, sub.semester_id,
           sem.number as semester_number, u.unit_number, u.title as unit_title
    FROM notes n
    JOIN subjects sub ON n.subject_id = sub.id
    JOIN semesters sem ON sub.semester_id = sem.id
    LEFT JOIN units u ON n.unit_id = u.id
    WHERE 1=1
    """
    params = []
    if only_published:
        query += " AND n.is_published = 1"
    if semester_id:
        query += " AND sub.semester_id = ?"
        params.append(semester_id)
    if subject_id:
        query += " AND n.subject_id = ?"
        params.append(subject_id)
    if unit_number:
        query += " AND u.unit_number = ?"
        params.append(unit_number)
    if branch and branch != 'All Branches':
        query += " AND (sub.branch = ? OR sub.branch = 'All Branches')"
        params.append(branch)
    if search:
        query += " AND (n.title LIKE ? OR n.description LIKE ? OR sub.name LIKE ? OR sub.code LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term, term])
    query += " ORDER BY sem.number ASC, sub.name ASC, u.unit_number ASC, n.id ASC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_note(subject_id, unit_id, title, description, file_url, file_name, file_size, is_important=0, is_published=1):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO notes (subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published))
    note_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return note_id

def update_note(note_id, subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE notes
    SET subject_id = ?, unit_id = ?, title = ?, description = ?, file_url = ?, 
        file_name = ?, file_size = ?, is_important = ?, is_published = ?
    WHERE id = ?
    """, (subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published, note_id))
    conn.commit()
    conn.close()
    return True

def delete_note(note_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
    return True

# ----------------- Subject CRUD -----------------

def create_subject(semester_id, name, code, branch='All Branches', description=''):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO subjects (semester_id, name, code, branch, description)
    VALUES (?, ?, ?, ?, ?)
    """, (semester_id, name, code, branch, description))
    sub_id = cursor.lastrowid
    
    # Auto-create standard Units 1 to 5 for the new subject
    for u in range(1, 6):
        cursor.execute("INSERT INTO units (subject_id, unit_number, title) VALUES (?, ?, ?)",
                       (sub_id, u, f"Unit {u}: Module Topics"))
    
    conn.commit()
    conn.close()
    return sub_id

def update_subject(subject_id, semester_id, name, code, branch, description):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE subjects
    SET semester_id = ?, name = ?, code = ?, branch = ?, description = ?
    WHERE id = ?
    """, (semester_id, name, code, branch, description, subject_id))
    conn.commit()
    conn.close()
    return True

def delete_subject(subject_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
    conn.commit()
    conn.close()
    return True

# ----------------- Syllabus Queries & CRUD -----------------

def get_all_syllabus(semester_id=None, subject_id=None, only_published=True):
    conn = get_connection()
    cursor = conn.cursor()
    query = """
    SELECT syl.*, sem.number as semester_number, sem.title as semester_title,
           sub.name as subject_name, sub.code as subject_code, sub.branch as subject_branch
    FROM syllabus syl
    JOIN semesters sem ON syl.semester_id = sem.id
    LEFT JOIN subjects sub ON syl.subject_id = sub.id
    WHERE 1=1
    """
    params = []
    if only_published:
        query += " AND syl.is_published = 1"
    if semester_id:
        query += " AND syl.semester_id = ?"
        params.append(semester_id)
    if subject_id:
        query += " AND syl.subject_id = ?"
        params.append(subject_id)
    query += " ORDER BY sem.number ASC, sub.name ASC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_syllabus(semester_id, subject_id, title, description, file_url, is_published=1):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO syllabus (semester_id, subject_id, title, description, file_url, is_published)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (semester_id, subject_id, title, description, file_url, is_published))
    syl_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return syl_id

def update_syllabus(syl_id, semester_id, subject_id, title, description, file_url, is_published):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE syllabus
    SET semester_id = ?, subject_id = ?, title = ?, description = ?, file_url = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    """, (semester_id, subject_id, title, description, file_url, is_published, syl_id))
    conn.commit()
    conn.close()
    return True

def delete_syllabus(syl_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM syllabus WHERE id = ?", (syl_id,))
    conn.commit()
    conn.close()
    return True

# ----------------- PYQs Queries & CRUD -----------------

def get_all_pyqs(semester_id=None, subject_id=None, branch=None, exam_year=None, only_published=True):
    conn = get_connection()
    cursor = conn.cursor()
    query = """
    SELECT p.*, sem.number as semester_number, sem.title as semester_title,
           sub.name as subject_name, sub.code as subject_code
    FROM pyqs p
    JOIN semesters sem ON p.semester_id = sem.id
    JOIN subjects sub ON p.subject_id = sub.id
    WHERE 1=1
    """
    params = []
    if only_published:
        query += " AND p.is_published = 1"
    if semester_id:
        query += " AND p.semester_id = ?"
        params.append(semester_id)
    if subject_id:
        query += " AND p.subject_id = ?"
        params.append(subject_id)
    if branch and branch != 'All Branches':
        query += " AND (p.branch = ? OR p.branch = 'All Branches')"
        params.append(branch)
    if exam_year:
        query += " AND p.exam_year = ?"
        params.append(exam_year)
    query += " ORDER BY p.exam_year DESC, sem.number ASC, sub.name ASC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_pyq(semester_id, subject_id, branch, exam_year, paper_title, file_url, is_published=1):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO pyqs (semester_id, subject_id, branch, exam_year, paper_title, file_url, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (semester_id, subject_id, branch, exam_year, paper_title, file_url, is_published))
    pyq_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return pyq_id

def update_pyq(pyq_id, semester_id, subject_id, branch, exam_year, paper_title, file_url, is_published):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE pyqs
    SET semester_id = ?, subject_id = ?, branch = ?, exam_year = ?, paper_title = ?, file_url = ?, is_published = ?
    WHERE id = ?
    """, (semester_id, subject_id, branch, exam_year, paper_title, file_url, is_published, pyq_id))
    conn.commit()
    conn.close()
    return True

def delete_pyq(pyq_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM pyqs WHERE id = ?", (pyq_id,))
    conn.commit()
    conn.close()
    return True

# ----------------- Daily Updates Queries & CRUD -----------------

def get_all_updates(category=None, search=None, only_published=True):
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM daily_updates WHERE 1=1"
    params = []
    if only_published:
        query += " AND is_published = 1"
    if category and category != 'All':
        query += " AND category = ?"
        params.append(category)
    if search:
        query += " AND (title LIKE ? OR short_description LIKE ? OR full_details LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term])
    query += " ORDER BY is_important DESC, publish_date DESC, id DESC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_update(title, category, short_description, full_details, attachment_url, is_important=0, is_published=1, publish_date=None):
    if not publish_date:
        publish_date = datetime.utcnow().strftime("%Y-%m-%d")
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO daily_updates (title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date))
    up_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return up_id

def update_update(up_id, title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE daily_updates
    SET title = ?, category = ?, short_description = ?, full_details = ?, attachment_url = ?, 
        is_important = ?, is_published = ?, publish_date = ?
    WHERE id = ?
    """, (title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date, up_id))
    conn.commit()
    conn.close()
    return True

def delete_update(up_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM daily_updates WHERE id = ?", (up_id,))
    conn.commit()
    conn.close()
    return True

# ----------------- Student Features: Bookmarks & History -----------------

def toggle_bookmark(user_id, note_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM bookmarks WHERE user_id = ? AND note_id = ?", (user_id, note_id))
    row = cursor.fetchone()
    if row:
        cursor.execute("DELETE FROM bookmarks WHERE id = ?", (row["id"],))
        is_bookmarked = False
    else:
        cursor.execute("INSERT INTO bookmarks (user_id, note_id) VALUES (?, ?)", (user_id, note_id))
        is_bookmarked = True
    conn.commit()
    conn.close()
    return is_bookmarked

def get_user_bookmarks(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT b.id as bookmark_id, b.created_at as bookmarked_at,
           n.*, sub.name as subject_name, sub.code as subject_code, sem.number as semester_number
    FROM bookmarks b
    JOIN notes n ON b.note_id = n.id
    JOIN subjects sub ON n.subject_id = sub.id
    JOIN semesters sem ON sub.semester_id = sem.id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
    """, (user_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def record_note_view(user_id, note_id):
    conn = get_connection()
    cursor = conn.cursor()
    # update download/view count on note
    cursor.execute("UPDATE notes SET download_count = download_count + 1 WHERE id = ?", (note_id,))
    if user_id:
        cursor.execute("INSERT INTO recently_viewed (user_id, note_id) VALUES (?, ?)", (user_id, note_id))
    conn.commit()
    conn.close()

def get_recently_viewed(user_id, limit=5):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT DISTINCT n.*, sub.name as subject_name, sub.code as subject_code, sem.number as semester_number, rv.viewed_at
    FROM recently_viewed rv
    JOIN notes n ON rv.note_id = n.id
    JOIN subjects sub ON n.subject_id = sub.id
    JOIN semesters sem ON sub.semester_id = sem.id
    WHERE rv.user_id = ?
    ORDER BY rv.viewed_at DESC
    LIMIT ?
    """, (user_id, limit))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_student_dashboard_data(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, full_name, email, college, course, branch, semester, role FROM users WHERE id = ?", (user_id,))
    user = dict(cursor.fetchone())
    conn.close()
    
    bookmarks = get_user_bookmarks(user_id)
    recent = get_recently_viewed(user_id, limit=6)
    updates = get_all_updates(only_published=True)[:4]
    latest_pyqs = get_all_pyqs(semester_id=user["semester"], only_published=True)[:4]
    
    return {
        "user": user,
        "bookmarks": bookmarks,
        "recent_notes": recent,
        "latest_updates": updates,
        "recent_papers": latest_pyqs
    }

# ----------------- Global Search -----------------

def global_search(term):
    if not term or len(term.strip()) < 2:
        return {"notes": [], "subjects": [], "pyqs": [], "syllabus": [], "updates": []}
    
    term_pattern = f"%{term.strip()}%"
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Subjects
    cursor.execute("""
    SELECT sub.*, sem.number as semester_number
    FROM subjects sub
    JOIN semesters sem ON sub.semester_id = sem.id
    WHERE sub.name LIKE ? OR sub.code LIKE ? OR sub.description LIKE ?
    LIMIT 6
    """, (term_pattern, term_pattern, term_pattern))
    subjects = [dict(r) for r in cursor.fetchall()]
    
    # 2. Notes
    cursor.execute("""
    SELECT n.*, sub.name as subject_name, sub.code as subject_code, sem.number as semester_number
    FROM notes n
    JOIN subjects sub ON n.subject_id = sub.id
    JOIN semesters sem ON sub.semester_id = sem.id
    WHERE n.is_published = 1 AND (n.title LIKE ? OR n.description LIKE ? OR sub.name LIKE ?)
    LIMIT 8
    """, (term_pattern, term_pattern, term_pattern))
    notes = [dict(r) for r in cursor.fetchall()]
    
    # 3. PYQs
    cursor.execute("""
    SELECT p.*, sub.name as subject_name, sub.code as subject_code, sem.number as semester_number
    FROM pyqs p
    JOIN subjects sub ON p.subject_id = sub.id
    JOIN semesters sem ON p.semester_id = sem.id
    WHERE p.is_published = 1 AND (p.paper_title LIKE ? OR sub.name LIKE ? OR CAST(p.exam_year AS TEXT) LIKE ?)
    LIMIT 6
    """, (term_pattern, term_pattern, term_pattern))
    pyqs = [dict(r) for r in cursor.fetchall()]
    
    # 4. Syllabus
    cursor.execute("""
    SELECT syl.*, sub.name as subject_name, sub.code as subject_code, sem.number as semester_number
    FROM syllabus syl
    JOIN semesters sem ON syl.semester_id = sem.id
    LEFT JOIN subjects sub ON syl.subject_id = sub.id
    WHERE syl.is_published = 1 AND (syl.title LIKE ? OR syl.description LIKE ? OR sub.name LIKE ?)
    LIMIT 5
    """, (term_pattern, term_pattern, term_pattern))
    syllabus = [dict(r) for r in cursor.fetchall()]
    
    # 5. Updates
    cursor.execute("""
    SELECT * FROM daily_updates
    WHERE is_published = 1 AND (title LIKE ? OR short_description LIKE ? OR full_details LIKE ?)
    LIMIT 5
    """, (term_pattern, term_pattern, term_pattern))
    updates = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    return {
        "subjects": subjects,
        "notes": notes,
        "pyqs": pyqs,
        "syllabus": syllabus,
        "updates": updates
    }

# ----------------- Admin Statistics & Uploads -----------------

def get_admin_stats():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'STUDENT'")
    total_students = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM subjects")
    total_subjects = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM notes")
    total_notes = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM pyqs")
    total_pyqs = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM syllabus")
    total_syllabus = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM daily_updates")
    total_updates = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM uploaded_files")
    total_pdfs = cursor.fetchone()[0]

    # Recent Registrations
    cursor.execute("""
    SELECT id, full_name, email, branch, semester, created_at, is_active
    FROM users WHERE role = 'STUDENT'
    ORDER BY created_at DESC LIMIT 5
    """)
    recent_students = [dict(r) for r in cursor.fetchall()]

    # Recent Uploads
    cursor.execute("""
    SELECT id, file_name, original_name, file_size, category, semester, subject, uploaded_at
    FROM uploaded_files
    ORDER BY uploaded_at DESC LIMIT 6
    """)
    recent_uploads = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {
        "total_students": total_students,
        "total_subjects": total_subjects,
        "total_notes": total_notes,
        "total_pyqs": total_pyqs,
        "total_syllabus": total_syllabus,
        "total_updates": total_updates,
        "total_pdfs": total_pdfs or (total_notes + total_pyqs + total_syllabus),
        "recent_students": recent_students,
        "recent_uploads": recent_uploads
    }

def record_uploaded_file(file_name, original_name, file_path, file_size, mime_type, category='', semester=None, subject=''):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO uploaded_files (file_name, original_name, file_path, file_size, mime_type, category, semester, subject)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (file_name, original_name, file_path, file_size, mime_type, category, semester, subject))
    file_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return file_id

def get_all_uploaded_files():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM uploaded_files ORDER BY uploaded_at DESC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def delete_uploaded_file(file_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM uploaded_files WHERE id = ?", (file_id,))
    row = cursor.fetchone()
    if row and os.path.exists(row["file_path"]):
        try:
            os.remove(row["file_path"])
        except Exception:
            pass
    cursor.execute("DELETE FROM uploaded_files WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
    return True
