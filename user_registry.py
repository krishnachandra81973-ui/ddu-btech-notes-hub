import os
import json
import time
from datetime import datetime, timedelta, timezone
import base64
import hmac
import hashlib
import secrets
import shutil
import urllib.request
import urllib.parse
import re
import threading

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_REGISTRY = os.path.join(BASE_DIR, "students_registry.json")
STATIC_REGISTRY = os.path.join(BASE_DIR, "static", "students_registry.json")
STATIC_UPLOADS_REGISTRY = os.path.join(BASE_DIR, "static", "uploads", "students_registry.json")
STATIC_NOTES_REGISTRY = os.path.join(BASE_DIR, "static", "uploads", "notes", "students_registry.json")
API_REGISTRY = os.path.join(BASE_DIR, "api", "students_registry.json")
TMP_REGISTRY = "/tmp/students_registry.json"

DELETED_USERS_REPO = os.path.join(BASE_DIR, "deleted_users_registry.json")
DELETED_USERS_STATIC = os.path.join(BASE_DIR, "static", "deleted_users_registry.json")
DELETED_USERS_STATIC_NOTES = os.path.join(BASE_DIR, "static", "uploads", "notes", "deleted_users_registry.json")
DELETED_USERS_STATIC_UPLOADS = os.path.join(BASE_DIR, "static", "uploads", "deleted_users_registry.json")
DELETED_USERS_API = os.path.join(BASE_DIR, "api", "deleted_users_registry.json")
DELETED_USERS_TMP = "/tmp/deleted_users_registry.json"

SECRET_KEY = os.environ.get("DDU_PORTAL_SECRET", "ddu_btech_portal_secure_jwt_2026_xyz98124_prod")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@ddunotes.ac.in")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_USER = {
    "id": 5,
    "full_name": "Keshav Narayan (Admin)",
    "email": ADMIN_EMAIL,
    "password_hash": "8f10cc9ec6c3a1b02e9b46885aad4435346b3f6b9804531ccd3385021919c4b4",
    "salt": "0ea5e59b2dff03cc695ac58826e2d855",
    "college": "Deen Dayal Upadhyaya Gorakhpur University",
    "course": "B.Tech",
    "branch": "CSE",
    "semester": 1,
    "role": "ADMIN",
    "is_active": 1,
    "created_at": "2026-09-26 16:58:15"
}

FAKE_EMAILS = {"student@ddu.ac.in", "priya.sharma@ddu.ac.in"}

# Google Cloud Firestore REST API Endpoint (Global multi-instance persistence for Vercel)
FIRESTORE_PROJECT = "keshav-ai-education"
FIRESTORE_COLLECTION_URL = f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT}/databases/(default)/documents/ddu_students"

def get_ist_now_str():
    """Returns current date and time formatted in Indian Standard Time (IST, UTC+5:30)"""
    utc_now = datetime.now(timezone.utc)
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    ist_now = utc_now.astimezone(ist_tz)
    return ist_now.strftime("%Y-%m-%d %I:%M:%S %p (IST)")

def email_to_doc_id(email):
    """Generates a safe document ID from an email address for Firestore"""
    clean = email.lower().strip()
    return re.sub(r'[^a-zA-Z0-9_]', '_', clean)

def _get_derived_keys(secret_str):
    k_enc = hashlib.sha256((secret_str + ":enc:ddu_2026").encode("utf-8")).digest()
    k_mac = hashlib.sha256((secret_str + ":mac:ddu_2026").encode("utf-8")).digest()
    return k_enc, k_mac

def encrypt_sensitive_string(plain_text):
    """
    Encrypts sensitive data (passwords) using authenticated symmetric encryption:
    16-byte random IV + HMAC-SHA256 MAC tag + CTR PRF keystream ciphertext.
    Resulting ciphertext is indistinguishable from random bytes.
    """
    if not plain_text:
        return ""
    s_plain = str(plain_text)
    if s_plain.startswith("enc_v1:"):
        return s_plain
    k_enc, k_mac = _get_derived_keys(SECRET_KEY)
    raw = s_plain.encode("utf-8")
    iv = secrets.token_bytes(16)
    keystream = b""
    block_num = 0
    while len(keystream) < len(raw):
        keystream += hashlib.sha256(k_enc + iv + block_num.to_bytes(4, "big")).digest()
        block_num += 1
    ciphertext = bytes(b ^ k for b, k in zip(raw, keystream[:len(raw)]))
    tag = hmac.new(k_mac, iv + ciphertext, hashlib.sha256).digest()[:16]
    blob = iv + tag + ciphertext
    return "enc_v1:" + base64.urlsafe_b64encode(blob).decode("utf-8").rstrip("=")

def decrypt_sensitive_string(cipher_text):
    """
    Decrypts authenticated ciphertext. Returns original plaintext if MAC matches,
    or handles legacy plaintext strings seamlessly.
    """
    if not cipher_text:
        return ""
    s_cipher = str(cipher_text)
    if not s_cipher.startswith("enc_v1:"):
        return s_cipher
    try:
        raw_b64 = s_cipher[7:]
        rem = len(raw_b64) % 4
        if rem > 0:
            raw_b64 += "=" * (4 - rem)
        blob = base64.urlsafe_b64decode(raw_b64.encode("utf-8"))
        if len(blob) < 32:
            return s_cipher
        iv = blob[:16]
        tag = blob[16:32]
        ciphertext = blob[32:]
        k_enc, k_mac = _get_derived_keys(SECRET_KEY)
        expected_tag = hmac.new(k_mac, iv + ciphertext, hashlib.sha256).digest()[:16]
        if not secrets.compare_digest(tag, expected_tag):
            return "[Encrypted - Tampered/Invalid Key]"
        keystream = b""
        block_num = 0
        while len(keystream) < len(ciphertext):
            keystream += hashlib.sha256(k_enc + iv + block_num.to_bytes(4, "big")).digest()
            block_num += 1
        plain = bytes(b ^ k for b, k in zip(ciphertext, keystream[:len(ciphertext)]))
        return plain.decode("utf-8")
    except Exception:
        return s_cipher

def user_dict_to_firestore(u):
    """Converts a standard user dict to Firestore document schema, omitting sensitive passwords"""
    fields = {}
    for k, v in u.items():
        if v is None or k == "plain_password":
            continue
        if isinstance(v, bool):
            fields[k] = {"booleanValue": v}
        elif isinstance(v, int):
            fields[k] = {"integerValue": str(v)}
        elif isinstance(v, float):
            fields[k] = {"doubleValue": v}
        else:
            fields[k] = {"stringValue": str(v)}
    return {"fields": fields}

def firestore_doc_to_user_dict(doc):
    """Converts a Firestore document schema back to standard user dict"""
    fields = doc.get("fields", {})
    user = {}
    for k, fval in fields.items():
        if k == "plain_password":
            continue
        if "stringValue" in fval:
            user[k] = fval["stringValue"]
        elif "integerValue" in fval:
            try:
                user[k] = int(fval["integerValue"])
            except Exception:
                user[k] = fval["integerValue"]
        elif "booleanValue" in fval:
            user[k] = fval["booleanValue"]
        elif "doubleValue" in fval:
            user[k] = fval["doubleValue"]

    user.pop("plain_password", None)
    return user

# ----------------- Firestore REST Operations -----------------

def fetch_firestore_students():
    """Fetches all registered students from Cloud Firestore"""
    try:
        url = f"{FIRESTORE_COLLECTION_URL}?pageSize=300"
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            users = []
            for doc in docs:
                u = firestore_doc_to_user_dict(doc)
                if u.get("email"):
                    users.append(u)
            return users
    except Exception as e:
        return []

def save_firestore_student(user_dict):
    """Saves or updates a student in Cloud Firestore via REST API"""
    email = user_dict.get("email", "").lower().strip()
    if not email or email in FAKE_EMAILS or email == ADMIN_EMAIL.lower():
        return False
    doc_id = email_to_doc_id(email)
    url = f"{FIRESTORE_COLLECTION_URL}/{doc_id}"
    try:
        payload = json.dumps(user_dict_to_firestore(user_dict)).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "DDU-Portal-Serverless"},
            method="PATCH"
        )
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        return False

def delete_firestore_student(email):
    """Deletes a student document from Cloud Firestore"""
    if not email:
        return False
    doc_id = email_to_doc_id(email)
    url = f"{FIRESTORE_COLLECTION_URL}/{doc_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"}, method="DELETE")
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False

# ----------------- Registry Operations -----------------

def get_registry_path():
    candidates = [
        TMP_REGISTRY,
        REPO_REGISTRY,
        STATIC_NOTES_REGISTRY,
        STATIC_UPLOADS_REGISTRY,
        STATIC_REGISTRY,
        API_REGISTRY
    ]
    for p in candidates:
        if os.path.exists(p) and os.path.getsize(p) > 50:
            return p
    return TMP_REGISTRY

# ----------------- Deleted Students Anti-Resurrection Registry -----------------

def load_local_deleted_users():
    """Loads all tombstone deleted student records across available paths"""
    candidates = [
        DELETED_USERS_TMP,
        DELETED_USERS_REPO,
        DELETED_USERS_STATIC_NOTES,
        DELETED_USERS_STATIC_UPLOADS,
        DELETED_USERS_STATIC,
        DELETED_USERS_API
    ]
    seen = {}
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict):
                                em = (item.get("email") or "").lower().strip()
                                uid = str(item.get("id") or "").strip()
                                key = em or uid
                                if key and key != "none" and key not in seen:
                                    seen[key] = {
                                        "id": uid if uid and uid != "None" else None,
                                        "email": em if em and "@" in em else None,
                                        "deleted_at": item.get("deleted_at") or time.strftime("%Y-%m-%d %H:%M:%S")
                                    }
                            elif isinstance(item, (int, str)):
                                key = str(item).lower().strip()
                                if key and key not in seen:
                                    seen[key] = {
                                        "id": key if key.isdigit() else None,
                                        "email": key if "@" in key else None,
                                        "deleted_at": time.strftime("%Y-%m-%d %H:%M:%S")
                                    }
            except Exception:
                pass
    return list(seen.values())

def get_deleted_user_identifiers():
    """Returns sets of (deleted_ids, deleted_emails) for fast in-memory filtering"""
    records = load_local_deleted_users()
    deleted_ids = set()
    deleted_emails = set()
    for r in records:
        uid = str(r.get("id") or "").strip()
        em = (r.get("email") or "").lower().strip()
        if uid and uid != "None":
            deleted_ids.add(uid)
        if em and "@" in em:
            deleted_emails.add(em)
    return deleted_ids, deleted_emails

def save_local_deleted_users(deleted_list):
    """Saves deleted student tombstones to all writable paths"""
    targets = [
        DELETED_USERS_TMP,
        DELETED_USERS_REPO,
        DELETED_USERS_STATIC_NOTES,
        DELETED_USERS_STATIC_UPLOADS,
        DELETED_USERS_STATIC,
        DELETED_USERS_API
    ]
    for target in targets:
        try:
            target_dir = os.path.dirname(target)
            if target_dir:
                os.makedirs(target_dir, exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                json.dump(deleted_list, f, indent=2)
        except Exception:
            pass

def unmark_deleted_user(user_id_or_email):
    """Allows a deleted student email or ID to re-register cleanly if desired"""
    if not user_id_or_email:
        return
    val = str(user_id_or_email).lower().strip()
    records = load_local_deleted_users()
    filtered = []
    for r in records:
        r_id = str(r.get("id") or "").strip()
        r_em = str(r.get("email") or "").lower().strip()
        if r_id == val or r_em == val:
            continue
        filtered.append(r)
    save_local_deleted_users(filtered)

def record_deleted_user(user_id=None, email=None):
    """
    Permanently records student as deleted across local JSON tombstones,
    purges student from active memory and JSON files, deletes from Firestore,
    and commits deleted_users_registry.json & students_registry.json to GitHub.
    """
    if not user_id and not email:
        return

    clean_id = str(user_id).strip() if user_id is not None and str(user_id).strip() not in ("None", "") else None
    clean_email = email.lower().strip() if email and "@" in email else None

    # Resolve missing ID or email from current registry
    if not clean_id or not clean_email:
        try:
            for u in load_registry(fetch_remote=False):
                u_id = str(u.get("id") or "").strip()
                u_em = (u.get("email") or "").lower().strip()
                if (clean_id and u_id == clean_id) or (clean_email and u_em == clean_email):
                    if not clean_email and u_em:
                        clean_email = u_em
                    if not clean_id and u_id:
                        clean_id = u_id
                    break
        except Exception:
            pass

    records = load_local_deleted_users()
    already_recorded = False
    for r in records:
        r_id = str(r.get("id") or "").strip()
        r_em = str(r.get("email") or "").lower().strip()
        if (clean_id and r_id == clean_id) or (clean_email and r_em == clean_email):
            already_recorded = True
            if clean_id and not r_id:
                r["id"] = clean_id
            if clean_email and not r_em:
                r["email"] = clean_email
            break

    if not already_recorded:
        records.append({
            "id": clean_id,
            "email": clean_email,
            "deleted_at": time.strftime("%Y-%m-%d %H:%M:%S")
        })

    save_local_deleted_users(records)

    # Immediately delete from local students_registry.json
    all_users = load_registry(fetch_remote=False)
    filtered = []
    for u in all_users:
        u_id = str(u.get("id") or "").strip()
        u_em = (u.get("email") or "").lower().strip()
        if (clean_id and u_id == clean_id) or (clean_email and u_em == clean_email):
            continue
        filtered.append(u)
    save_registry(filtered, sync_remote=False)

    # Delete from Firestore if email known
    if clean_email:
        try:
            delete_firestore_student(clean_email)
        except Exception:
            pass

    # Background sync to GitHub so Vercel gets persistent commit
    def _sync_bg():
        try:
            import cloud_storage
            del_bytes = json.dumps(records, indent=2).encode("utf-8")
            cloud_storage.commit_file_to_github(
                "deleted_users_registry.json",
                del_bytes,
                commit_message=f"Sync deleted users: user_id={clean_id} email={clean_email}"
            )
            cloud_storage.commit_file_to_github(
                "static/uploads/notes/deleted_users_registry.json",
                del_bytes,
                commit_message=f"Mirror sync deleted users: user_id={clean_id} email={clean_email}"
            )
            reg_bytes = json.dumps(filtered, indent=2).encode("utf-8")
            cloud_storage.commit_file_to_github(
                "students_registry.json",
                reg_bytes,
                commit_message=f"Update students registry after deletion of user_id={clean_id}"
            )
            cloud_storage.commit_file_to_github(
                "static/uploads/notes/students_registry.json",
                reg_bytes,
                commit_message=f"Mirror update students registry after deletion of user_id={clean_id}"
            )
        except Exception as ge:
            print("[UserRegistry] GitHub commit notice:", ge)

    threading.Thread(target=_sync_bg, daemon=True).start()

def load_registry(fetch_remote=False):
    deleted_ids, deleted_emails = get_deleted_user_identifiers()
    candidates = [
        TMP_REGISTRY,
        STATIC_NOTES_REGISTRY,
        STATIC_UPLOADS_REGISTRY,
        STATIC_REGISTRY,
        REPO_REGISTRY,
        API_REGISTRY,
        os.path.join(os.path.dirname(BASE_DIR), "students_registry.json")
    ]
    user_map = {}
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for u in data:
                            uid = str(u.get("id") or "").strip()
                            em = u.get("email", "").lower().strip()
                            if (uid and uid in deleted_ids) or (em and em in deleted_emails):
                                continue
                            if em and em not in FAKE_EMAILS:
                                u_clean = dict(u)
                                u_clean.pop("plain_password", None)
                                if em not in user_map:
                                    user_map[em] = u_clean
                                else:
                                    user_map[em].update({k: v for k, v in u_clean.items() if v is not None and v != ""})
            except Exception:
                pass

    # Ultimate fallback: If registry files were missing or only had admin, pull from SQLite users table
    if len([u for u in user_map.values() if u.get("role") != "ADMIN"]) == 0:
        try:
            import database
            conn = database.get_connection()
            cur = conn.cursor()
            cur.execute("""
            CREATE TABLE IF NOT EXISTS deleted_users (user_id INTEGER, email TEXT, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            """)
            cur.execute("""
            SELECT id, full_name, email, college, course, branch, semester, role, is_active, created_at 
            FROM users
            WHERE (id NOT IN (SELECT user_id FROM deleted_users WHERE user_id IS NOT NULL))
              AND (LOWER(email) NOT IN (SELECT LOWER(email) FROM deleted_users WHERE email IS NOT NULL))
            """)
            for r in cur.fetchall():
                em = r["email"].lower().strip()
                uid = str(r["id"])
                if (uid and uid in deleted_ids) or (em and em in deleted_emails):
                    continue
                if em and em not in FAKE_EMAILS and em not in user_map:
                    user_map[em] = dict(r)
            conn.close()
        except Exception:
            pass

    # Fetch from Cloud Firestore to sync all serverless instances
    if fetch_remote:
        try:
            remote_students = fetch_firestore_students()
            if remote_students and isinstance(remote_students, list) and len(remote_students) > 0:
                for rs in remote_students:
                    uid = str(rs.get("id") or "").strip()
                    em = rs.get("email", "").lower().strip()
                    if (uid and uid in deleted_ids) or (em and em in deleted_emails):
                        continue
                    if em and em not in FAKE_EMAILS:
                        if em in user_map:
                            user_map[em].update(rs)
                        else:
                            user_map[em] = rs
        except Exception:
            pass

    # Clean fake student accounts permanently and filter out any deleted
    users = [u for u in user_map.values() if u.get("email", "").lower().strip() not in FAKE_EMAILS and str(u.get("id") or "") not in deleted_ids and u.get("email", "").lower().strip() not in deleted_emails]

    # Ensure admin is always present
    has_admin = any(u.get("email", "").lower() == ADMIN_EMAIL.lower() for u in users)
    if not has_admin:
        users.insert(0, ADMIN_USER)

    # Warm-save to TMP_REGISTRY so subsequent calls in this container are instantaneous
    if len(users) > 0:
        try:
            with open(TMP_REGISTRY, "w", encoding="utf-8") as f:
                json.dump(users, f, indent=2)
        except Exception:
            pass

    return users

def save_registry(users, sync_remote=False):
    # Filter fake accounts before saving
    cleaned_users = [u for u in users if u.get("email", "").lower().strip() not in FAKE_EMAILS]
    # Ensure plain_password is NEVER written to disk
    disk_users = []
    for u in cleaned_users:
        du = dict(u)
        du.pop("plain_password", None)
        disk_users.append(du)

    targets = [
        TMP_REGISTRY,
        REPO_REGISTRY,
        STATIC_NOTES_REGISTRY,
        STATIC_UPLOADS_REGISTRY,
        STATIC_REGISTRY,
        API_REGISTRY
    ]
    for target in targets:
        try:
            target_dir = os.path.dirname(target)
            if target_dir:
                os.makedirs(target_dir, exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                json.dump(disk_users, f, indent=2)
        except Exception:
            pass

    if sync_remote:
        def _sync_bg():
            for u in cleaned_users:
                if u.get("role") != "ADMIN":
                    try:
                        save_firestore_student(u)
                    except Exception:
                        pass
            try:
                import cloud_storage
                content_bytes = json.dumps(disk_users, indent=2).encode("utf-8")
                cloud_storage.commit_file_to_github(
                    "students_registry.json",
                    content_bytes,
                    commit_message=f"Sync registered students: {len(disk_users)} accounts"
                )
                cloud_storage.commit_file_to_github(
                    "static/uploads/notes/students_registry.json",
                    content_bytes,
                    commit_message=f"Mirror sync students registry: {len(disk_users)} accounts"
                )
            except Exception:
                pass
        threading.Thread(target=_sync_bg, daemon=True).start()

def save_user_to_registry(user_dict, allow_update=True, sync_remote=True):
    email_clean = user_dict.get("email", "").lower().strip()
    if email_clean in FAKE_EMAILS:
        return None

    unmark_deleted_user(email_clean)
    if user_dict.get("id"):
        unmark_deleted_user(user_dict.get("id"))

    # Never store plain_password in memory or registry
    user_dict.pop("plain_password", None)

    users = load_registry(fetch_remote=False)
    updated = False
    for i, u in enumerate(users):
        if u.get("email", "").lower().strip() == email_clean:
            if not allow_update:
                return None  # Prevent duplicate overwrite
            users[i].update(user_dict)
            user_dict = users[i]
            updated = True
            break
    if not updated:
        if "id" not in user_dict or not user_dict["id"]:
            max_id = max([u.get("id", 0) for u in users if isinstance(u.get("id"), int)] or [100])
            user_dict["id"] = max_id + 1
        if "created_at" not in user_dict or not user_dict["created_at"]:
            user_dict["created_at"] = get_ist_now_str()
        if "is_active" not in user_dict:
            user_dict["is_active"] = 1
        users.append(user_dict)

    save_registry(users, sync_remote=False)

    # Sync to Cloud Firestore synchronously to prevent serverless container termination loss
    if sync_remote and user_dict.get("role") != "ADMIN":
        try:
            save_firestore_student(dict(user_dict))
        except Exception as e:
            print("[UserRegistry] Firestore sync error:", e)

    return user_dict

def find_user_in_registry(email, check_remote=True):
    if not email:
        return None
    email_clean = email.lower().strip()
    if email_clean in FAKE_EMAILS:
        return None

    if email_clean == ADMIN_EMAIL.lower():
        admin_copy = dict(ADMIN_USER)
        admin_copy.pop("plain_password", None)
        return admin_copy

    # Check local registry first (instant <0.5ms)
    users = load_registry(fetch_remote=False)
    for u in users:
        if u.get("email", "").lower().strip() == email_clean:
            u_clean = dict(u)
            u_clean.pop("plain_password", None)
            return u_clean

    if not check_remote:
        return None

    # Check remote Firestore directly when student is not in local memory/file
    try:
        doc_id = email_to_doc_id(email_clean)
        url = f"{FIRESTORE_COLLECTION_URL}/{doc_id}"
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            u = firestore_doc_to_user_dict(data)
            if u.get("email"):
                save_user_to_registry(u, allow_update=True, sync_remote=False)
                return u
    except Exception:
        pass

    return None

def update_password_in_registry(user_id_or_email, new_password):
    users = load_registry(fetch_remote=False)
    target_user = None
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", new_password.encode("utf-8"), salt.encode("utf-8"), 100000)
    hash_val = key.hex()

    for u in users:
        if str(u.get("id")) == str(user_id_or_email) or u.get("email", "").lower().strip() == str(user_id_or_email).lower().strip():
            u["password_hash"] = hash_val
            u["salt"] = salt
            u.pop("plain_password", None)
            target_user = u
            break
    if target_user:
        save_registry(users, sync_remote=False)
        if target_user.get("role") != "ADMIN":
            threading.Thread(target=save_firestore_student, args=(target_user,), daemon=True).start()
        return True
    return False

def toggle_active_in_registry(user_id):
    users = load_registry(fetch_remote=False)
    target_user = None
    new_active = 1
    for u in users:
        if str(u.get("id")) == str(user_id):
            u["is_active"] = 0 if u.get("is_active", 1) == 1 else 1
            new_active = u["is_active"]
            target_user = u
            break
    if target_user:
        save_registry(users, sync_remote=False)
        if target_user.get("role") != "ADMIN":
            threading.Thread(target=save_firestore_student, args=(target_user,), daemon=True).start()
        return new_active
    return 1

def delete_user_from_registry(user_id_or_email):
    raw = str(user_id_or_email or "").strip()
    clean_id = raw if raw.isdigit() else None
    clean_email = raw if "@" in raw else None
    record_deleted_user(user_id=clean_id, email=clean_email)
    return True

# ----------------- Cryptographic Auth Token Helpers -----------------

def generate_auth_token(user_dict):
    """
    Generates a secure, self-verifying HMAC token that works across
    all serverless Lambda instances without requiring database session lookups.
    """
    payload = {
        "id": user_dict.get("id"),
        "email": user_dict.get("email", "").lower().strip(),
        "role": user_dict.get("role", "STUDENT"),
        "full_name": user_dict.get("full_name", ""),
        "branch": user_dict.get("branch", "CSE"),
        "semester": user_dict.get("semester", 1),
        "college": user_dict.get("college", "Deen Dayal Upadhyaya Gorakhpur University"),
        "created_at": str(user_dict.get("created_at", "")),
        "ts": int(time.time()),
        "exp": int(time.time()) + (30 * 86400) # Valid 30 days
    }
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode('utf-8')).decode('utf-8').rstrip('=')
    sig = hmac.new(SECRET_KEY.encode('utf-8'), payload_b64.encode('utf-8'), hashlib.sha256).hexdigest()
    return f"ddu_jwt.{payload_b64}.{sig}"

def verify_auth_token(token_str):
    """
    Verifies HMAC signature and returns user payload if authentic.
    """
    if not token_str:
        return None
    token_str = token_str.strip()
    if token_str.startswith("Bearer "):
        token_str = token_str[7:].strip()

    # 1. Signed JWT Format
    if token_str.startswith("ddu_jwt."):
        try:
            parts = token_str[8:].split(".")
            if len(parts) != 2:
                return None
            payload_b64, sig = parts
            expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), payload_b64.encode('utf-8'), hashlib.sha256).hexdigest()
            if not secrets.compare_digest(sig, expected_sig):
                return None
            rem = len(payload_b64) % 4
            if rem > 0:
                payload_b64 += "=" * (4 - rem)
            payload_bytes = base64.urlsafe_b64decode(payload_b64.encode('utf-8'))
            payload = json.loads(payload_bytes.decode('utf-8'))
            if payload.get("exp") and time.time() > payload["exp"]:
                return None
            return payload
        except Exception:
            return None

    # Strictly require valid HMAC-SHA256 signature - reject all backdoors or unsigned tokens
    return None
