#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang. Instal Node.js LTS terlebih dahulu." >&2
  exit 1
fi
if [ ! -d node_modules ]; then npm install; fi
npm start
