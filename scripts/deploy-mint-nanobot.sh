#!/bin/bash
# Deploy the latest main to a Mission Control box managed by systemd.
#
# Assumes:
#   - Working tree at /srv/nanobot/mission-control/source
#   - System unit at /etc/systemd/system/mission-control.service (Restart=always)
#   - Running as a user that can read/write the working tree
#
# Restart strategy: prefers `sudo -n systemctl restart mission-control` for a
# clean lifecycle. Falls back to killing the next-server PID and letting the
# system unit's Restart=always auto-respawn it (no sudo required).
#
# To enable the clean path, add to sudoers (one-time, with `visudo`):
#   nanobot ALL=(root) NOPASSWD: /bin/systemctl restart mission-control, \
#                                 /bin/systemctl stop mission-control, \
#                                 /bin/systemctl start mission-control, \
#                                 /bin/systemctl status mission-control

set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/nanobot/mission-control/source}"
SERVICE_NAME="${SERVICE_NAME:-mission-control}"
PORT="${PORT:-3000}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-30}"

cd "$REPO_DIR"

echo "==> Stashing local server tweaks (if any)"
git stash push -m "auto-stashed pre-deploy $(date +%F-%H%M)" || true

echo "==> Pulling latest main"
git fetch origin
git pull --ff-only origin main

echo "==> Restoring local tweaks"
git stash pop 2>/dev/null || true

echo "==> Installing deps"
pnpm install --prefer-offline

echo "==> Production build"
rm -f .next/BUILD_ID
pnpm build
[ -f .next/BUILD_ID ] || { echo "build failed (no BUILD_ID)" >&2; exit 1; }

echo "==> Restarting service"
if sudo -n systemctl restart "$SERVICE_NAME" 2>/dev/null; then
  echo "    via systemctl restart"
else
  PID=$(pgrep -f "next-server" | head -1 || true)
  if [ -n "${PID:-}" ]; then
    echo "    via SIGKILL pid=$PID (systemd Restart=always handles respawn)"
    kill -9 "$PID" || true
  else
    echo "    no running server found — relying on systemd to start it"
  fi
fi

echo "==> Waiting for health on http://127.0.0.1:$PORT/login"
for i in $(seq 1 "$HEALTH_TIMEOUT_SEC"); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/login" 2>/dev/null; then
    echo "    ready after ${i}s"
    git -C "$REPO_DIR" log -1 --oneline
    exit 0
  fi
  sleep 1
done

echo "deploy failed: server did not respond within ${HEALTH_TIMEOUT_SEC}s" >&2
systemctl status "$SERVICE_NAME" --no-pager 2>&1 | tail -20 >&2
exit 1
