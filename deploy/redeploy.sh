#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
bail() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || bail "Run as root: sudo ./deploy/redeploy.sh"

SRC="/home/ajt/podreader"
DEST="/home/podreader/podreader"
OWNER="podreader:podreader"

info "Running tests..."
cd "${SRC}"
npx vitest run || bail "Tests failed. Aborting deploy."
ok "Tests passed."

info "Cleaning old builds..."
rm -rf "${SRC}/dist" "${SRC}/dist-server" "${SRC}/node_modules/.vite"

info "Building frontend..."
npx vite build || bail "Frontend build failed. Aborting deploy."
ok "Frontend built."

info "Building server..."
npx tsc -p tsconfig.server.json || bail "Server build failed. Aborting deploy."
ok "Server built."

info "Fixing source build ownership..."
chown -R ajt:ajt "${SRC}/dist" "${SRC}/dist-server"

info "Syncing dist-server..."
rsync -a --delete "${SRC}/dist-server/" "${DEST}/dist-server/"

info "Syncing dist..."
rsync -a --delete "${SRC}/dist/" "${DEST}/dist/"

info "Syncing package files..."
rsync -a "${SRC}/package.json" "${SRC}/package-lock.json" "${DEST}/"

info "Syncing prompt..."
rsync -a "${SRC}/prompt.md" "${DEST}/"

info "Updating yt-dlp..."
# Install/update standalone binary (apt version is outdated and can't self-update)
if [[ -x /usr/local/bin/yt-dlp ]]; then
    /usr/local/bin/yt-dlp -U 2>&1 | tail -3 || info "yt-dlp self-update failed (non-fatal), continuing..."
else
    info "Installing yt-dlp standalone binary..."
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
        && chmod a+rx /usr/local/bin/yt-dlp \
        && ok "yt-dlp installed: $(/usr/local/bin/yt-dlp --version)" \
        || info "yt-dlp install failed (non-fatal), continuing..."
fi

info "Installing dependencies..."
cd "${DEST}"
npm ci --omit=dev 2>&1 | tail -5

info "Fixing ownership..."
chown -R "${OWNER}" "${DEST}"

info "Updating nginx config..."
cp "${SRC}/deploy/nginx-podreader.conf" /etc/nginx/sites-available/podreader
# Substitute variables in the nginx config
sed -i 's|\${LAN_IP}|192.168.1.11|g; s|\${APP_DIR}|/home/podreader/podreader|g' /etc/nginx/sites-available/podreader
ln -sf /etc/nginx/sites-available/podreader /etc/nginx/sites-enabled/podreader
nginx -t 2>&1 || bail "Nginx config test failed"
systemctl reload nginx

info "Restarting podreader service..."
systemctl restart podreader

sleep 2
if systemctl is-active --quiet podreader; then
    ok "podreader is running."
else
    bail "podreader failed to start. Check: journalctl -u podreader -n 30"
fi
