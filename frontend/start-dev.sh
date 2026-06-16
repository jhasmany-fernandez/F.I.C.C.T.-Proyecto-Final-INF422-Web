#!/bin/sh
set -eu

# The runtime stores .next on a persistent Docker volume.
# Rebuild on container start so the server always publishes the same assets it references.
rm -rf /app/.next/*

npm install
npm run build
exec npm run start
