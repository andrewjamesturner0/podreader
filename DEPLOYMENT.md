# PodReader — Production Deployment Guide

Deploy PodReader on a bare Ubuntu 24.04 LTS server. This guide covers
every step from a fresh OS install to a running, TLS-secured production
instance behind Nginx.

## Automated Deployment

For a quick automated deployment on Ubuntu 24.04 LTS:

```bash
sudo bash deploy/deploy.sh
```

This handles all steps below automatically. The config files used by the
script live in `deploy/`:

| File | Purpose |
|------|---------|
| `deploy/deploy.sh` | Full server setup script |
| `deploy/redeploy.sh` | Quick update (sync build artifacts + restart) |
| `deploy/podreader.service` | systemd unit file |
| `deploy/nginx-podreader.conf` | Nginx reverse proxy config (template) |
| `deploy/Modelfile` | Ollama model config (template) |

For manual step-by-step deployment, continue below.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Server Preparation](#2-server-preparation)
3. [Install System Dependencies](#3-install-system-dependencies)
4. [Install Node.js](#4-install-nodejs)
5. [Create a Service User](#5-create-a-service-user)
6. [Clone and Build the Application](#6-clone-and-build-the-application)
7. [Configure Environment Variables](#7-configure-environment-variables)
8. [Test the Build Locally](#8-test-the-build-locally)
9. [Set Up systemd Service](#9-set-up-systemd-service)
10. [Set Up Nginx Reverse Proxy](#10-set-up-nginx-reverse-proxy)
11. [Obtain TLS Certificate with Certbot](#11-obtain-tls-certificate-with-certbot)
12. [Firewall Configuration](#12-firewall-configuration)
13. [Log Management](#13-log-management)
14. [Updating the Application](#14-updating-the-application)
15. [Monitoring and Health Checks](#15-monitoring-and-health-checks)
16. [Troubleshooting](#16-troubleshooting)
17. [Security Checklist](#17-security-checklist)

---

## 1. Prerequisites

Before you begin, ensure you have:

- A server running **Ubuntu 24.04 LTS** with root or sudo access
- A **domain name** pointed at the server's public IP (e.g. `podreader.example.com`)
- **API keys** for at least one of:
  - OpenAI (required for transcription via Whisper; also used for GPT summarisation)
  - Anthropic (used for Claude summarisation)
- SSH access to the server

### Hardware Requirements

| Resource | Minimum   | Recommended |
|----------|-----------|-------------|
| CPU      | 1 vCPU    | 2 vCPUs     |
| RAM      | 1 GB      | 2 GB        |
| Disk     | 10 GB     | 20 GB       |

Disk space is important because audio transcription downloads podcast files
to `/tmp` temporarily. Large podcast episodes can be several hundred MB.
Temp files are cleaned up after each transcription.

---

## 2. Server Preparation

Update the system and reboot if a kernel update was applied:

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot  # if kernel was updated
```

Set the timezone (optional but recommended for log clarity):

```bash
sudo timedatectl set-timezone UTC
```

---

## 3. Install System Dependencies

PodReader requires **ffmpeg** for audio processing (re-encoding and
chunking podcast audio before sending to the Whisper API). The npm package
`ffmpeg-static` bundles a static ffmpeg binary, but having a system ffmpeg
as a fallback is good practice:

```bash
sudo apt install -y git curl build-essential ffmpeg
```

Verify ffmpeg is available:

```bash
ffmpeg -version
```

---

## 4. Install Node.js

PodReader requires **Node.js 20 or later** (it uses `Readable.fromWeb`,
`crypto.randomUUID`, native `fetch`, and ES module support). Install via
the NodeSource repository:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node -v   # should print v22.x.x or higher
npm -v    # should print 10.x.x or higher
```

---

## 5. Create a Service User

Run PodReader under a dedicated non-root user:

```bash
sudo useradd -r -m -s /bin/bash podreader
```

---

## 6. Clone and Build the Application

Switch to the service user and clone the repository:

```bash
sudo -u podreader -i

# Clone (replace with your actual repo URL)
git clone https://github.com/your-org/podreader.git ~/podreader
cd ~/podreader

# Install dependencies
npm ci --production=false

# Build (compiles frontend + server TypeScript)
npm run build
```

The build produces two output directories:

| Directory      | Contents                              |
|---------------|---------------------------------------|
| `dist/`       | Vite-built frontend static assets     |
| `dist-server/`| Compiled Express server (ES modules)  |

Verify the build succeeded:

```bash
ls dist/index.html          # frontend entry point
ls dist-server/index.js     # server entry point
```

Exit the service user shell:

```bash
exit
```

---

## 7. Configure Environment Variables

Create the `.env` file from the provided template:

```bash
sudo -u podreader cp /home/podreader/podreader/.env.example \
                      /home/podreader/podreader/.env
sudo -u podreader chmod 600 /home/podreader/podreader/.env
```

Edit the file:

```bash
sudo -u podreader nano /home/podreader/podreader/.env
```

Set the following values:

```dotenv
# Required — at least OPENAI_API_KEY is needed for transcription.
# Set ANTHROPIC_API_KEY if you want to use Claude for summarisation.
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Required in production — secret used to sign session cookies.
# Generate a strong random value:
#   openssl rand -hex 32
SESSION_SECRET=your-random-secret-here

# Required in production — your domain, with https.
CORS_ORIGIN=https://podreader.example.com
```

### Generating a strong SESSION_SECRET

```bash
openssl rand -hex 32
```

---

## 8. Test the Build Locally

Before configuring systemd, verify the production build starts correctly:

```bash
sudo -u podreader -i
cd ~/podreader

# Load environment variables and start
set -a && source .env && set +a
node dist-server/index.js
```

You should see:

```
Server running on http://localhost:3001
```

Test the health endpoint from another terminal:

```bash
curl http://localhost:3001/api/health
# Expected: {"status":"ok"}
```

Test that auth is enforced on protected endpoints:

```bash
curl http://localhost:3001/api/feed?url=https://example.com
# Expected: {"error":"Not logged in"}
```

Stop the test server with Ctrl+C, then exit:

```bash
exit
```

---

## 9. Set Up systemd Service

Create a systemd unit file so PodReader starts on boot and restarts on
failure:

```bash
sudo tee /etc/systemd/system/podreader.service > /dev/null << 'EOF'
[Unit]
Description=PodReader - Podcast Summariser
Documentation=https://github.com/your-org/podreader
After=network.target

[Service]
Type=simple
User=podreader
Group=podreader
WorkingDirectory=/home/podreader/podreader
EnvironmentFile=/home/podreader/podreader/.env
ExecStart=/usr/bin/node dist-server/index.js

# Restart policy
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=5

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/tmp
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# Resource limits
LimitNOFILE=65536
MemoryMax=1G

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=podreader

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable podreader
sudo systemctl start podreader
```

Check status:

```bash
sudo systemctl status podreader
```

View logs:

```bash
sudo journalctl -u podreader -f
```

---

## 10. Set Up Nginx Reverse Proxy

Install Nginx:

```bash
sudo apt install -y nginx
```

Create the site configuration:

```bash
sudo tee /etc/nginx/sites-available/podreader > /dev/null << 'EOF'
server {
    listen 80;
    server_name podreader.example.com;

    # Redirect all HTTP to HTTPS (Certbot will also add this)
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name podreader.example.com;

    # TLS certificates (Certbot will populate these — see step 11)
    # ssl_certificate /etc/letsencrypt/live/podreader.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/podreader.example.com/privkey.pem;

    # Security headers (defense in depth — the app also sets these via Helmet)
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # HSTS — uncomment after confirming TLS works correctly
    # add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Request size limit — matches the app's 5MB JSON body limit,
    # but allow larger for audio-related proxied requests
    client_max_body_size 10m;

    # Timeouts — transcription can take several minutes for long episodes
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    proxy_connect_timeout 30s;

    # API routes — proxy to Express
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for long-running transcription requests
        proxy_buffering off;
    }

    # Static frontend assets — serve directly from Nginx for performance
    location / {
        root /home/podreader/podreader/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets aggressively (Vite hashes filenames)
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # Deny access to dotfiles
    location ~ /\. {
        deny all;
    }
}
EOF
```

**Replace `podreader.example.com`** with your actual domain in the config
above.

Enable the site and test the config:

```bash
sudo ln -sf /etc/nginx/sites-available/podreader /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Grant Nginx read access to the frontend build directory:

```bash
sudo chmod o+x /home/podreader
sudo chmod o+x /home/podreader/podreader
sudo chmod -R o+r /home/podreader/podreader/dist
```

---

## 11. Obtain TLS Certificate with Certbot

Install Certbot with the Nginx plugin:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Obtain and auto-configure the certificate:

```bash
sudo certbot --nginx -d podreader.example.com
```

Certbot will:
- Obtain a Let's Encrypt certificate
- Modify the Nginx config to add `ssl_certificate` directives
- Set up automatic renewal via a systemd timer

Verify auto-renewal is scheduled:

```bash
sudo systemctl list-timers | grep certbot
```

Test renewal:

```bash
sudo certbot renew --dry-run
```

After Certbot has configured TLS, uncomment the HSTS header in the Nginx
config and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 12. Firewall Configuration

Configure UFW to allow only SSH, HTTP, and HTTPS:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Verify port 3001 is **not** exposed externally (it should only be
accessible via the Nginx reverse proxy on localhost):

```bash
sudo ufw status verbose | grep 3001
# Should return nothing — port 3001 is not in the rules
```

---

## 13. Log Management

Application logs go to the systemd journal. View them with:

```bash
# Follow live logs
sudo journalctl -u podreader -f

# View last 100 lines
sudo journalctl -u podreader -n 100

# View logs since a specific time
sudo journalctl -u podreader --since "2025-01-01 00:00:00"

# View only errors
sudo journalctl -u podreader -p err
```

### Log rotation

systemd journal has built-in rotation. To configure limits, edit
`/etc/systemd/journald.conf`:

```ini
[Journal]
SystemMaxUse=500M
MaxRetentionSec=30day
```

Then restart journald:

```bash
sudo systemctl restart systemd-journald
```

### Nginx logs

Nginx logs are at:
- Access log: `/var/log/nginx/access.log`
- Error log: `/var/log/nginx/error.log`

These are rotated automatically by logrotate.

---

## 14. Updating the Application

To deploy a new version:

```bash
# Switch to service user
sudo -u podreader -i
cd ~/podreader

# Pull latest code
git pull origin main

# Install any new/updated dependencies
npm ci --production=false

# Rebuild (frontend + server)
npm run build

exit

# Restart the service
sudo systemctl restart podreader

# Verify it started correctly
sudo systemctl status podreader
sudo journalctl -u podreader -n 20
```

### Zero-downtime considerations

PodReader is a single-process Node.js server, so restarts cause a brief
interruption (typically under 2 seconds). For a personal tool this is
fine. If zero-downtime is needed, consider:

- Running two instances on different ports with Nginx upstream load balancing
- Using PM2 with cluster mode (`pm2 start dist-server/index.js -i 2`)

---

## 15. Monitoring and Health Checks

### Health endpoint

The `/api/health` endpoint is unauthenticated and returns `{"status":"ok"}`.
Use it for uptime monitoring:

```bash
curl -sf https://podreader.example.com/api/health || echo "DOWN"
```

### Simple cron-based monitoring

Add a cron job that alerts you if the service is down:

```bash
sudo crontab -e
```

Add:

```
*/5 * * * * curl -sf https://podreader.example.com/api/health > /dev/null || systemctl restart podreader
```

This checks the health endpoint every 5 minutes and restarts the service
if it's unresponsive.

### Disk space monitoring

Transcription temporarily downloads audio files to `/tmp`. Monitor disk
usage:

```bash
df -h /tmp
```

If using `PrivateTmp=true` in the systemd unit (configured above), each
service invocation gets its own tmp namespace, and files are cleaned when
the service stops.

### Process monitoring

Check if the Node.js process is running:

```bash
sudo systemctl is-active podreader
```

---

## 16. Troubleshooting

### Service won't start

```bash
sudo journalctl -u podreader -n 50 --no-pager
```

Common causes:
- **Missing `.env` file or env vars**: Check that `/home/podreader/podreader/.env` exists and is readable by the `podreader` user.
- **Port 3001 in use**: Check with `sudo lsof -i :3001`.
- **Missing `dist-server/index.js`**: Rebuild with `npm run build`.
- **Node.js too old**: Ensure Node.js 20+.

### "Unauthorized" on all API requests

- Auth is now session-based (username + password). Ensure you have registered an account and are logged in.
- Check that `SESSION_SECRET` is set in `.env` — the server will refuse to start without it in production.
- Check that the frontend is serving the latest build (clear browser cache or hard-refresh).

### Transcription fails

- Verify `OPENAI_API_KEY` is set and valid.
- Check that ffmpeg is available: `ffmpeg -version` (though the app bundles ffmpeg-static).
- Check disk space: `df -h /tmp`. Large podcast episodes need several hundred MB of temp space.
- Check the logs for the specific error: `sudo journalctl -u podreader -n 50`.

### Summarisation fails

- If using OpenAI: verify `OPENAI_API_KEY` is valid.
- If using Anthropic: verify `ANTHROPIC_API_KEY` is valid.
- Check the logs: the server logs the full error internally while returning a generic message to the client.

### Nginx 502 Bad Gateway

- Check that the PodReader service is running: `sudo systemctl status podreader`.
- Check that it's listening on port 3001: `curl http://127.0.0.1:3001/api/health`.
- Check Nginx error log: `sudo tail -20 /var/log/nginx/error.log`.

### Nginx 504 Gateway Timeout

Transcription of long podcast episodes can take several minutes. The Nginx
config above sets `proxy_read_timeout 600s` (10 minutes). If episodes are
very long, increase this value.

### CORS errors in browser console

Ensure `CORS_ORIGIN` in `.env` exactly matches the URL in your browser's
address bar, including the scheme (`https://`) and no trailing slash:

```dotenv
# Correct
CORS_ORIGIN=https://podreader.example.com

# Wrong — trailing slash
CORS_ORIGIN=https://podreader.example.com/

# Wrong — missing scheme
CORS_ORIGIN=podreader.example.com
```

After changing `CORS_ORIGIN`, restart the service:

```bash
sudo systemctl restart podreader
```

---

## 17. Security Checklist

Before exposing the server to the internet, verify:

- [ ] **TLS is active** — site loads via `https://`, certificate is valid
- [ ] **HSTS header is set** — uncommented in Nginx config after confirming TLS
- [ ] **SESSION_SECRET is set** — a strong random value (at least 32 hex characters)
- [ ] **CORS_ORIGIN is set** — locked to your specific domain, not `*`
- [ ] **API keys are in .env only** — never committed to git, file permissions are `600`
- [ ] **Port 3001 is not exposed** — only accessible via Nginx on localhost
- [ ] **UFW is enabled** — only SSH, HTTP, and HTTPS are allowed inbound
- [ ] **Service runs as non-root** — the `podreader` user, not `root`
- [ ] **systemd hardening is active** — `NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`
- [ ] **Rate limiting is active** — 100 req/min general, 5/min transcribe, 10/min summarise
- [ ] **Helmet security headers are active** — check with `curl -I https://podreader.example.com`
- [ ] **Automatic TLS renewal** — `sudo certbot renew --dry-run` succeeds

---

## Architecture Overview (Production)

```
Internet
   │
   ▼
┌──────────────────────────────┐
│  UFW Firewall                │
│  Allow: 22, 80, 443         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Nginx (ports 80/443)        │
│  • TLS termination           │
│  • Static file serving       │
│  • Reverse proxy /api/       │
│    → http://127.0.0.1:3001   │
└──────────────┬───────────────┘
               │ (localhost only)
               ▼
┌──────────────────────────────┐
│  Node.js / Express (:3001)   │
│  • Helmet security headers   │
│  • Rate limiting             │
│  • Session-based auth        │
│  • CORS restrictions         │
│  • SSRF-protected proxying   │
│  • API relay (OpenAI,        │
│    Anthropic)                │
└──────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│  External APIs               │
│  • OpenAI (Whisper, GPT)     │
│  • Anthropic (Claude)        │
│  • Podcast RSS feeds         │
└──────────────────────────────┘
```

All user data (feeds, episodes, transcripts, summaries) is stored in a
server-side **SQLite** database. Sessions are also persisted in SQLite.
