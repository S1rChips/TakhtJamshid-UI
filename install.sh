#!/usr/bin/env bash

set -e

#######################################
# TakhtJamshid Ultimate Launcher v3
#######################################

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m'

LOG_DIR="logs"
LOG_FILE="$LOG_DIR/panel.log"

mkdir -p "$LOG_DIR"

clear

echo -e "${PURPLE}"
cat << "EOF"

████████╗ █████╗ ██╗  ██╗██╗  ██╗████████╗
╚══██╔══╝██╔══██╗██║ ██╔╝██║  ██║╚══██╔══╝
   ██║   ███████║█████╔╝ ███████║   ██║
   ██║   ██╔══██║██╔═██╗ ██╔══██║   ██║
   ██║   ██║  ██║██║  ██╗██║  ██║   ██║
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝

     TakhtJamshid Ultimate Panel
EOF

echo -e "${NC}"

#######################################
# Ctrl+C Handler
#######################################

cleanup() {
    echo
    echo -e "${RED}Stopping Panel...${NC}"
    deactivate 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

#######################################
# Go to script directory
#######################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

#######################################
# Detect package manager
#######################################

install_python() {

    if command -v python3 >/dev/null 2>&1; then
        return
    fi

    echo -e "${YELLOW}Python not found. Installing...${NC}"

    if command -v apt >/dev/null; then
        sudo apt update
        sudo apt install -y python3 python3-pip python3-venv

    elif command -v dnf >/dev/null; then
        sudo dnf install -y python3 python3-pip

    elif command -v yum >/dev/null; then
        sudo yum install -y python3 python3-pip

    elif command -v pacman >/dev/null; then
        sudo pacman -Sy --noconfirm python python-pip

    else
        echo -e "${RED}Unsupported Linux Distribution${NC}"
        exit 1
    fi
}

#######################################
# System Info
#######################################

show_system_info() {

echo -e "${CYAN}"
echo "=================================="
echo "SYSTEM STATUS"
echo "=================================="

echo "CPU : $(nproc) Cores"
echo "RAM : $(free -h | awk '/Mem:/ {print $3 "/" $2}')"
echo "Disk: $(df -h / | awk 'NR==2 {print $3 "/" $2}')"

echo "=================================="
echo -e "${NC}"
}

#######################################
# Install Python
#######################################

install_python

#######################################
# Virtual Environment
#######################################

if [ ! -d ".venv" ]; then
    echo -e "${BLUE}Creating Virtual Environment...${NC}"
    python3 -m venv .venv
fi

source .venv/bin/activate

#######################################
# Upgrade pip
#######################################

echo -e "${BLUE}Updating Pip...${NC}"

python -m pip install --upgrade \
pip setuptools wheel

#######################################
# Install dependencies
#######################################

if [ -f requirements.txt ]; then
    echo -e "${BLUE}Installing Requirements...${NC}"

    pip install -r requirements.txt
fi

#######################################
# Show System Status
#######################################

show_system_info

#######################################
# Auto Restart Loop
#######################################

while true
do

    echo -e "${GREEN}"
    echo "Starting TakhtJamshid Panel..."
    echo -e "${NC}"

    python app.py 2>&1 | tee -a "$LOG_FILE"

    EXIT_CODE=${PIPESTATUS[0]}

    echo
    echo -e "${RED}Panel stopped! Exit Code: $EXIT_CODE${NC}"

    echo -e "${YELLOW}Restarting in 5 seconds...${NC}"

    sleep 5

done