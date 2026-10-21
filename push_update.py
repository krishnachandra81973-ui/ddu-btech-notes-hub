#!/usr/bin/env python3
"""
========================================================================================
DDU B.Tech Notes Hub - Push Campus Update & Message Broadcast Script
========================================================================================
Allows you to push urgent notices, circulars, exam announcements, and syllabus updates
directly to the DDU website via GitHub!

Usage:
  Interactive Mode:
    python3 push_update.py

  Direct CLI Arguments:
    python3 push_update.py --title "Winter Break Extended" --desc "Campus reopens Jan 6" --category "University Notice" --important

  Options:
    --title TEXT         Notice Title (Required)
    --desc TEXT          Short Description / Summary (Required)
    --category TEXT      Category (Exam, Result, University Notice, Syllabus, Notes, Admit Card, Important Announcement)
    --details TEXT       Detailed announcement body (Optional)
    --attachment TEXT    Attachment URL or file link (Optional)
    --important          Mark as important (pinned notice)
    --no-push            Save locally in campus_updates_registry.json without git push
========================================================================================
"""

import os
import sys
import json
import time
import base64
import argparse
import subprocess
import urllib.request
import urllib.error
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REGISTRY_FILE = os.path.join(BASE_DIR, "campus_updates_registry.json")
DB_FILE = os.path.join(BASE_DIR, "ddu_portal.db")

def get_github_token():
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        return token
    try:
        res = subprocess.run(["git", "remote", "get-url", "origin"], cwd=BASE_DIR, capture_output=True, text=True)
        url = res.stdout.strip()
        if "@github.com" in url and "://" in url:
            creds = url.split("://")[1].split("@github.com")[0]
            return creds.split(":")[-1]
    except Exception:
        pass
    return ""

REPO_OWNER = "krishnachandra81973-ui"
REPO_NAME = "ddu-btech-notes-hub"
BRANCH = "main"

CATEGORIES = [
    "University Notice",
    "Exam",
    "Result",
    "Admit Card",
    "Syllabus",
    "Notes",
    "Previous Year Paper",
    "Important Announcement"
]

def load_registry():
    if os.path.exists(REGISTRY_FILE):
        try:
            with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ Warning reading registry: {e}")
            return []
    return []

def save_registry(updates):
    with open(REGISTRY_FILE, "w", encoding="utf-8") as f:
        json.dump(updates, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved to {REGISTRY_FILE} ({len(updates)} total notices)")

def sync_to_sqlite(update_record):
    if not os.path.exists(DB_FILE):
        return
    try:
        import sqlite3
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO daily_updates (
                id, title, category, short_description, full_details,
                attachment_url, is_important, is_published, publish_date,
                duration_days, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            update_record["id"],
            update_record["title"],
            update_record["category"],
            update_record["short_description"],
            update_record.get("full_details", ""),
            update_record.get("attachment_url"),
            update_record.get("is_important", 0),
            1,
            update_record["publish_date"],
            update_record.get("duration_days", 0),
            update_record["created_at"]
        ))
        conn.commit()
        conn.close()
        print("💾 Synchronized to local SQLite database (ddu_portal.db)")
    except Exception as e:
        print(f"⚠️ SQLite local sync note: {e}")

def get_file_sha_via_api(path="campus_updates_registry.json"):
    token = get_github_token()
    if not token:
        return None
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/{path}?ref={BRANCH}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "DDU-Update-Publisher"
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("sha")
    except Exception:
        return None

def push_via_github_api(commit_message):
    token = get_github_token()
    if not token:
        print("❌ No GitHub token found in GITHUB_TOKEN env or git remote")
        return False
    try:
        with open(REGISTRY_FILE, "rb") as f:
            content_bytes = f.read()
        content_b64 = base64.b64encode(content_bytes).decode("utf-8")
        sha = get_file_sha_via_api()

        url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/campus_updates_registry.json"
        payload = {
            "message": commit_message,
            "content": content_b64,
            "branch": BRANCH
        }
        if sha:
            payload["sha"] = sha

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="PUT", headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "User-Agent": "DDU-Update-Publisher"
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            commit_sha = res_data.get("commit", {}).get("sha", "")[:7]
            print(f"✅ Successfully pushed to GitHub via REST API! (Commit: {commit_sha})")
            return True
    except Exception as e:
        print(f"❌ GitHub API fallback failed: {e}")
        return False

def push_to_github(commit_message):
    print("\n🚀 Pushing update to GitHub...")
    # 1. Try git CLI first
    try:
        subprocess.run(["git", "add", "campus_updates_registry.json"], cwd=BASE_DIR, check=True)
        # Check if there are staged changes
        res = subprocess.run(["git", "commit", "-m", commit_message], cwd=BASE_DIR, capture_output=True, text=True)
        if res.returncode == 0:
            print("📦 Created git commit:", res.stdout.strip().split("\n")[0])
        else:
            print("ℹ️ Git commit output:", res.stdout.strip())

        push_res = subprocess.run(["git", "push", "origin", BRANCH], cwd=BASE_DIR, capture_output=True, text=True, timeout=12)
        if push_res.returncode == 0:
            print("✅ Successfully pushed to GitHub via Git CLI!")
            return True
        else:
            print(f"⚠️ Git push failed ({push_res.stderr.strip()}), trying GitHub REST API...")
    except Exception as e:
        print(f"⚠️ Git command error: {e}, attempting GitHub REST API fallback...")

    # 2. Try GitHub REST API fallback
    return push_via_github_api(commit_message)

def create_update(title, category, short_desc, full_details=None, attachment_url=None, is_important=False, duration_days=0, auto_push=True):
    updates = load_registry()
    max_id = max([u.get("id", 0) for u in updates], default=0)
    new_id = max_id + 1

    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    created_at_str = now.strftime("%Y-%m-%d %H:%M:%S")

    new_record = {
        "id": new_id,
        "title": title.strip(),
        "category": category.strip(),
        "short_description": short_desc.strip(),
        "full_details": (full_details or short_desc).strip(),
        "attachment_url": attachment_url.strip() if attachment_url else None,
        "is_important": 1 if is_important else 0,
        "is_published": 1,
        "publish_date": today_str,
        "duration_days": int(duration_days or 0),
        "created_at": created_at_str
    }

    # Prepend to updates list (latest first)
    updates.insert(0, new_record)
    save_registry(updates)
    sync_to_sqlite(new_record)

    commit_msg = f"📢 Campus Notice #{new_id}: {title.strip()}"

    if auto_push:
        push_to_github(commit_msg)
    else:
        print(f"\n💡 Note saved locally. To push to GitHub, run:\n   git add campus_updates_registry.json\n   git commit -m '{commit_msg}'\n   git push origin main")

    print("\n" + "="*60)
    print(f"🎉 Notice #{new_id} Successfully Published!")
    print(f"📌 Title:       {new_record['title']}")
    print(f"🏷️  Category:    {new_record['category']}")
    print(f"⭐ Important:   {'YES' if is_important else 'NO'}")
    print(f"📅 Published:   {new_record['publish_date']}")
    print("="*60 + "\n")
    return new_record

def interactive_mode():
    print("\n" + "="*60)
    print("📢 DDU B.Tech Notes Hub - Campus Notice / Update Publisher")
    print("="*60)

    title = ""
    while not title:
        title = input("\n👉 Enter Notice / Message Title: ").strip()
        if not title:
            print("❌ Title cannot be empty!")

    print("\nSelect Category:")
    for idx, cat in enumerate(CATEGORIES, 1):
        print(f"  [{idx}] {cat}")
    cat_choice = input(f"Choose Category [1-{len(CATEGORIES)}] (Default: 1): ").strip()
    try:
        cat_idx = int(cat_choice) - 1
        category = CATEGORIES[cat_idx] if 0 <= cat_idx < len(CATEGORIES) else "University Notice"
    except Exception:
        category = "University Notice"
    print(f"Selected: {category}")

    short_desc = ""
    while not short_desc:
        short_desc = input("\n👉 Enter Short Description / Summary: ").strip()
        if not short_desc:
            print("❌ Summary cannot be empty!")

    full_details = input("\n👉 Enter Full Details (Optional, press Enter to skip): ").strip()
    attachment_url = input("\n👉 Enter Attachment URL (PDF/Image link, press Enter to skip): ").strip()

    imp_input = input("\n👉 Mark as Important (Pinned at top)? (y/N): ").strip().lower()
    is_important = imp_input in ("y", "yes")

    push_input = input("\n👉 Push to GitHub immediately? (Y/n): ").strip().lower()
    auto_push = push_input not in ("n", "no")

    create_update(
        title=title,
        category=category,
        short_desc=short_desc,
        full_details=full_details,
        attachment_url=attachment_url,
        is_important=is_important,
        auto_push=auto_push
    )

def main():
    parser = argparse.ArgumentParser(description="Push campus update to DDU Notes Hub and GitHub")
    parser.add_argument("--title", type=str, help="Notice title")
    parser.add_argument("--desc", type=str, help="Short summary description")
    parser.add_argument("--category", type=str, default="University Notice", help="Notice category")
    parser.add_argument("--details", type=str, default=None, help="Full details text")
    parser.add_argument("--attachment", type=str, default=None, help="Attachment file URL")
    parser.add_argument("--important", action="store_true", help="Mark as important / pinned notice")
    parser.add_argument("--duration", type=int, default=0, help="Duration in days (0 for permanent)")
    parser.add_argument("--no-push", action="store_true", help="Do not push to GitHub")

    args = parser.parse_args()

    if not args.title:
        # If no arguments given, run interactive menu
        interactive_mode()
    else:
        desc = args.desc or args.title
        create_update(
            title=args.title,
            category=args.category,
            short_desc=desc,
            full_details=args.details or desc,
            attachment_url=args.attachment,
            is_important=args.important,
            duration_days=args.duration,
            auto_push=not args.no_push
        )

if __name__ == "__main__":
    main()
