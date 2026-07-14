#!/bin/bash
# Uploads deploy/bootstrap-instance.sh into SSM Parameter Store so run-bootstrap.sh
# can have the instance fetch-and-run it via a short `send-command` call, instead of
# inlining the whole ~5KB script into the command payload. Re-run this whenever
# bootstrap-instance.sh changes, before running run-bootstrap.sh.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # stop Git Bash from rewriting "/"-leading args as Windows paths

REGION="ap-south-1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARAM_NAME="/erp-app/scripts/bootstrap-instance"

# Read the file content directly rather than passing --value file://... — on
# Git Bash/Windows, file:// URIs are never MSYS-path-translated (it skips any
# arg containing "://"), so the AWS CLI ends up looking for a literal MSYS-style
# path that doesn't exist from Windows' point of view. Reading it here with a
# plain `cat` sidesteps that entirely.
SCRIPT_CONTENT="$(cat "$SCRIPT_DIR/bootstrap-instance.sh")"

aws ssm put-parameter --region "$REGION" \
  --name "$PARAM_NAME" \
  --type String \
  --tier Advanced \
  --value "$SCRIPT_CONTENT" \
  --overwrite

echo "Uploaded $SCRIPT_DIR/bootstrap-instance.sh to $PARAM_NAME"
