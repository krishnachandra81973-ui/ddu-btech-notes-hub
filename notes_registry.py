import os
import json
import time
import urllib.request
import urllib.parse
import threading

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_REGISTRY = os.path.join(BASE_DIR, "custom_notes_registry.json")
TMP_REGISTRY = "/tmp/custom_notes_registry.json"

FIRESTORE_PROJECT = "keshav-ai-education"
FIRESTORE_COLLECTION_URL = f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT}/databases/(default)/documents/ddu_custom_notes"

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

def load_local_notes():
    path = get_registry_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_local_notes(notes):
    path = TMP_REGISTRY if os.path.exists("/tmp") else REPO_REGISTRY
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(notes, f, indent=2)
    except Exception:
        pass
    if path != REPO_REGISTRY:
        try:
            with open(REPO_REGISTRY, "w", encoding="utf-8") as f:
                json.dump(notes, f, indent=2)
        except Exception:
            pass

def _note_to_firestore(n):
    fields = {}
    for k, v in n.items():
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

def _firestore_to_note(doc):
    fields = doc.get("fields", {})
    note = {}
    for k, fval in fields.items():
        if "stringValue" in fval:
            note[k] = fval["stringValue"]
        elif "integerValue" in fval:
            try:
                note[k] = int(fval["integerValue"])
            except Exception:
                note[k] = fval["integerValue"]
        elif "booleanValue" in fval:
            note[k] = fval["booleanValue"]
        elif "doubleValue" in fval:
            note[k] = fval["doubleValue"]
    return note

def fetch_firestore_notes():
    """Fetches custom notes added by admin from Cloud Firestore"""
    try:
        url = f"{FIRESTORE_COLLECTION_URL}?pageSize=300"
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            notes = []
            for doc in docs:
                n = _firestore_to_note(doc)
                if n.get("id") and n.get("title") and n.get("file_url"):
                    notes.append(n)
            return notes
    except Exception:
        return []

def save_firestore_note(note_dict):
    """Saves or updates custom note in Cloud Firestore"""
    note_id = note_dict.get("id")
    if not note_id:
        return False
    doc_id = f"note_{note_id}"
    url = f"{FIRESTORE_COLLECTION_URL}/{doc_id}"
    try:
        payload = json.dumps(_note_to_firestore(note_dict)).encode("utf-8")
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

def delete_firestore_note(note_id):
    """Deletes custom note from Cloud Firestore"""
    if not note_id:
        return False
    doc_id = f"note_{note_id}"
    url = f"{FIRESTORE_COLLECTION_URL}/{doc_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"}, method="DELETE")
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False

def record_custom_note(note_dict):
    """Records note to local cache and persists to Firestore in a worker thread"""
    notes = load_local_notes()
    existing = False
    for i, n in enumerate(notes):
        if n.get("id") == note_dict.get("id"):
            notes[i] = note_dict
            existing = True
            break
    if not existing:
        notes.append(note_dict)
    save_local_notes(notes)

    def _sync():
        save_firestore_note(note_dict)

    threading.Thread(target=_sync, daemon=True).start()

def remove_custom_note(note_id):
    """Removes note from local cache and deletes from Firestore"""
    notes = [n for n in load_local_notes() if n.get("id") != note_id]
    save_local_notes(notes)

    def _sync():
        delete_firestore_note(note_id)

    threading.Thread(target=_sync, daemon=True).start()

def ensure_custom_notes_synced(conn):
    """
    Ensures that any custom notes created by the admin in Cloud Firestore
    are mirrored in the SQLite notes table on Vercel serverless cold starts.
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
            # 1. Fetch remote notes from Cloud Firestore
            remote_notes = fetch_firestore_notes()
            if not remote_notes:
                # Fallback to local registry if Firestore call timed out or empty
                remote_notes = load_local_notes()
            else:
                save_local_notes(remote_notes)

            if not remote_notes:
                return

            cursor = conn.cursor()
            for n in remote_notes:
                note_id = n.get("id")
                subject_id = n.get("subject_id")
                unit_id = n.get("unit_id")
                title = n.get("title", "")
                description = n.get("description", "")
                file_url = n.get("file_url", "")
                file_name = n.get("file_name", title)
                file_size = n.get("file_size", "PDF Document")
                is_important = n.get("is_important", 0)
                is_published = n.get("is_published", 1)
                is_verified = n.get("is_verified", 1)
                status = n.get("status", "APPROVED")
                contributed_by_id = n.get("contributed_by_id")
                contributed_by_name = n.get("contributed_by_name")
                contributed_by_email = n.get("contributed_by_email")
                download_count = n.get("download_count", 0)
                created_at = n.get("created_at")

                # Verify subject exists
                cursor.execute("SELECT id FROM subjects WHERE id = ?", (subject_id,))
                if not cursor.fetchone():
                    continue

                # Check if unit exists, if not set unit_id to None
                if unit_id:
                    cursor.execute("SELECT id FROM units WHERE id = ?", (unit_id,))
                    if not cursor.fetchone():
                        unit_id = None

                cursor.execute("SELECT id FROM notes WHERE id = ?", (note_id,))
                existing = cursor.fetchone()
                if existing:
                    cursor.execute("""
                        UPDATE notes
                        SET subject_id = ?, unit_id = ?, title = ?, description = ?,
                            file_url = ?, file_name = ?, file_size = ?,
                            is_important = ?, is_published = ?, is_verified = ?, status = ?,
                            contributed_by_id = ?, contributed_by_name = ?, contributed_by_email = ?
                        WHERE id = ?
                    """, (subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published, is_verified, status, contributed_by_id, contributed_by_name, contributed_by_email, note_id))
                else:
                    if created_at:
                        cursor.execute("""
                            INSERT INTO notes (id, subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published, is_verified, status, contributed_by_id, contributed_by_name, contributed_by_email, download_count, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (note_id, subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published, is_verified, status, contributed_by_id, contributed_by_name, contributed_by_email, download_count, created_at))
                    else:
                        cursor.execute("""
                            INSERT INTO notes (id, subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published, is_verified, status, contributed_by_id, contributed_by_name, contributed_by_email, download_count)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (note_id, subject_id, unit_id, title, description, file_url, file_name, file_size, is_important, is_published, is_verified, status, contributed_by_id, contributed_by_name, contributed_by_email, download_count))
            conn.commit()
        except Exception:
            pass
