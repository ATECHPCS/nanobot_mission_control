#!/bin/bash
# Launch Nanobot Mission Control for launchd
# Runs Next.js production server on port 3000

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/designmac"
export NODE_ENV="production"

cd /Users/designmac/projects/nanobot_mission_control

# Load env vars (.env.local not auto-loaded by next start in production)
if [ -f .env.local ]; then
  set -a
  . .env.local
  set +a
fi

exec /usr/local/bin/node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000
