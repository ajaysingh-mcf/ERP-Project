#!/bin/bash
# Opens inbound 80/tcp and 443/tcp on both erp-app security groups. Idempotent —
# safe to re-run; a "rule already exists" response is treated as success, not a failure.
set -uo pipefail
export MSYS_NO_PATHCONV=1  # stop Git Bash from rewriting "/"-leading args as Windows paths

REGION="ap-south-1"
TEST_SG="sg-0ed005f62f2449112"
PROD_SG="sg-0b47822934473fe9f"

open_port() {
  local sg="$1" port="$2"
  local out
  out=$(aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$sg" --protocol tcp --port "$port" --cidr 0.0.0.0/0 2>&1)
  if [ $? -eq 0 ]; then
    echo "  opened $port on $sg"
  elif echo "$out" | grep -qi "already exists\|InvalidPermission.Duplicate"; then
    echo "  $port already open on $sg"
  else
    echo "  FAILED to open $port on $sg:"
    echo "$out" | sed 's/^/    /'
    return 1
  fi
}

status=0
for sg in "$TEST_SG" "$PROD_SG"; do
  echo "== $sg =="
  open_port "$sg" 80 || status=1
  open_port "$sg" 443 || status=1
done

exit $status
