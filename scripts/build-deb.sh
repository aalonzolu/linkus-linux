#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$PROJECT_DIR"

echo "🔨 Generando paquete .deb para Ubuntu/Debian..."
echo ""

# Verificar que node_modules exista
if [ ! -d "node_modules" ]; then
  echo "⚠️  node_modules no encontrado. Ejecutando npm install..."
  npm install
fi

# Limpiar dist anterior
if [ -d "dist" ]; then
  echo "🧹 Limpiando dist/ anterior..."
  rm -rf dist
fi

# Construir deb
echo "📦 Construyendo .deb con electron-builder..."
npm run dist:deb

echo ""
echo "✅ Paquete .deb generado en:"
ls -lh dist/*.deb 2>/dev/null || echo "⚠️  No se encontró .deb en dist/"

echo ""
echo "Para instalar:"
echo "  sudo dpkg -i dist/linkus-linux_*.deb"
echo ""
echo "Para desinstalar:"
echo "  sudo apt remove linkus-linux"
