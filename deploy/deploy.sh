#!/usr/bin/env bash
# =============================================================================
# PodReader — Full Deployment & Optimisation Script
# Target: Fresh Ubuntu 24.04 LTS server (LAN, no domain/TLS)
# Usage:  sudo bash deploy/deploy.sh
# =============================================================================
set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
bail()  { err "$*"; exit 1; }

# ── Pre-flight checks ───────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || bail "This script must be run as root (sudo bash deploy/deploy.sh)"

source /etc/os-release 2>/dev/null || true
if [[ "${VERSION_ID:-}" != "24.04" ]]; then
    warn "Expected Ubuntu 24.04, detected ${PRETTY_NAME:-unknown}. Proceeding anyway."
fi

# ── Locate repo root (deploy/ is a subdirectory) ────────────────────────────
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$DEPLOY_DIR")"

# ── Detect LAN IP ────────────────────────────────────────────────────────────
DETECTED_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')

# ── User-supplied variables ──────────────────────────────────────────────────
echo ""
echo "======================================"
echo "  PodReader Deployment Configuration"
echo "======================================"
echo ""

read -rp "LAN IP address [${DETECTED_IP}]: " LAN_IP
LAN_IP="${LAN_IP:-$DETECTED_IP}"
[[ -n "$LAN_IP" ]] || bail "Could not determine LAN IP. Please provide one."

read -rp "OpenAI API key (required for transcription): " OPENAI_KEY
[[ -n "$OPENAI_KEY" ]] || bail "OpenAI API key is required."

read -rp "Anthropic API key (optional, press Enter to skip): " ANTHROPIC_KEY

read -rp "Install Ollama for local LLM summarisation? [y/N]: " INSTALL_OLLAMA
INSTALL_OLLAMA="${INSTALL_OLLAMA,,}"  # lowercase

SESSION_SECRET=$(openssl rand -hex 32)
info "Generated SESSION_SECRET: ${SESSION_SECRET:0:8}..."

APP_USER="podreader"
APP_DIR="/home/${APP_USER}/podreader"

echo ""
info "LAN IP:       $LAN_IP"
info "Source:       $REPO_DIR (local copy)"
info "App user:     $APP_USER"
info "App dir:      $APP_DIR"
info "Ollama:       ${INSTALL_OLLAMA:-n}"
echo ""
read -rp "Proceed with deployment? [Y/n]: " CONFIRM
[[ "${CONFIRM,,}" != "n" ]] || bail "Aborted."

# ── Phase 1: System update & timezone ────────────────────────────────────────
info "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
ok "System updated."

info "Setting timezone to UTC..."
timedatectl set-timezone UTC
ok "Timezone set."

# ── Phase 2: System dependencies ─────────────────────────────────────────────
info "Installing system dependencies..."
apt-get install -y -qq curl build-essential ffmpeg nginx ufw rsync
ok "System dependencies installed."

# ── Phase 3: Node.js 22 via NodeSource ───────────────────────────────────────
NEED_NODE=true
if command -v node &>/dev/null; then
    NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
    if (( NODE_MAJOR >= 22 )); then
        info "Node.js $(node -v) already installed and sufficient."
        NEED_NODE=false
    else
        info "Node.js $(node -v) is too old (need >=22). Upgrading..."
    fi
fi
if $NEED_NODE; then
    info "Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y -qq nodejs
    ok "Node.js $(node -v) installed."
fi

# ── Phase 4: Create service user ─────────────────────────────────────────────
if id "$APP_USER" &>/dev/null; then
    info "User '$APP_USER' already exists."
else
    info "Creating service user '$APP_USER'..."
    useradd -r -m -s /bin/bash "$APP_USER"
    ok "User created."
fi

# ── Phase 5: Copy application source ─────────────────────────────────────────
info "Copying source from ${REPO_DIR}..."
mkdir -p "$APP_DIR"
rsync -a --delete \
    --exclude node_modules \
    --exclude dist \
    --exclude dist-server \
    --exclude .env \
    "${REPO_DIR}/" "${APP_DIR}/"
chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"
ok "Source copied."

# Write .env before building
info "Writing .env file..."
cat > "${APP_DIR}/.env" <<ENVEOF
OPENAI_API_KEY=${OPENAI_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
SESSION_SECRET=${SESSION_SECRET}
CORS_ORIGIN=http://${LAN_IP}
OLLAMA_CHUNK_THRESHOLD_CHARS=16000
OLLAMA_INFERENCE_TIMEOUT_MS=600000
ENVEOF
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
ok ".env written (permissions 600)."

info "Installing npm dependencies..."
sudo -u "$APP_USER" bash -c "cd ${APP_DIR} && npm ci --production=false"
ok "Dependencies installed."

info "Building application..."
sudo -u "$APP_USER" bash -c "cd ${APP_DIR} && set -a && source .env && set +a && npm run build"
ok "Application built."

# Verify build output
[[ -f "${APP_DIR}/dist/index.html" ]]     || bail "Build failed: dist/index.html not found."
[[ -f "${APP_DIR}/dist-server/index.js" ]] || bail "Build failed: dist-server/index.js not found."
ok "Build artifacts verified."

# ── Phase 6: systemd service ─────────────────────────────────────────────────
info "Installing systemd service from deploy/podreader.service..."
cp "${DEPLOY_DIR}/podreader.service" /etc/systemd/system/podreader.service

systemctl daemon-reload
systemctl enable podreader
systemctl start podreader
ok "podreader.service enabled and started."

# Wait briefly then verify
sleep 3
if systemctl is-active --quiet podreader; then
    ok "Service is running."
else
    warn "Service may not have started. Check: journalctl -u podreader -n 30"
fi

# ── Phase 7: Nginx reverse proxy (HTTP only, LAN) ───────────────────────────
info "Configuring Nginx from deploy/nginx-podreader.conf..."

# Substitute variables in the nginx template
sed -e "s|\${LAN_IP}|${LAN_IP}|g" \
    -e "s|\${APP_DIR}|${APP_DIR}|g" \
    "${DEPLOY_DIR}/nginx-podreader.conf" \
    > /etc/nginx/sites-available/podreader

ln -sf /etc/nginx/sites-available/podreader /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Grant Nginx read access to frontend build
chmod o+x "/home/${APP_USER}"
chmod o+x "${APP_DIR}"
chmod -R o+r "${APP_DIR}/dist"

nginx -t || bail "Nginx config test failed."
systemctl reload nginx
ok "Nginx configured (HTTP on port 80)."

# ── Phase 8: Firewall ────────────────────────────────────────────────────────
info "Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw --force enable
ok "Firewall enabled (SSH + HTTP only)."

# ── Phase 9: Log management ─────────────────────────────────────────────────
info "Configuring journal log limits..."
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/podreader.conf <<'JEOF'
[Journal]
SystemMaxUse=500M
MaxRetentionSec=30day
JEOF
systemctl restart systemd-journald
ok "Journal log limits set (500M, 30 days)."

# ── Phase 10: SWAP setup ────────────────────────────────────────────────────
CURRENT_SWAP_MB=$(free -m | awk '/^Swap:/ {print $2}')
if (( CURRENT_SWAP_MB >= 4000 )); then
    info "Existing swap is ${CURRENT_SWAP_MB}MB — sufficient, skipping swapfile creation."
else
    if ! swapon --show | grep -q '/swapfile'; then
        info "Creating 4 GB swapfile..."
        fallocate -l 4G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        if ! grep -q '/swapfile' /etc/fstab; then
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
        fi
        ok "Swapfile created and persisted."
    else
        info "Swapfile already exists."
    fi
fi

# ── Phase 11: Kernel tuning ─────────────────────────────────────────────────
info "Tuning kernel parameters..."
sysctl_set() {
    local key="$1" val="$2"
    sysctl -w "${key}=${val}" >/dev/null
    grep -q "^${key}" /etc/sysctl.conf 2>/dev/null \
        && sed -i "s/^${key}.*/${key}=${val}/" /etc/sysctl.conf \
        || echo "${key}=${val}" >> /etc/sysctl.conf
}
sysctl_set vm.swappiness 10
sysctl_set net.core.somaxconn 1024
sysctl_set net.ipv4.tcp_tw_reuse 1
sysctl_set net.ipv4.tcp_fin_timeout 30
ok "Kernel parameters tuned."

# ── Phase 12: Ollama (optional local LLM) ───────────────────────────────────
if [[ "$INSTALL_OLLAMA" == "y" ]]; then
    info "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    ok "Ollama installed."

    # Determine physical core count for thread pinning
    PHYS_CORES=$(lscpu | awk '/^Core\(s\) per socket:/ {print $NF}')
    PHYS_CORES="${PHYS_CORES:-2}"
    info "Detected ${PHYS_CORES} physical cores."

    # Configure Ollama systemd override
    info "Configuring Ollama environment..."
    mkdir -p /etc/systemd/system/ollama.service.d
    cat > /etc/systemd/system/ollama.service.d/override.conf <<OLEOF
[Service]
Environment="OLLAMA_NUM_THREAD=${PHYS_CORES}"
Environment="OLLAMA_MMAP=1"
Environment="OLLAMA_KEEP_ALIVE=0"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
OLEOF
    systemctl daemon-reload
    systemctl enable ollama
    systemctl restart ollama
    ok "Ollama service configured and started."

    # Wait for Ollama to be ready
    info "Waiting for Ollama to start..."
    for i in {1..30}; do
        if curl -sf http://localhost:11434/api/tags &>/dev/null; then
            break
        fi
        sleep 1
    done

    info "Pulling qwen2.5:3b-instruct model..."
    ollama pull qwen2.5:3b-instruct || warn "Model pull failed. Run manually: ollama pull qwen2.5:3b-instruct"

    # Create optimised Modelfile from template
    MODELFILE_PATH="/home/${APP_USER}/Modelfile"
    sed "s/\${PHYS_CORES}/${PHYS_CORES}/g" "${DEPLOY_DIR}/Modelfile" > "$MODELFILE_PATH"
    chown "${APP_USER}:${APP_USER}" "$MODELFILE_PATH"

    ollama create podreader-summariser -f "$MODELFILE_PATH" \
        || warn "Model creation failed. Run manually: ollama create podreader-summariser -f ${MODELFILE_PATH}"

    # Check SIMD capability
    info "CPU SIMD capabilities:"
    grep -o 'avx2\|avx512f\|sse4_1' /proc/cpuinfo | sort -u || echo "  (none detected)"

    ok "Ollama setup complete."
fi

# ── Phase 13: Health check monitoring cron ───────────────────────────────────
info "Installing health check cron job..."
CRON_LINE="*/5 * * * * curl -sf http://127.0.0.1:3001/api/health > /dev/null || systemctl restart podreader"
(crontab -l 2>/dev/null | grep -v "podreader" || true; echo "$CRON_LINE") | crontab -
ok "Health check cron installed (every 5 min)."

# ── Phase 14: Final verification ─────────────────────────────────────────────
echo ""
echo "======================================"
echo "  Deployment Verification"
echo "======================================"
echo ""

check() {
    local label="$1" cmd="$2"
    if eval "$cmd" &>/dev/null; then
        ok "$label"
    else
        warn "FAILED: $label"
    fi
}

check "Node.js installed"            "node -v"
check "npm installed"                "npm -v"
check "ffmpeg installed"             "ffmpeg -version"
check "podreader service running"    "systemctl is-active --quiet podreader"
check "Nginx running"                "systemctl is-active --quiet nginx"
check "UFW active"                   "ufw status | grep -q 'Status: active'"
check "Health endpoint responds"     "curl -sf http://127.0.0.1:3001/api/health | grep -q ok"
check "Auth enforced on API"         "curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/data/feeds | grep -q 401"
check "Nginx proxying correctly"     "curl -sf http://${LAN_IP}/api/health | grep -q ok"
check "Swap active"                  "test $(free -m | awk '/^Swap:/ {print $2}') -ge 4000"

if [[ "$INSTALL_OLLAMA" == "y" ]]; then
    check "Ollama running"           "systemctl is-active --quiet ollama"
fi

echo ""
echo "======================================"
echo "  Deployment Complete"
echo "======================================"
echo ""
info "Application URL:  http://${LAN_IP}"
info "Session secret:   (stored in ${APP_DIR}/.env)"
info "Service logs:     journalctl -u podreader -f"
info "Nginx logs:       /var/log/nginx/"
echo ""
warn "IMPORTANT: Register a user account at http://${LAN_IP} after deployment."
warn "To update later:  re-run this script from the source directory"
echo ""
