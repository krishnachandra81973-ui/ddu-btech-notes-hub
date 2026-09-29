import sqlite3
import os
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import user_registry
import notes_registry
import updates_registry

def _get_default_db_path():
    if os.environ.get("DB_PATH"):
        return os.environ.get("DB_PATH")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    seed_db = os.path.join(base_dir, "ddu_seed.db")
    orig = seed_db if os.path.exists(seed_db) else os.path.join(base_dir, "ddu_portal.db")
    tmp = "/tmp/ddu_portal.db"
    # If running on Vercel, AWS Lambda, or directory is read-only
    is_serverless = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or not os.access(base_dir, os.W_OK))
    if is_serverless:
        if (not os.path.exists(tmp) or os.path.getsize(tmp) == 0) and os.path.exists(orig):
            try:
                import shutil
                shutil.copy2(orig, tmp)
            except Exception:
                pass
        return tmp
    return orig

DB_PATH = _get_default_db_path()

def get_connection():
    global DB_PATH
    # Ensure database is initialized before connecting if file doesn't exist
    if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0:
        ensure_db_initialized()

    try:
        conn = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        try:
            if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
                conn.execute("PRAGMA journal_mode = MEMORY;")
            else:
                conn.execute("PRAGMA journal_mode = WAL;")
        except Exception:
            try:
                conn.execute("PRAGMA journal_mode = DELETE;")
            except Exception:
                pass

        return conn
    except sqlite3.OperationalError:
        # Fallback to /tmp/ddu_portal.db if original was on a read-only filesystem
        if DB_PATH != "/tmp/ddu_portal.db":
            DB_PATH = "/tmp/ddu_portal.db"
            ensure_db_initialized()
            conn = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON;")
            try:
                conn.execute("PRAGMA journal_mode = MEMORY;")
            except Exception:
                pass
            return conn
        raise

def ensure_db_initialized():
    """Initializes and seeds database if users table is missing or DB file is empty"""
    global DB_PATH
    needs_init = False
    if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0:
        needs_init = True
    else:
        try:
            conn = sqlite3.connect(DB_PATH, timeout=10.0)
            cur = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users';")
            if not cur.fetchone():
                needs_init = True
            conn.close()
        except Exception:
            needs_init = True

    if needs_init:
        # Check writability of target directory
        target_dir = os.path.dirname(os.path.abspath(DB_PATH))
        if target_dir and not os.access(target_dir, os.W_OK):
            DB_PATH = "/tmp/ddu_portal.db"
        try:
            init_db()
            import seed_data
            seed_data.seed()
        except Exception:
            if DB_PATH != "/tmp/ddu_portal.db":
                DB_PATH = "/tmp/ddu_portal.db"
                try:
                    init_db()
                    import seed_data
                    seed_data.seed()
                except Exception:
                    pass

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
    conn = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
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

    # 1b. Password Resets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used INTEGER DEFAULT 0,
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
        is_verified INTEGER DEFAULT 1,
        status TEXT DEFAULT 'APPROVED', -- 'PENDING', 'APPROVED', 'REJECTED'
        contributed_by_id INTEGER DEFAULT NULL,
        contributed_by_name TEXT DEFAULT NULL,
        contributed_by_email TEXT DEFAULT NULL,
        download_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
        FOREIGN KEY (contributed_by_id) REFERENCES users(id) ON DELETE SET NULL
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
        duration_days INTEGER DEFAULT 0, -- 0 means Permanent / No Expiry, or e.g. 7, 15, 30, 60
        expires_at DATE DEFAULT NULL,
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
    ensure_db_schema()

def ensure_db_schema():
    conn = get_connection()
    cursor = conn.cursor()
    # Create password_resets if missing
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)
        conn.commit()
    except Exception:
        pass

    try:
        cursor.execute("CREATE TABLE IF NOT EXISTS deleted_notes (note_id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP);")
        conn.commit()
    except Exception:
        pass

    # Sync admin credentials with user_registry.ADMIN_USER
    try:
        cursor.execute("""
            UPDATE users
            SET password_hash = ?, salt = ?
            WHERE email = ? OR role = 'ADMIN'
        """, (user_registry.ADMIN_USER["password_hash"], user_registry.ADMIN_USER["salt"], user_registry.ADMIN_EMAIL.lower()))
        conn.commit()
    except Exception:
        pass

    # Purge plain_password column from existing databases
    try:
        cursor.execute("ALTER TABLE users DROP COLUMN plain_password;")
        conn.commit()
    except Exception:
        try:
            cursor.execute("UPDATE users SET plain_password = NULL;")
            conn.commit()
        except Exception:
            pass

    for col, col_type in [
        ("is_verified", "INTEGER DEFAULT 1"),
        ("status", "TEXT DEFAULT 'APPROVED'"),
        ("contributed_by_id", "INTEGER DEFAULT NULL"),
        ("contributed_by_name", "TEXT DEFAULT NULL"),
        ("contributed_by_email", "TEXT DEFAULT NULL")
    ]:
        try:
            cursor.execute(f"ALTER TABLE notes ADD COLUMN {col} {col_type};")
            conn.commit()
        except Exception:
            pass

    for col, col_type in [
        ("duration_days", "INTEGER DEFAULT 0"),
        ("expires_at", "DATE DEFAULT NULL")
    ]:
        try:
            cursor.execute(f"ALTER TABLE daily_updates ADD COLUMN {col} {col_type};")
            conn.commit()
        except Exception:
            pass

    try:
        cursor.execute("ALTER TABLE syllabus ADD COLUMN branch TEXT DEFAULT 'All Branches';")
        conn.commit()
    except Exception:
        pass

    try:
        # Ensure any leftover dummy accounts are removed
        cursor.execute("DELETE FROM users WHERE email IN ('student@ddu.ac.in', 'priya.sharma@ddu.ac.in');")
        conn.commit()
    except Exception:
        pass
    conn.close()

try:
    ensure_db_initialized()
    ensure_db_schema()
except Exception:
    pass

# ----------------- Auth & User Queries -----------------

def get_ist_now_str():
    """Returns current date and time formatted in Indian Standard Time (IST, UTC+5:30)"""
    utc_now = datetime.now(timezone.utc)
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    ist_now = utc_now.astimezone(ist_tz)
    return ist_now.strftime("%Y-%m-%d %I:%M:%S %p (IST)")

def get_user_by_email(email):
    if not email:
        return None
    email_clean = email.lower().strip()
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (email_clean,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return dict(row)
    except Exception:
        pass
    reg_user = user_registry.find_user_in_registry(email_clean)
    if reg_user:
        return reg_user
    return None

def create_user(full_name, email, password, college="Deen Dayal Upadhyaya Gorakhpur University",
                course="B.Tech", branch="CSE", semester=1, role="STUDENT"):
    email_clean = email.lower().strip()

    # 1. Reject duplicate email immediately (cannot sign up twice)
    if user_registry.find_user_in_registry(email_clean) or get_user_by_email(email_clean):
        return None

    conn = get_connection()
    cursor = conn.cursor()
    hash_val, salt = hash_password(password)
    user_id = None
    ist_time = get_ist_now_str()
    try:
        cursor.execute("""
        INSERT INTO users (full_name, email, password_hash, salt, college, course, branch, semester, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (full_name, email_clean, hash_val, salt, college, course, branch, semester, role, ist_time))
        user_id = cursor.lastrowid
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return None
    finally:
        try:
            conn.close()
        except Exception:
            pass

    # Always persist in multi-instance registry with allow_update=False (hash & salt only, NO plain password)
    user_record = {
        "id": user_id or int(datetime.now().timestamp()),
        "full_name": full_name,
        "email": email_clean,
        "password_hash": hash_val,
        "salt": salt,
        "college": college,
        "course": course,
        "branch": branch,
        "semester": semester,
        "role": role,
        "is_active": 1,
        "created_at": ist_time
    }
    user_registry.save_user_to_registry(user_record, allow_update=False)
    return user_id

def authenticate_user(email, password):
    email_clean = email.lower().strip()
    
    # 1. Check Administrator credentials with Registry & Environment overrides
    if email_clean == user_registry.ADMIN_EMAIL.lower():
        adm = user_registry.ADMIN_USER
        env_admin_pw = os.environ.get("ADMIN_PASSWORD")
        is_valid = False
        if env_admin_pw and secrets.compare_digest(password, env_admin_pw):
            is_valid = True
        elif verify_password(password, adm["password_hash"], adm["salt"]):
            is_valid = True

        if is_valid:
            adm_id = adm.get("id", 5)
            try:
                conn_adm = get_connection()
                cur_adm = conn_adm.cursor()
                cur_adm.execute("SELECT id FROM users WHERE email = ?", (email_clean,))
                row_adm = cur_adm.fetchone()
                if row_adm:
                    adm_id = row_adm["id"]
                    cur_adm.execute("""
                        UPDATE users SET password_hash = ?, salt = ?, role = 'ADMIN', is_active = 1
                        WHERE id = ?
                    """, (adm["password_hash"], adm["salt"], adm_id))
                else:
                    cur_adm.execute("""
                        INSERT INTO users (id, full_name, email, password_hash, salt, role, is_active)
                        VALUES (?, ?, ?, ?, ?, 'ADMIN', 1)
                    """, (adm_id, adm["full_name"], email_clean, adm["password_hash"], adm["salt"]))
                conn_adm.commit()
                conn_adm.close()
            except Exception:
                pass
            res_adm = {k: v for k, v in adm.items() if k not in ("password_hash", "salt", "plain_password")}
            res_adm["id"] = adm_id
            res_adm["role"] = "ADMIN"
            return res_adm
        return None

    # 3. Fallback to Registry if container lacks SQLite row (Serverless cold-start sync)
    reg_user = user_registry.find_user_in_registry(email_clean)
    if reg_user:
        if not reg_user.get("is_active", 1):
            return "INACTIVE"
        reg_hash = reg_user.get("password_hash")
        reg_salt = reg_user.get("salt")
        if reg_hash and reg_salt and verify_password(password, reg_hash, reg_salt):
            # Sync user into this container's SQLite
            try:
                conn_sync = get_connection()
                cur_sync = conn_sync.cursor()
                cur_sync.execute("""
                INSERT OR REPLACE INTO users (id, full_name, email, password_hash, salt, college, course, branch, semester, role, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    reg_user.get("id"),
                    reg_user.get("full_name"),
                    email_clean,
                    reg_hash,
                    reg_salt,
                    reg_user.get("college", "Deen Dayal Upadhyaya Gorakhpur University"),
                    reg_user.get("course", "B.Tech"),
                    reg_user.get("branch", "CSE"),
                    reg_user.get("semester", 1),
                    reg_user.get("role", "STUDENT"),
                    reg_user.get("is_active", 1)
                ))
                conn_sync.commit()
                conn_sync.close()
            except Exception:
                pass
            clean_reg = dict(reg_user)
            clean_reg.pop("password_hash", None)
            clean_reg.pop("salt", None)
            clean_reg.pop("plain_password", None)
            return clean_reg

    return None

def create_user_session(user_id, days=30):
    user = None
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        user = dict(row)
    else:
        for u in user_registry.load_registry():
            if str(u.get("id")) == str(user_id):
                user = u
                break
    if not user:
        user = {"id": user_id, "email": f"student_{user_id}@ddunotes.ac.in", "role": "STUDENT", "full_name": "Student"}
    
    # Generate cryptographic stateless token
    token = user_registry.generate_auth_token(user)
    
    # Also record in sessions table for backwards compatibility
    try:
        expires_at = datetime.utcnow() + timedelta(days=days)
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
                       (user_id, token, expires_at.isoformat()))
        conn.commit()
        conn.close()
    except Exception:
        pass

    return token

def get_user_from_token(token):
    if not token:
        return None
    
    # 1. Stateless Cryptographic Verification
    verified = user_registry.verify_auth_token(token)
    if verified:
        return verified

    # 2. Database Session Lookup Fallback
    try:
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
        if row:
            exp = datetime.fromisoformat(row["expires_at"])
            if datetime.utcnow() <= exp and row["is_active"]:
                return dict(row)
    except Exception:
        pass

    return None

def delete_user_session(token):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    except Exception:
        pass

def get_all_users(search=""):
    # 1. Fetch from Database
    db_users = {}
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        SELECT id, full_name, email, college, course, branch, semester, role, is_active, created_at
        FROM users
        """)
        for r in cursor.fetchall():
            row_dict = dict(r)
            row_dict.pop("password_hash", None)
            row_dict.pop("salt", None)
            row_dict.pop("plain_password", None)
            db_users[r["email"].lower().strip()] = row_dict
        conn.close()
    except Exception:
        pass

    # 2. Fetch from Persistent Registry
    reg_users = user_registry.load_registry()
    combined = {}
    for ru in reg_users:
        em = ru.get("email", "").lower().strip()
        if em:
            clean_ru = dict(ru)
            clean_ru.pop("password_hash", None)
            clean_ru.pop("salt", None)
            clean_ru.pop("plain_password", None)
            combined[em] = clean_ru

    # Filter out any legacy fake accounts from database
    db_users = {em: du for em, du in db_users.items() if em not in user_registry.FAKE_EMAILS}

    # Merge database users into combined
    for em, du in db_users.items():
        if em in combined:
            combined[em].update({k: v for k, v in du.items() if v is not None and v != "" and k not in ("password_hash", "salt", "plain_password")})
        elif du.get("role") == "ADMIN":
            clean_admin = dict(du)
            clean_admin.pop("password_hash", None)
            clean_admin.pop("salt", None)
            clean_admin.pop("plain_password", None)
            combined[em] = clean_admin

    # Ensure admin is always present
    if user_registry.ADMIN_EMAIL.lower() not in combined:
        clean_adm = dict(user_registry.ADMIN_USER)
        clean_adm.pop("password_hash", None)
        clean_adm.pop("salt", None)
        clean_adm.pop("plain_password", None)
        combined[user_registry.ADMIN_EMAIL.lower()] = clean_adm

    all_list = list(combined.values())

    # Filter by search
    if search:
        s = search.lower().strip()
        all_list = [
            u for u in all_list
            if s in u.get("full_name", "").lower()
            or s in u.get("email", "").lower()
            or s in u.get("branch", "").lower()
        ]

    # Sort: Students first or newest first
    all_list.sort(key=lambda u: (u.get("role") != "ADMIN", str(u.get("created_at", ""))), reverse=True)
    return all_list

def toggle_user_active(user_id):
    new_state = user_registry.toggle_active_in_registry(user_id)
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_active = ? WHERE id = ?", (new_state, user_id))
        conn.commit()
        conn.close()
    except Exception:
        pass
    return new_state

def delete_user(user_id):
    user_email = None
    for u in user_registry.load_registry(fetch_remote=False):
        if str(u.get("id")) == str(user_id) or str(u.get("email")).lower() == str(user_id).lower():
            user_email = u.get("email", "").lower().strip()
            break
    user_registry.delete_user_from_registry(user_id)
    try:
        conn = get_connection()
        cursor = conn.cursor()
        if user_email:
            cursor.execute("DELETE FROM users WHERE id = ? OR LOWER(email) = ?", (user_id, user_email))
        else:
            cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()
    except Exception:
        pass
    return True

def update_user_password(user_id, new_password):
    user_registry.update_password_in_registry(user_id, new_password)
    try:
        conn = get_connection()
        cursor = conn.cursor()
        hash_val, salt = hash_password(new_password)
        cursor.execute("""
        UPDATE users SET password_hash = ?, salt = ? WHERE id = ?
        """, (hash_val, salt, user_id))
        # Invalidate old sessions for this user on password change
        cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
    except Exception:
        pass
    return True

def create_password_reset_token(email):
    """
    Generates a secure 32-byte hex token for password reset with a 15-minute expiry.
    Returns the token string if user exists, or None.
    """
    email_clean = email.lower().strip()
    user = get_user_by_email(email_clean)
    if not user:
        reg_user = user_registry.find_user_in_registry(email_clean)
        if not reg_user:
            return None
    
    token = secrets.token_hex(24)
    expires_at = (datetime.utcnow() + timedelta(minutes=15)).isoformat()
    try:
        conn = get_connection()
        cursor = conn.cursor()
        # Invalidate existing unused tokens for this email
        cursor.execute("UPDATE password_resets SET used = 1 WHERE email = ?", (email_clean,))
        cursor.execute("""
        INSERT INTO password_resets (email, token, expires_at, used)
        VALUES (?, ?, ?, 0)
        """, (email_clean, token, expires_at))
        conn.commit()
        conn.close()
        return token
    except Exception:
        return token

def verify_and_use_reset_token(token, new_password):
    """
    Verifies that the reset token is valid, unexpired, and unused,
    then updates the user's password using PBKDF2 hashing.
    """
    if not token or not new_password or len(new_password) < 6:
        return False, "Password must be at least 6 characters."

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, email, expires_at, used FROM password_resets WHERE token = ?
    """, (token.strip(),))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return False, "Invalid or expired password reset link."

    if row["used"]:
        conn.close()
        return False, "This reset link has already been used."

    try:
        expires_at = datetime.fromisoformat(row["expires_at"])
        if datetime.utcnow() > expires_at:
            conn.close()
            return False, "Reset link has expired. Please request a new one."
    except Exception:
        conn.close()
        return False, "Invalid reset token format."

    email = row["email"].lower().strip()
    cursor.execute("UPDATE password_resets SET used = 1 WHERE token = ?", (token.strip(),))
    conn.commit()
    conn.close()

    # Find user ID
    user = get_user_by_email(email)
    user_id = user["id"] if user else None
    if not user_id:
        reg_u = user_registry.find_user_in_registry(email)
        if reg_u:
            user_id = reg_u.get("id")

    if user_id:
        update_user_password(user_id, new_password)
    else:
        user_registry.update_password_in_registry(email, new_password)

    return True, "Password has been successfully updated. You can now login."

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

def get_notes(semester_id=None, subject_id=None, unit_number=None, branch=None, search=None, only_published=True, status=None, note_id=None):
    conn = get_connection()
    try:
        notes_registry.ensure_custom_notes_synced(conn)
    except Exception:
        pass
    cursor = conn.cursor()
    query = """
    SELECT n.*, sub.name as subject_name, sub.code as subject_code, sub.semester_id,
           sem.number as semester_number, u.unit_number, u.title as unit_title
    FROM notes n
    JOIN subjects sub ON n.subject_id = sub.id
    JOIN semesters sem ON sub.semester_id = sem.id
    LEFT JOIN units u ON n.unit_id = u.id
    WHERE 1=1 AND n.id NOT IN (SELECT note_id FROM deleted_notes)
    """
    params = []
    if note_id:
        query += " AND n.id = ?"
        params.append(note_id)
    if only_published:
        query += " AND n.is_published = 1 AND (n.is_verified = 1 OR n.is_verified IS NULL)"
    if status:
        query += " AND n.status = ?"
        params.append(status)
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
    actual_unit_id = None
    if unit_id:
        cursor.execute("SELECT id FROM units WHERE id = ? AND subject_id = ?", (unit_id, subject_id))
        row = cursor.fetchone()
        if row:
            actual_unit_id = row[0]
        else:
            cursor.execute("SELECT id FROM units WHERE subject_id = ? AND unit_number = ?", (subject_id, unit_id))
            row2 = cursor.fetchone()
            if row2:
                actual_unit_id = row2[0]
            else:
                cursor.execute("SELECT id FROM units WHERE subject_id = ? ORDER BY unit_number ASC LIMIT 1", (subject_id,))
                row3 = cursor.fetchone()
                if row3:
                    actual_unit_id = row3[0]

    cursor.execute("""
    INSERT INTO notes (subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (subject_id, actual_unit_id, title, description, file_url, file_name, file_size, is_important, is_published))
    note_id = cursor.lastrowid
    conn.commit()
    try:
        cursor.execute("SELECT * FROM notes WHERE id = ?", (note_id,))
        created_row = dict(cursor.fetchone())
        notes_registry.record_custom_note(created_row)
    except Exception:
        pass
    conn.close()
    return note_id

def update_note(note_id, subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published):
    conn = get_connection()
    cursor = conn.cursor()
    actual_unit_id = None
    if unit_id:
        cursor.execute("SELECT id FROM units WHERE id = ? AND subject_id = ?", (unit_id, subject_id))
        row = cursor.fetchone()
        if row:
            actual_unit_id = row[0]
        else:
            cursor.execute("SELECT id FROM units WHERE subject_id = ? AND unit_number = ?", (subject_id, unit_id))
            row2 = cursor.fetchone()
            if row2:
                actual_unit_id = row2[0]
            else:
                cursor.execute("SELECT id FROM units WHERE subject_id = ? ORDER BY unit_number ASC LIMIT 1", (subject_id,))
                row3 = cursor.fetchone()
                if row3:
                    actual_unit_id = row3[0]

    cursor.execute("""
    UPDATE notes
    SET subject_id = ?, unit_id = ?, title = ?, description = ?, file_url = ?, 
        file_name = ?, file_size = ?, is_important = ?, is_published = ?
    WHERE id = ?
    """, (subject_id, actual_unit_id, title, description, file_url, file_name, file_size, is_important, is_published, note_id))
    conn.commit()
    try:
        cursor.execute("SELECT * FROM notes WHERE id = ?", (note_id,))
        updated_row = dict(cursor.fetchone())
        notes_registry.record_custom_note(updated_row)
    except Exception:
        pass
    conn.close()
    return True

def delete_note(note_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS deleted_notes (note_id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
    cursor.execute("INSERT OR IGNORE INTO deleted_notes (note_id) VALUES (?)", (note_id,))
    cursor.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()

    # Update ddu_seed.db if accessible
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        seed_db = os.path.join(base_dir, "ddu_seed.db")
        if os.path.exists(seed_db) and os.access(seed_db, os.W_OK):
            sconn = sqlite3.connect(seed_db, timeout=5.0)
            scursor = sconn.cursor()
            scursor.execute("CREATE TABLE IF NOT EXISTS deleted_notes (note_id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
            scursor.execute("INSERT OR IGNORE INTO deleted_notes (note_id) VALUES (?)", (note_id,))
            scursor.execute("DELETE FROM notes WHERE id = ?", (note_id,))
            sconn.commit()
            sconn.close()
    except Exception:
        pass

    try:
        notes_registry.record_deleted_notes([note_id])
    except Exception as e:
        print("[Database] record_deleted_notes notice:", e)
    return True

def delete_notes_bulk(note_ids):
    """Deletes multiple notes in a single batch operation and ensures permanent removal."""
    if not note_ids:
        return 0
    clean_ids = [int(nid) for nid in note_ids if str(nid).isdigit()]
    if not clean_ids:
        return 0
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE IF NOT EXISTS deleted_notes (note_id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
        for nid in clean_ids:
            cursor.execute("INSERT OR IGNORE INTO deleted_notes (note_id) VALUES (?)", (nid,))
        placeholders = ",".join("?" for _ in clean_ids)
        cursor.execute(f"DELETE FROM notes WHERE id IN ({placeholders})", tuple(clean_ids))
        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()

        # Update ddu_seed.db if accessible
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            seed_db = os.path.join(base_dir, "ddu_seed.db")
            if os.path.exists(seed_db) and os.access(seed_db, os.W_OK):
                sconn = sqlite3.connect(seed_db, timeout=5.0)
                scursor = sconn.cursor()
                scursor.execute("CREATE TABLE IF NOT EXISTS deleted_notes (note_id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
                for nid in clean_ids:
                    scursor.execute("INSERT OR IGNORE INTO deleted_notes (note_id) VALUES (?)", (nid,))
                scursor.execute(f"DELETE FROM notes WHERE id IN ({placeholders})", tuple(clean_ids))
                sconn.commit()
                sconn.close()
        except Exception:
            pass

        try:
            notes_registry.record_deleted_notes(clean_ids)
        except Exception as e:
            print("[Database] record_deleted_notes notice:", e)

        return deleted_count
    except Exception as e:
        print("[Database] Error in delete_notes_bulk:", e)
        return 0

def create_student_note_submission(student_id, student_name, student_email, subject_id, unit_id, title, description, file_url, file_name, file_size):
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Validate subject
    cursor.execute("SELECT id FROM subjects WHERE id = ?", (subject_id,))
    if not cursor.fetchone():
        cursor.execute("SELECT id FROM subjects ORDER BY id ASC LIMIT 1")
        fallback_sub = cursor.fetchone()
        if fallback_sub:
            subject_id = fallback_sub[0]
        else:
            conn.close()
            return None

    # 2. Validate unit
    actual_unit_id = None
    if unit_id:
        cursor.execute("SELECT id FROM units WHERE id = ? AND subject_id = ?", (unit_id, subject_id))
        row = cursor.fetchone()
        if row:
            actual_unit_id = row[0]
        else:
            cursor.execute("SELECT id FROM units WHERE subject_id = ? AND unit_number = ?", (subject_id, unit_id))
            row2 = cursor.fetchone()
            if row2:
                actual_unit_id = row2[0]
            else:
                cursor.execute("SELECT id FROM units WHERE subject_id = ? ORDER BY unit_number ASC LIMIT 1", (subject_id,))
                row3 = cursor.fetchone()
                if row3:
                    actual_unit_id = row3[0]

    # 3. Validate student user foreign key
    valid_student_id = None
    if student_id:
        cursor.execute("SELECT id FROM users WHERE id = ?", (student_id,))
        if cursor.fetchone():
            valid_student_id = student_id

    cursor.execute("""
    INSERT INTO notes (
        subject_id, unit_id, title, description, file_url, file_name, file_size,
        is_important, is_published, is_verified, status, contributed_by_id, contributed_by_name, contributed_by_email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'PENDING', ?, ?, ?)
    """, (subject_id, actual_unit_id, title, description, file_url, file_name, file_size, valid_student_id, student_name, student_email))
    note_id = cursor.lastrowid
    conn.commit()
    try:
        cursor.execute("""
        SELECT n.*, sub.name as subject_name, sub.code as subject_code, sub.semester_id,
               sem.number as semester_number, u.unit_number, u.title as unit_title
        FROM notes n
        JOIN subjects sub ON n.subject_id = sub.id
        JOIN semesters sem ON sub.semester_id = sem.id
        LEFT JOIN units u ON n.unit_id = u.id
        WHERE n.id = ?
        """, (note_id,))
        created_row = dict(cursor.fetchone())
        notes_registry.record_custom_note(created_row)
    except Exception:
        pass
    conn.close()
    return note_id

def get_pending_notes():
    conn = get_connection()
    try:
        notes_registry.ensure_custom_notes_synced(conn)
    except Exception:
        pass
    cursor = conn.cursor()
    cursor.execute("""
    SELECT n.*, sub.name as subject_name, sub.code as subject_code, sub.semester_id,
           sem.number as semester_number, u.unit_number, u.title as unit_title
    FROM notes n
    JOIN subjects sub ON n.subject_id = sub.id
    JOIN semesters sem ON sub.semester_id = sem.id
    LEFT JOIN units u ON n.unit_id = u.id
    WHERE n.status = 'PENDING' OR (n.is_verified = 0 AND (n.status IS NULL OR n.status != 'REJECTED'))
    ORDER BY n.id DESC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_student_submissions(student_id):
    conn = get_connection()
    try:
        notes_registry.ensure_custom_notes_synced(conn)
    except Exception:
        pass
    cursor = conn.cursor()
    cursor.execute("""
    SELECT n.*, sub.name as subject_name, sub.code as subject_code, sub.semester_id,
           sem.number as semester_number, u.unit_number, u.title as unit_title
    FROM notes n
    JOIN subjects sub ON n.subject_id = sub.id
    JOIN semesters sem ON sub.semester_id = sem.id
    LEFT JOIN units u ON n.unit_id = u.id
    WHERE n.contributed_by_id = ?
    ORDER BY n.id DESC
    """, (student_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def verify_student_note(note_id, action="approve"):
    conn = get_connection()
    cursor = conn.cursor()
    if action == "approve":
        cursor.execute("""
        UPDATE notes
        SET is_verified = 1, is_published = 1, status = 'APPROVED'
        WHERE id = ?
        """, (note_id,))
    elif action == "reject":
        cursor.execute("""
        UPDATE notes
        SET is_verified = 0, is_published = 0, status = 'REJECTED'
        WHERE id = ?
        """, (note_id,))
    conn.commit()
    try:
        cursor.execute("""
        SELECT n.*, sub.name as subject_name, sub.code as subject_code, sub.semester_id,
               sem.number as semester_number, u.unit_number, u.title as unit_title
        FROM notes n
        JOIN subjects sub ON n.subject_id = sub.id
        JOIN semesters sem ON sub.semester_id = sem.id
        LEFT JOIN units u ON n.unit_id = u.id
        WHERE n.id = ?
        """, (note_id,))
        row = cursor.fetchone()
        if row:
            notes_registry.record_custom_note(dict(row))
    except Exception:
        pass
    conn.close()
    return True

# ----------------- Subject CRUD -----------------

def create_subject(semester_id, name, code, branch='All Branches', description=''):
    conn = get_connection()
    cursor = conn.cursor()
    try:
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
        return sub_id
    except sqlite3.IntegrityError:
        return None
    finally:
        try:
            conn.close()
        except Exception:
            pass

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

def get_all_syllabus(semester_id=None, subject_id=None, branch=None, only_published=True):
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
    if branch and branch != 'All Branches':
        query += " AND (sub.branch LIKE ? OR sub.branch = 'All Branches' OR syl.branch LIKE ? OR syl.branch = 'All Branches' OR syl.title LIKE ?)"
        branch_param = f"%{branch}%"
        params.extend([branch_param, branch_param, branch_param])
    query += " ORDER BY sem.number ASC, sub.name ASC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_syllabus(semester_id, subject_id, title, description, file_url, is_published=1, branch='All Branches'):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO syllabus (semester_id, subject_id, title, description, file_url, is_published, branch)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (semester_id, subject_id, title, description, file_url, is_published, branch))
    syl_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return syl_id

def update_syllabus(syl_id, semester_id, subject_id, title, description, file_url, is_published, branch='All Branches'):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE syllabus
    SET semester_id = ?, subject_id = ?, title = ?, description = ?, file_url = ?, is_published = ?, branch = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    """, (semester_id, subject_id, title, description, file_url, is_published, branch, syl_id))
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
    try:
        updates_registry.ensure_campus_updates_synced(conn)
    except Exception:
        pass
    cursor = conn.cursor()
    query = "SELECT * FROM daily_updates WHERE 1=1"
    params = []
    if only_published:
        query += " AND is_published = 1"
        # Hide notices that have an active expiry date which is strictly in the past
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        query += " AND (expires_at IS NULL OR expires_at = '' OR expires_at >= ?)"
        params.append(today_str)
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

def create_update(title, category, short_description, full_details, attachment_url, is_important=0, is_published=1, publish_date=None, duration_days=0):
    if not publish_date:
        publish_date = datetime.utcnow().strftime("%Y-%m-%d")
    
    expires_at = None
    try:
        duration_days = int(duration_days or 0)
        if duration_days > 0:
            p_dt = datetime.strptime(publish_date, "%Y-%m-%d")
            expires_at = (p_dt + timedelta(days=duration_days)).strftime("%Y-%m-%d")
    except Exception:
        duration_days = 0
        expires_at = None

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO daily_updates (title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date, duration_days, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date, duration_days, expires_at))
    up_id = cursor.lastrowid
    conn.commit()
    try:
        cursor.execute("SELECT * FROM daily_updates WHERE id = ?", (up_id,))
        created_row = dict(cursor.fetchone())
        updates_registry.record_custom_update(created_row)
    except Exception:
        pass
    conn.close()
    return up_id

def update_update(up_id, title, category, short_description, full_details, attachment_url, is_important=0, is_published=1, publish_date=None, duration_days=0):
    if not publish_date:
        publish_date = datetime.utcnow().strftime("%Y-%m-%d")
    
    expires_at = None
    try:
        duration_days = int(duration_days or 0)
        if duration_days > 0:
            p_dt = datetime.strptime(publish_date, "%Y-%m-%d")
            expires_at = (p_dt + timedelta(days=duration_days)).strftime("%Y-%m-%d")
    except Exception:
        duration_days = 0
        expires_at = None

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE daily_updates
    SET title = ?, category = ?, short_description = ?, full_details = ?, attachment_url = ?, 
        is_important = ?, is_published = ?, publish_date = ?, duration_days = ?, expires_at = ?
    WHERE id = ?
    """, (title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date, duration_days, expires_at, up_id))
    conn.commit()
    try:
        cursor.execute("SELECT * FROM daily_updates WHERE id = ?", (up_id,))
        updated_row = dict(cursor.fetchone())
        updates_registry.record_custom_update(updated_row)
    except Exception:
        pass
    conn.close()
    return True

def delete_update(up_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM daily_updates WHERE id = ?", (up_id,))
    conn.commit()
    conn.close()
    try:
        updates_registry.remove_custom_update(up_id)
    except Exception:
        pass
    return True

def get_update_by_id(up_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM daily_updates WHERE id = ?", (up_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

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
    user = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, full_name, email, college, course, branch, semester, role FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            user = dict(row)
    except Exception:
        pass

    if not user:
        for u in user_registry.load_registry(fetch_remote=False):
            if str(u.get("id")) == str(user_id):
                user = {k: v for k, v in u.items() if k not in ("password_hash", "salt", "plain_password")}
                break

    if not user:
        user = {"id": user_id, "full_name": "Student", "email": "", "semester": 1, "branch": "CSE", "role": "STUDENT"}
    
    bookmarks = get_user_bookmarks(user_id)
    recent = get_recently_viewed(user_id, limit=6)
    updates = get_all_updates(only_published=True)[:4]
    latest_pyqs = get_all_pyqs(semester_id=user.get("semester", 1), only_published=True)[:4]
    
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
    WHERE n.is_published = 1 AND n.id NOT IN (SELECT note_id FROM deleted_notes) AND (n.title LIKE ? OR n.description LIKE ? OR sub.name LIKE ?)
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
    
    # Accurate Student Metrics from merged database + persistent registry
    all_users = get_all_users()
    student_users = [u for u in all_users if u.get("role") != "ADMIN"]
    total_students = len(student_users)
    recent_students = student_users[:5]

    try:
        cursor.execute("SELECT COUNT(*) FROM subjects")
        total_subjects = cursor.fetchone()[0]
    except Exception:
        total_subjects = 0

    try:
        cursor.execute("SELECT COUNT(*) FROM notes WHERE id NOT IN (SELECT note_id FROM deleted_notes)")
        total_notes = cursor.fetchone()[0]
    except Exception:
        total_notes = 0

    try:
        cursor.execute("SELECT COUNT(*) FROM pyqs")
        total_pyqs = cursor.fetchone()[0]
    except Exception:
        total_pyqs = 0

    try:
        cursor.execute("SELECT COUNT(*) FROM syllabus")
        total_syllabus = cursor.fetchone()[0]
    except Exception:
        total_syllabus = 0

    try:
        cursor.execute("SELECT COUNT(*) FROM daily_updates")
        total_updates = cursor.fetchone()[0]
    except Exception:
        total_updates = 0

    try:
        cursor.execute("SELECT COUNT(*) FROM uploaded_files")
        total_pdfs = cursor.fetchone()[0]
    except Exception:
        total_pdfs = 0

    try:
        cursor.execute("SELECT COUNT(*) FROM notes WHERE status = 'PENDING' OR (is_verified = 0 AND (status IS NULL OR status != 'REJECTED'))")
        pending_notes_count = cursor.fetchone()[0]
    except Exception:
        pending_notes_count = 0

    # Recent Uploads
    recent_uploads = []
    try:
        cursor.execute("""
        SELECT id, file_name, original_name, file_size, category, semester, subject, uploaded_at
        FROM uploaded_files
        ORDER BY uploaded_at DESC LIMIT 6
        """)
        recent_uploads = [dict(r) for r in cursor.fetchall()]
    except Exception:
        pass

    conn.close()
    return {
        "total_students": total_students,
        "total_subjects": total_subjects,
        "total_notes": total_notes,
        "total_pyqs": total_pyqs,
        "total_syllabus": total_syllabus,
        "total_updates": total_updates,
        "total_pdfs": total_pdfs or (total_notes + total_pyqs + total_syllabus),
        "pending_notes_count": pending_notes_count,
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

def save_uploaded_blob(filename, data_bytes, mime_type="application/pdf"):
    """Persists uploaded file binary blob into SQLite so any container can serve it immediately."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS uploaded_blobs (
            filename TEXT PRIMARY KEY,
            data BLOB,
            mime_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        cursor.execute("""
        INSERT OR REPLACE INTO uploaded_blobs (filename, data, mime_type)
        VALUES (?, ?, ?)
        """, (filename, data_bytes, mime_type))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print("[Database] save_uploaded_blob error:", e)
        return False

def get_uploaded_blob(filename):
    """Retrieves binary blob from SQLite uploaded_blobs table."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='uploaded_blobs'")
        if not cursor.fetchone():
            conn.close()
            return None, None
        cursor.execute("SELECT data, mime_type FROM uploaded_blobs WHERE filename = ?", (filename,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return row["data"], row["mime_type"]
    except Exception:
        pass
    return None, None
