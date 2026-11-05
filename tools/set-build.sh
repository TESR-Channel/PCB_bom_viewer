#!/bin/sh
# Set the cache-busting build tag on every module import + index.html (run before each deploy).
# Usage: tools/set-build.sh 20261107a
set -e
cd "$(dirname "$0")/.."
B="${1:?build tag, e.g. 20261107a}"
sed -i -E "s#\?b=[0-9A-Za-z]+#?b=$B#g" index.html js/*.js
grep -c "?b=$B" index.html js/*.js | grep -v ':0$'
