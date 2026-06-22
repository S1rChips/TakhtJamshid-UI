#!/usr/bin/env bash
# ============================================================
#  TakhtJamshid Panel - Linux installer
#  Installs to /opt/takhtjamshid, sets up a venv + systemd
#  service, downloads Xray, and installs the `tj-ui` command.
#  Usage:  sudo bash install.sh
# ============================================================
set -e

REPO="https://github.com/S1rChips/TakhtJamshid-UI"
INSTALL_DIR="/opt/takhtjamshid"
SERVICE="takhtjamshid"
PORT="${TJ_PORT:-2053}"

GREEN='\033[0;32m'; RED='\033[0;31m'; BLUE='\033[0;36m'; PURPLE='\033[0;35m'; NC='\033[0m'

clear
echo -e "${PURPLE}"
cat << "EOF"
   ______      __   __  __    _              _     _     __
  /_  __/___ _/ /__/ /_/ /   (_)___ _____ _ (_)__ ( )___/ /
   / / / __ `/ //_/ __/ /   / / __ `/ __ `/ / (_-</// _  /
  /_/  \__,_/_/|_|\__/_/   /_/\__,_/_/ /_/ /_/___( )\__,_/
                  TakhtJamshid  Xray Panel
EOF
echo -e "${NC}"

[ "$(id -u)" -eq 0 ] || { echo -e "${RED}Please run as root: sudo bash install.sh${NC}"; exit 1; }

echo -e "${BLUE}==> Installing system dependencies${NC}"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y python3 python3-venv python3-pip git curl unzip
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y python3 python3-pip git curl unzip
elif command -v yum >/dev/null 2>&1; then
  yum install -y python3 python3-pip git curl unzip
elif command -v pacman >/dev/null 2>&1; then
  pacman -Sy --noconfirm python python-pip git curl unzip
else
  echo -e "${RED}Unsupported package manager.${NC}"; exit 1
fi

echo -e "${BLUE}==> Fetching panel source -> $INSTALL_DIR${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$INSTALL_DIR"
if [ -f "$SCRIPT_DIR/app.py" ]; then
  cp -rf "$SCRIPT_DIR/." "$INSTALL_DIR/"
elif [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" pull --ff-only || true
else
  git clone "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

echo -e "${BLUE}==> Creating Python virtual environment${NC}"
python3 -m venv venv
./venv/bin/pip install --upgrade pip setuptools wheel >/dev/null
./venv/bin/pip install -r requirements.txt

echo -e "${BLUE}==> Downloading Xray core${NC}"
./venv/bin/python -c "import xray_core; ok,msg=xray_core.ensure_binary(); print('xray:', msg)" \
  || echo -e "${RED}Xray download failed - you can install it later from the panel UI.${NC}"

echo -e "${BLUE}==> Installing systemd service${NC}"
cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=TakhtJamshid Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
Environment=TJ_PORT=${PORT}
ExecStart=${INSTALL_DIR}/venv/bin/python ${INSTALL_DIR}/app.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo -e "${BLUE}==> Installing tj-ui management command${NC}"
install -m 0755 "$INSTALL_DIR/tj-ui" /usr/local/bin/tj-ui
sed -i "s|__INSTALL_DIR__|${INSTALL_DIR}|g; s|__SERVICE__|${SERVICE}|g" /usr/local/bin/tj-ui

systemctl daemon-reload
systemctl enable "${SERVICE}" >/dev/null 2>&1 || true
systemctl restart "${SERVICE}"

IP=$(curl -s4 ifconfig.me 2>/dev/null || echo "your-server-ip")
echo -e "${GREEN}============================================================"
echo "  TakhtJamshid installed!"
echo "  URL : http://${IP}:${PORT}"
echo "  User: admin   Pass: admin   (change it in Settings)"
echo ""
echo "  Manage with:  tj-ui            (interactive menu)"
echo "                tj-ui status / restart / update / log"
echo -e "============================================================${NC}"
