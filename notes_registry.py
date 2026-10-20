import os
import json
import time
import urllib.request
import urllib.parse
import threading

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_REGISTRY = os.path.join(BASE_DIR, "custom_notes_registry.json")
STATIC_REGISTRY = os.path.join(BASE_DIR, "static", "uploads", "notes", "custom_notes_registry.json")
TMP_REGISTRY = "/tmp/custom_notes_registry.json"

DELETED_REPO_REGISTRY = os.path.join(BASE_DIR, "deleted_notes_registry.json")
DELETED_STATIC_REGISTRY = os.path.join(BASE_DIR, "static", "uploads", "notes", "deleted_notes_registry.json")
DELETED_TMP_REGISTRY = "/tmp/deleted_notes_registry.json"

FIRESTORE_PROJECT = "keshav-ai-education"
FIRESTORE_COLLECTION_URL = f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT}/databases/(default)/documents/ddu_custom_notes"
FIRESTORE_DELETED_URL = f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT}/databases/(default)/documents/ddu_deleted_notes"

_SYNC_LOCK = threading.Lock()
_LAST_SYNC_TIME = 0
_SYNC_INTERVAL = 30  # seconds

def get_registry_path():
    if not os.path.exists(TMP_REGISTRY):
        notes = load_local_notes()
        if notes:
            try:
                with open(TMP_REGISTRY, "w", encoding="utf-8") as f:
                    json.dump(notes, f, indent=2)
            except Exception:
                pass
    return TMP_REGISTRY if os.path.exists(TMP_REGISTRY) else REPO_REGISTRY

def load_local_notes():
    """
    Loads custom notes from all local registry locations (static, repo, tmp),
    merging notes by note id so that dynamically uploaded notes are never lost.
    """
    merged = {}
    for p in [STATIC_REGISTRY, REPO_REGISTRY, TMP_REGISTRY]:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for note in data:
                            nid = note.get("id")
                            if nid:
                                merged[nid] = note
            except Exception:
                pass
    return list(merged.values())

def save_local_notes(notes):
    targets = [TMP_REGISTRY, REPO_REGISTRY, STATIC_REGISTRY]
    for p in targets:
        try:
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
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
        with urllib.request.urlopen(req, timeout=2.0) as resp:
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
        with urllib.request.urlopen(req, timeout=2.0) as resp:
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
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False


def get_deleted_registry_path():
    if not os.path.exists(DELETED_TMP_REGISTRY):
        if os.path.exists(DELETED_REPO_REGISTRY):
            try:
                import shutil
                shutil.copy2(DELETED_REPO_REGISTRY, DELETED_TMP_REGISTRY)
            except Exception:
                pass
    return DELETED_TMP_REGISTRY if os.path.exists(DELETED_TMP_REGISTRY) else DELETED_REPO_REGISTRY


def load_local_deleted_ids():
    deleted = set()
    for p in [DELETED_STATIC_REGISTRY, DELETED_REPO_REGISTRY, DELETED_TMP_REGISTRY]:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for x in data:
                            if str(x).isdigit():
                                deleted.add(int(x))
            except Exception:
                pass
    # Safety guard: active notes present in the local registry MUST NEVER be marked as deleted
    try:
        active_ids = {int(n["id"]) for n in load_local_notes() if str(n.get("id")).isdigit()}
        deleted = deleted - active_ids
    except Exception:
        pass
    return sorted(list(deleted))


def save_local_deleted_ids(ids):
    try:
        active_ids = {int(n["id"]) for n in load_local_notes() if str(n.get("id")).isdigit()}
    except Exception:
        active_ids = set()
    clean_ids = sorted(list(set([int(x) for x in ids if str(x).isdigit() and int(x) not in active_ids])))
    for p in [DELETED_TMP_REGISTRY, DELETED_REPO_REGISTRY, DELETED_STATIC_REGISTRY]:
        try:
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                json.dump(clean_ids, f, indent=2)
        except Exception:
            pass


def fetch_firestore_deleted_ids():
    """Fetches deleted note IDs from Cloud Firestore collection"""
    try:
        url = f"{FIRESTORE_DELETED_URL}?pageSize=300"
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            ids = []
            for doc in docs:
                fields = doc.get("fields", {})
                if "note_id" in fields:
                    val = fields["note_id"].get("integerValue") or fields["note_id"].get("stringValue")
                    if val and str(val).isdigit():
                        ids.append(int(val))
            return ids
    except Exception:
        return []


def save_firestore_deleted_id(note_id):
    """Persists a deleted note ID to Cloud Firestore so it is permanently deleted across all serverless instances"""
    if not note_id:
        return False
    doc_id = f"deleted_{note_id}"
    url = f"{FIRESTORE_DELETED_URL}/{doc_id}"
    try:
        payload = json.dumps({
            "fields": {
                "note_id": {"integerValue": str(note_id)},
                "deleted_at": {"stringValue": str(int(time.time()))}
            }
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "DDU-Portal-Serverless"},
            method="PATCH"
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            return resp.status in (200, 201)
    except Exception:
        return False


def delete_firestore_deleted_id(note_id):
    """Removes a note ID from Cloud Firestore deleted notes collection"""
    if not note_id:
        return False
    doc_id = f"deleted_{note_id}"
    url = f"{FIRESTORE_DELETED_URL}/{doc_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DDU-Portal-Serverless"}, method="DELETE")
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False


def record_deleted_notes(note_ids):
    """
    Permanently records note IDs as deleted across local JSON, Cloud Firestore,
    and purges them from custom notes cache.
    Local files are updated instantly (<1ms), and Cloud Firestore operations
    run in a daemon thread to guarantee fast, non-blocking HTTP responses.
    """
    if not note_ids:
        return
    clean_ids = [int(nid) for nid in note_ids if str(nid).isdigit()]
    if not clean_ids:
        return

    deleted_ids = load_local_deleted_ids()
    updated = False
    for nid in clean_ids:
        if nid not in deleted_ids:
            deleted_ids.append(nid)
            updated = True

    if updated:
        save_local_deleted_ids(deleted_ids)

    # Clean from local custom notes immediately
    custom_notes = [n for n in load_local_notes() if int(n.get("id", 0)) not in deleted_ids]
    save_local_notes(custom_notes)

    # Asynchronously delete from Firestore & commit updated registries to GitHub in background
    def _async_firestore_delete():
        for nid in clean_ids:
            try:
                delete_firestore_note(nid)
                save_firestore_deleted_id(nid)
            except Exception:
                pass
        try:
            import cloud_storage
            del_bytes = json.dumps(load_local_deleted_ids(), indent=2).encode("utf-8")
            cloud_storage.commit_file_to_github(
                "deleted_notes_registry.json",
                del_bytes,
                commit_message=f"Permanent sync: {len(clean_ids)} notes deleted"
            )
            cloud_storage.commit_file_to_github(
                "static/uploads/notes/deleted_notes_registry.json",
                del_bytes,
                commit_message=f"Mirror sync: {len(clean_ids)} notes deleted"
            )
            custom_bytes = json.dumps(load_local_notes(), indent=2).encode("utf-8")
            cloud_storage.commit_file_to_github(
                "custom_notes_registry.json",
                custom_bytes,
                commit_message="Sync custom notes registry after deletion"
            )
            cloud_storage.commit_file_to_github(
                "static/uploads/notes/custom_notes_registry.json",
                custom_bytes,
                commit_message="Mirror sync custom notes registry after deletion"
            )
        except Exception:
            pass

    threading.Thread(target=_async_firestore_delete, daemon=True).start()


def record_custom_note(note_dict):
    """Records note to local cache and persists to Firestore & GitHub in a worker thread"""
    nid = note_dict.get("id")
    if nid:
        try:
            nid_int = int(nid)
            deleted_ids = load_local_deleted_ids()
            if nid_int in deleted_ids:
                deleted_ids = [d for d in deleted_ids if d != nid_int]
                save_local_deleted_ids(deleted_ids)
            delete_firestore_deleted_id(nid_int)
        except Exception:
            pass
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

    # 1. Save synchronously to Cloud Firestore to guarantee persistence before Vercel serverless freeze
    try:
        save_firestore_note(note_dict)
    except Exception as e:
        print("[notes_registry] Sync firestore save notice:", e)

    def _sync():
        try:
            import cloud_storage
            custom_bytes = json.dumps(load_local_notes(), indent=2).encode("utf-8")
            # Always commit to BOTH root and static/uploads/notes so serverless never misses it
            cloud_storage.commit_file_to_github(
                "custom_notes_registry.json",
                custom_bytes,
                commit_message=f"Sync custom notes registry: Note {note_dict.get('id')} updated"
            )
            cloud_storage.commit_file_to_github(
                "static/uploads/notes/custom_notes_registry.json",
                custom_bytes,
                commit_message=f"Mirror sync custom notes registry: Note {note_dict.get('id')} updated"
            )
        except Exception:
            pass

    threading.Thread(target=_sync, daemon=True).start()


def remove_custom_note(note_id):
    """Removes note from local cache, marks as deleted, and removes from Firestore"""
    record_deleted_notes([note_id])


def _sync_notes_to_sqlite(conn, active_notes, all_deleted):
    """Inserts/updates active notes and purges deleted notes in SQLite"""
    try:
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE IF NOT EXISTS deleted_notes (note_id INTEGER PRIMARY KEY, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP);")
        for did in all_deleted:
            cursor.execute("INSERT OR IGNORE INTO deleted_notes (note_id) VALUES (?)", (did,))
        
        active_ids = {int(n["id"]) for n in active_notes if str(n.get("id")).isdigit()}
        if active_ids:
            act_placeholders = ",".join("?" for _ in active_ids)
            cursor.execute(f"DELETE FROM deleted_notes WHERE note_id IN ({act_placeholders})", tuple(active_ids))
        if all_deleted:
            placeholders = ",".join("?" for _ in all_deleted)
            cursor.execute(f"DELETE FROM notes WHERE id IN ({placeholders})", tuple(all_deleted))
        conn.commit()

        if not active_notes:
            return

        for n in active_notes:
            try:
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

                # Verify subject exists or resolve fallback
                cursor.execute("SELECT id FROM subjects WHERE id = ?", (subject_id,))
                sub_row = cursor.fetchone()
                if not sub_row:
                    matched_id = None
                    sub_code = n.get("subject_code")
                    sub_name = n.get("subject_name")
                    if sub_code:
                        cursor.execute("SELECT id FROM subjects WHERE code = ?", (sub_code.strip().upper(),))
                        found = cursor.fetchone()
                        if found:
                            matched_id = found[0]
                    if not matched_id and sub_name:
                        cursor.execute("SELECT id FROM subjects WHERE name LIKE ?", (f"%{sub_name.strip()}%",))
                        found = cursor.fetchone()
                        if found:
                            matched_id = found[0]
                    if not matched_id and ('mecha' in title.lower() or 'mecha' in description.lower()):
                        cursor.execute("SELECT id FROM subjects WHERE code = 'BME-101' OR name LIKE '%Mechanical%' LIMIT 1")
                        found = cursor.fetchone()
                        if found:
                            matched_id = found[0]
                    subject_id = matched_id

                if not subject_id:
                    continue

                if unit_id:
                    cursor.execute("SELECT id FROM units WHERE id = ?", (unit_id,))
                    if not cursor.fetchone():
                        unit_id = None
                if not unit_id and subject_id:
                    cursor.execute("SELECT id FROM units WHERE subject_id = ? AND unit_number = 1 LIMIT 1", (subject_id,))
                    u_row = cursor.fetchone()
                    if u_row:
                        unit_id = u_row[0]

                if contributed_by_id:
                    cursor.execute("SELECT id FROM users WHERE id = ?", (contributed_by_id,))
                    if not cursor.fetchone():
                        contributed_by_id = None

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
            except Exception as ne:
                pass
    except Exception as e:
        pass


def ensure_custom_notes_synced(conn, force_remote=False):
    """
    1. Immediately synchronizes local JSON notes and deleted note IDs into SQLite (<1ms).
    2. Dispatches Cloud Firestore remote sync to a background daemon thread so user queries
       NEVER suffer latency or timeout delays.
    """
    try:
        # Step 1: Instant local sync (<1ms)
        local_notes = load_local_notes()
        local_deleted = load_local_deleted_ids()
        active_ids = {int(n["id"]) for n in local_notes if str(n.get("id")).isdigit()}
        all_deleted = set(local_deleted) - active_ids
        active_notes = [n for n in local_notes if int(n.get("id", 0)) not in all_deleted]
        _sync_notes_to_sqlite(conn, active_notes, all_deleted)
    except Exception:
        pass

    # Step 2: Background Cloud Firestore check
    global _LAST_SYNC_TIME
    now = time.time()
    if (now - _LAST_SYNC_TIME >= _SYNC_INTERVAL) or force_remote:
        _LAST_SYNC_TIME = now

        def _bg_firestore_sync():
            try:
                remote_notes = fetch_firestore_notes()
                remote_deleted = fetch_firestore_deleted_ids()
                if not remote_notes and not remote_deleted:
                    return

                cur_local = load_local_notes()
                merged_dict = {n.get("id"): n for n in cur_local if n.get("id")}
                if remote_notes:
                    for rn in remote_notes:
                        if rn.get("id"):
                            merged_dict[rn.get("id")] = rn
                all_active = list(merged_dict.values())
                save_local_notes(all_active)

                cur_deleted = load_local_deleted_ids()
                act_ids = {int(n["id"]) for n in all_active if str(n.get("id")).isdigit()}
                merged_deleted = set(cur_deleted + remote_deleted) - act_ids
                if remote_deleted:
                    save_local_deleted_ids(list(merged_deleted))

                # Clean remote deleted collection for active IDs
                for aid in act_ids:
                    if aid in remote_deleted:
                        try:
                            delete_firestore_deleted_id(aid)
                        except Exception:
                            pass

                import database
                bg_conn = database.get_connection()
                clean_active = [n for n in all_active if int(n.get("id", 0)) not in merged_deleted]
                _sync_notes_to_sqlite(bg_conn, clean_active, merged_deleted)
                bg_conn.close()
            except Exception as e:
                pass

        if force_remote:
            _bg_firestore_sync()
        else:
            threading.Thread(target=_bg_firestore_sync, daemon=True).start()

