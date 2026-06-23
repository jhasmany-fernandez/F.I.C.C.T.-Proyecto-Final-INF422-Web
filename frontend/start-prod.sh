#!/bin/sh
set -eu

npm run build
exec npm run start
