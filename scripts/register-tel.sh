#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP_FILE="${DESKTOP_DIR}/linkus-linux-dev.desktop"
ELECTRON_BIN="${PROJECT_DIR}/node_modules/.bin/electron"

if [ ! -x "${ELECTRON_BIN}" ]; then
  echo "Electron no está instalado en ${ELECTRON_BIN}. Ejecuta npm install primero." >&2
  exit 1
fi

mkdir -p "${DESKTOP_DIR}"

cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Name=Linkus Linux
Icon=${PROJECT_DIR}/icon.png
Exec=${ELECTRON_BIN} --no-sandbox ${PROJECT_DIR} %u
Terminal=false
Type=Application
Categories=Network;
MimeType=x-scheme-handler/tel;
NoDisplay=false
EOF

update-desktop-database "${DESKTOP_DIR}" >/dev/null 2>&1 || true
xdg-mime default "$(basename "${DESKTOP_FILE}")" x-scheme-handler/tel >/dev/null 2>&1 || true

echo "Registrado handler tel en ${DESKTOP_FILE}. Si no funciona, ejecuta:"
echo "  xdg-mime default $(basename "${DESKTOP_FILE}") x-scheme-handler/tel"
