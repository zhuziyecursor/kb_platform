#!/bin/bash
# Run a command and write combined stdout/stderr to a bounded rolling log file.

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <log-file> <command> [args...]" >&2
  exit 64
fi

LOG_FILE="$1"
shift

MAX_BYTES="${DEV_LOG_MAX_BYTES:-26214400}"
BACKUPS="${DEV_LOG_BACKUPS:-2}"
LOG_DIR="$(dirname "$LOG_FILE")"

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kb-log.XXXXXX")"
FIFO="$TMP_DIR/out"
mkfifo "$FIFO"

rotate_log_if_needed() {
  local size
  size=$(wc -c < "$LOG_FILE" | tr -d ' ')
  if [ "${size:-0}" -lt "$MAX_BYTES" ]; then
    return
  fi

  local i
  i=$((BACKUPS - 1))
  while [ "$i" -ge 1 ]; do
    if [ -f "$LOG_FILE.$i" ]; then
      mv "$LOG_FILE.$i" "$LOG_FILE.$((i + 1))"
    fi
    i=$((i - 1))
  done

  if [ "$BACKUPS" -gt 0 ]; then
    mv "$LOG_FILE" "$LOG_FILE.1"
  else
    : > "$LOG_FILE"
  fi
  touch "$LOG_FILE"
}

cleanup() {
  if [ -n "${CHILD_PID:-}" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill "$CHILD_PID" 2>/dev/null || true
    wait "$CHILD_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}

trap cleanup INT TERM EXIT

"$@" > "$FIFO" 2>&1 &
CHILD_PID=$!

while IFS= read -r line || [ -n "$line" ]; do
  rotate_log_if_needed
  printf '%s\n' "$line" >> "$LOG_FILE"
done < "$FIFO" &
LOGGER_PID=$!

set +e
wait "$CHILD_PID"
STATUS=$?
wait "$LOGGER_PID" 2>/dev/null || true
exit "$STATUS"
