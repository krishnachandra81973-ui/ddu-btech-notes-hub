#!/bin/bash
# ==============================================================================
# DDU B.Tech Notes Hub - Startup Script
# Deen Dayal Upadhyaya Gorakhpur University B.Tech Study Material Portal
# Developed by: KESHAV NARAYAN, B.Tech CSE (AI/ML)
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo " Starting DDU B.Tech Notes Hub"
echo " Deen Dayal Upadhyaya Gorakhpur University Portal"
echo "=========================================================="

# Check Python3
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed on this system."
    exit 1
fi

# Initialize and Seed Database if it doesn't exist
if [ ! -f "ddu_portal.db" ]; then
    echo "Initializing SQLite database and seeding sample curriculum..."
    python3 seed_data.py
fi

PORT=${PORT:-8000}
echo "Starting portal server on http://localhost:$PORT..."
echo "Student Dashboard: http://localhost:$PORT/#dashboard"
echo "Admin Portal:      http://localhost:$PORT/#admin"
echo "=========================================================="

exec python3 server.py
