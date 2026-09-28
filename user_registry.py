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
TMP_REGISTRY = "/tmp/students_registry.json"

SECRET_KEY = os.environ.get("DDU_PORTAL_SECRET", "ddu_btech_portal_secure_jwt_2026_xyz98124_prod")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@ddunotes.ac.in")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_USER = {
    "id": 9,
    "full_name": "Keshav Narayan (Admin)",
    "email": ADMIN_EMAIL,
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
    if not os.path.exists(TMP_REGISTRY):
        if os.path.exists(REPO_REGISTRY):
            try:
                shutil.copy2(REPO_REGISTRY, TMP_REGISTRY)
            except Exception:
                pass
        else:
            try:
                with open(TMP_REGISTRY, "w", encoding="utf-8") as f:
                    json.dump([ADMIN_USER], f, indent=2)
            except Exception:
                pass
    return TMP_REGISTRY if os.path.exists(TMP_REGISTRY) else REPO_REGISTRY

def load_registry(fetch_remote=True):
    path = get_registry_path()
    users = []
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                users = json.load(f)
                for u in users:
                    u.pop("plain_password", None)
        except Exception:
            users = []

    # Merge with repo registry if different
    if path != REPO_REGISTRY and os.path.exists(REPO_REGISTRY):
        try:
            with open(REPO_REGISTRY, "r", encoding="utf-8") as f:
                repo_users = json.load(f)
                known_emails = {u.get("email", "").lower().strip() for u in users}
                for ru in repo_users:
                    ru.pop("plain_password", None)
                    if ru.get("email", "").lower().strip() not in known_emails:
                        users.append(ru)
        except Exception:
            pass

    # Fetch from Cloud Firestore to sync all serverless instances
    if fetch_remote:
        try:
            remote_students = fetch_firestore_students()
            if isinstance(remote_students, list):
                # Authoritative remote map of active students
                remote_map = {rs.get("email", "").lower().strip(): rs for rs in remote_students if rs.get("email")}
                # Retain admin, and retain students that exist in remote Firestore
                new_users = [u for u in users if u.get("role") == "ADMIN" or u.get("email", "").lower().strip() in remote_map]
                user_map = {u.get("email", "").lower().strip(): u for u in new_users}
                for em, rs in remote_map.items():
                    if em not in FAKE_EMAILS:
                        if em in user_map:
                            user_map[em].update(rs)
                        else:
                            user_map[em] = rs
                users = list(user_map.values())
                save_registry(users, sync_remote=False)
        except Exception:
            pass

    # Clean fake student accounts permanently
    users = [u for u in users if u.get("email", "").lower().strip() not in FAKE_EMAILS]

    # Ensure admin is always present
    has_admin = any(u.get("email", "").lower() == ADMIN_EMAIL.lower() for u in users)
    if not has_admin:
        users.insert(0, ADMIN_USER)

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

    for target in [TMP_REGISTRY, REPO_REGISTRY]:
        try:
            target_dir = os.path.dirname(target)
            if target_dir:
                os.makedirs(target_dir, exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                json.dump(disk_users, f, indent=2)
        except Exception:
            pass

    if sync_remote:
        for u in cleaned_users:
            if u.get("role") != "ADMIN":
                threading.Thread(target=save_firestore_student, args=(u,), daemon=True).start()

def save_user_to_registry(user_dict, allow_update=True):
    email_clean = user_dict.get("email", "").lower().strip()
    if email_clean in FAKE_EMAILS:
        return None

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

    # Sync to Cloud Firestore immediately for non-admin students
    if user_dict.get("role") != "ADMIN":
        try:
            save_firestore_student(user_dict)
        except Exception:
            threading.Thread(target=save_firestore_student, args=(user_dict,), daemon=True).start()

    return user_dict

def find_user_in_registry(email):
    if not email:
        return None
    email_clean = email.lower().strip()
    if email_clean in FAKE_EMAILS:
        return None

    # Check local registry first
    users = load_registry(fetch_remote=False)
    for u in users:
        if u.get("email", "").lower().strip() == email_clean:
            u.pop("plain_password", None)
            return u

    # Check remote Firestore directly if not in local cache
    try:
        doc_id = email_to_doc_id(email_clean)
        url = f"{FIRESTORE_COLLECTION_URL}/{doc_id}"
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            u = firestore_doc_to_user_dict(data)
            if u.get("email"):
                save_user_to_registry(u, allow_update=True)
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
    users = load_registry(fetch_remote=False)
    target_email = None
    filtered = []
    for u in users:
        if str(u.get("id")) == str(user_id_or_email) or u.get("email", "").lower().strip() == str(user_id_or_email).lower().strip():
            target_email = u.get("email")
        else:
            filtered.append(u)
    save_registry(filtered, sync_remote=False)
    if target_email:
        try:
            delete_firestore_student(target_email)
        except Exception:
            pass
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
