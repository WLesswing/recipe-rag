#!/usr/bin/env bash
# start.sh - bring up everything recipe-rag needs
set -euo pipefail
cd "$(dirname "$0")"

SERVEU="will@serveu"
QDRANT_CONTAINER="qdrant"   # change if 'docker ps -a' shows a different name

wait_for() {  # wait_for <name> <url>
  for i in {1..20}; do
    curl -s "$2" > /dev/null && { echo "  $1 is up"; return 0; }
    sleep 1
  done
  echo "  $1 did not come up at $2"; exit 1
}

echo "1. Ollama tunnel to ServeU"
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
  ssh -f -N -L 11434:localhost:11434 "$SERVEU"
fi
wait_for "Ollama" http://localhost:11434/api/tags

echo "2. Qdrant"
docker start "$QDRANT_CONTAINER" > /dev/null
wait_for "Qdrant" http://localhost:6333/collections

echo "3. Phoenix"
source .venv/bin/activate
if ! curl -s http://localhost:6006 > /dev/null; then
  nohup phoenix serve > phoenix.log 2>&1 &
fi
wait_for "Phoenix" http://localhost:6006

echo "All set. Try: python evals.py  or  uvicorn api:app --reload"