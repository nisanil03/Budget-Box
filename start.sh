#!/bin/sh
set -e
cd backend
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run build
npm run start

