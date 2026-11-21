#!/bin/bash
# Starts a local web server and opens Gridspace in your browser.
# Run:  bash start.sh      (stop with Ctrl+C)
cd "$(dirname "$0")"
PORT=8000
echo "Gridspace running at http://localhost:$PORT  (Ctrl+C to stop)"
(sleep 1 && open "http://localhost:$PORT") &
python3 -m http.server $PORT
