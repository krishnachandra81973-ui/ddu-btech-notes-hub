import os
import json
import time
import urllib.request
import urllib.parse
import threading

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_REGISTRY = os.path.join(BASE_DIR, "campus_updates_registry.json")
TMP_REGISTRY = "/tmp/campus_updates_registry.json"

FIRESTORE_PROJECT = "keshav-ai-education"
FIRESTORE_COLLECTION_URL = f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT}/databases/(default)/documents/ddu_campus_updates"

_SYNC_LOCK = threading.Lock()
_LAST_SYNC_TIME = 0
_SYNC_INTERVAL = 30  # seconds

def get_registry_path():
    if not os.path.exists(TMP_REGISTRY):
        if os.path.exists(REPO_REGISTRY):
            try:
                import shutil
                shutil.copy2(REPO_REGISTRY, TMP_REGISTRY)
            except Exception:
                pass
    return TMP_REGISTRY if os.path.exists(TMP_REGISTRY) else REPO_REGISTRY

def load_local_updates():
    path = get_registry_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_local_updates(updates):
    path = TMP_REGISTRY if os.path.exists("/tmp") else REPO_REGISTRY
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(updates, f, indent=2)
    except Exception:
        pass
    if path != REPO_REGISTRY:
        try:
            with open(REPO_REGISTRY, "w", encoding="utf-8") as f:
                json.dump(updates, f, indent=2)
        except Exception:
            pass

def _update_to_firestore(u):
    fields = {}
    for k, v in u.items():
        if v is None:
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

def _firestore_to_update(doc):
    fields = doc.get("fields", {})
    update = {}
    for k, fval in fields.items():
        if "stringValue" in fval:
            update[k] = fval["stringValue"]
        elif "integerValue" in fval:
            try:
                update[k] = int(fval["integerValue"])
            except Exception:
                update[k] = fval["integerValue"]
        elif "booleanValue" in fval:
            update[k] = fval["booleanValue"]
        elif "doubleValue" in fval:
            update[k] = fval["doubleValue"]
    return update

def fetch_firestore_updates():
    """Fetches campus updates from Cloud Firestore"""
    try:
        url = f"{FIRESTORE_COLLECTION_URL}?pageSize=300"
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            updates = []
            for doc in docs:
                u = _firestore_to_update(doc)
                if u.get("id") and u.get("title"):
                    updates.append(u)
            return updates
    except Exception:
        return []

def save_firestore_update(update_dict):
    """Saves or updates campus notice in Cloud Firestore"""
    up_id = update_dict.get("id")
    if not up_id:
        return False
    doc_id = f"update_{up_id}"
    url = f"{FIRESTORE_COLLECTION_URL}/{doc_id}"
    try:
        payload = json.dumps(_update_to_firestore(update_dict)).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "DDU-Portal-Serverless"},
            method="PATCH"
        )
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            return resp.status in (200, 201)
    except Exception:
        return False

def delete_firestore_update(up_id):
    """Deletes campus notice from Cloud Firestore"""
    if not up_id:
        return False
    doc_id = f"update_{up_id}"
    url = f"{FIRESTORE_COLLECTION_URL}/{doc_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"}, method="DELETE")
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False

def record_custom_update(update_dict):
    """Records update to local JSON registry and triggers asynchronous Cloud Firestore sync"""
    updates = load_local_updates()
    existing = False
    for i, u in enumerate(updates):
        if u.get("id") == update_dict.get("id"):
            updates[i] = update_dict
            existing = True
            break
    if not existing:
        updates.append(update_dict)
    save_local_updates(updates)

    def _sync():
        save_firestore_update(update_dict)

    threading.Thread(target=_sync, daemon=True).start()

def remove_custom_update(up_id):
    """Removes update from local registry and deletes from Cloud Firestore"""
    updates = [u for u in load_local_updates() if u.get("id") != up_id]
    save_local_updates(updates)

    def _sync():
        delete_firestore_update(up_id)

    threading.Thread(target=_sync, daemon=True).start()

def ensure_campus_updates_synced(conn):
    """
    Ensures that campus notices added by Admin are mirrored into the SQLite daily_updates
    table on Vercel serverless cold starts.
    """
    global _LAST_SYNC_TIME
    now = time.time()
    if now - _LAST_SYNC_TIME < _SYNC_INTERVAL:
        return

    with _SYNC_LOCK:
        if now - _LAST_SYNC_TIME < _SYNC_INTERVAL:
            return
        _LAST_SYNC_TIME = now

        try:
            # 1. Fetch remote updates from Cloud Firestore
            remote_updates = fetch_firestore_updates()
            if not remote_updates:
                # Fallback to local registry
                remote_updates = load_local_updates()
            else:
                save_local_updates(remote_updates)

            if not remote_updates:
                return

            cursor = conn.cursor()
            for u in remote_updates:
                up_id = u.get("id")
                title = u.get("title", "")
                category = u.get("category", "University Notice")
                short_description = u.get("short_description", title)
                full_details = u.get("full_details", "")
                attachment_url = u.get("attachment_url")
                is_important = u.get("is_important", 0)
                is_published = u.get("is_published", 1)
                publish_date = u.get("publish_date")
                duration_days = u.get("duration_days", 0)
                expires_at = u.get("expires_at")
                created_at = u.get("created_at")

                cursor.execute("SELECT id FROM daily_updates WHERE id = ?", (up_id,))
                existing = cursor.fetchone()
                if existing:
                    cursor.execute("""
                        UPDATE daily_updates
                        SET title = ?, category = ?, short_description = ?, full_details = ?,
                            attachment_url = ?, is_important = ?, is_published = ?,
                            publish_date = ?, duration_days = ?, expires_at = ?
                        WHERE id = ?
                    """, (title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date, duration_days, expires_at, up_id))
                else:
                    if created_at:
                        cursor.execute("""
                            INSERT INTO daily_updates (id, title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date, duration_days, expires_at, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (up_id, title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date, duration_days, expires_at, created_at))
                    else:
                        cursor.execute("""
                            INSERT INTO daily_updates (id, title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date, duration_days, expires_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (up_id, title, category, short_description, full_details, attachment_url, is_important, is_published, publish_date, duration_days, expires_at))
            conn.commit()
        except Exception:
            pass
