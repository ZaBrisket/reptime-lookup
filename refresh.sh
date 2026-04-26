#!/usr/bin/env bash
# refresh.sh — re-scrape reptime.help and rebuild reptime-help.json.
# Run manually (~monthly). The spreadsheet-derived JSON is updated separately
# by re-running convert_to_json.py whenever you replace the .xlsx files.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ Refreshing reptime-help.json from reptime.help"
cd "$SCRIPT_DIR"

# Re-download the source HTML pages so the parser sees current content.
mkdir -p reptime_html
for slug in "" who-make-the-best newbie-guide glossary factories; do
  if [ -z "$slug" ]; then
    out="reptime_html/td-list.html"
    url="https://reptime.help/"
  else
    out="reptime_html/${slug}.html"
    # Local filenames use "who-makes-the-best", source URL uses "who-make-the-best".
    if [ "$slug" = "who-make-the-best" ]; then
      out="reptime_html/who-makes-the-best.html"
    fi
    url="https://reptime.help/${slug}/"
  fi
  echo "  · ${url}"
  curl -fsS -A "Mozilla/5.0 reptime-help-refresh" -o "$out" "$url"
done

python3 build_reptime_help_db.py
echo "✓ reptime-help.json refreshed"
