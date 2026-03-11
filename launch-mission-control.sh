#!/bin/bash
# Launch Nanobot Mission Control for launchd
# Runs Next.js production server on port 3000

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/designmac"
export NODE_ENV="production"

cd /Users/designmac/projects/nanobot_mission_control

exec /usr/local/bin/node node_modules/.bin/next start --hostname 0.0.0.0 --port 3000
