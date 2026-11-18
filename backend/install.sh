#!/usr/bin/env bash
# Install the Python dependencies used by the Token Traffic backend.
#
# The runtime box has Python 3.14 without `ensurepip`, so a venv is not
# available. We vendor the packages into backend/vendor (gitignored) and put
# that directory on PYTHONPATH from run.sh / tests.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f vendor/fastapi/__init__.py ] && [ -f vendor/uvicorn/__init__.py ]; then
  echo "[backend] dependencies already vendored in backend/vendor"
  exit 0
fi

echo "[backend] installing dependencies into backend/vendor ..."
python3 -m pip install \
  --target vendor \
  --break-system-packages \
  --disable-pip-version-check \
  --quiet \
  -r requirements.txt

echo "[backend] done"
