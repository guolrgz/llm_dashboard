#!/usr/bin/env bash
# Full visual QA pass: screenshot -> pixel diff -> detailed measurements.
# Usage: bash tools/qa.sh            (writes tools/out/current.png, docs/qa-report.md, docs/diff*.png, docs/crops/)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/.."
node tools/shot.mjs "$@"
node tools/diff.mjs
node tools/reference-measure.mjs >/dev/null
echo "--- top mismatching areas ---"
sed -n '/## 9. Mismatch-pixel ranking/,/Total mismatching/p' docs/qa-report.md | head -14
