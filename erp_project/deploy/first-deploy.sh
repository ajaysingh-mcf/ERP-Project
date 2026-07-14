#!/bin/bash
# One-shot orchestration for the very first deploy to both erp-app instances.
# Run this once all the permissions in deploy/iam-policy-erp-app-deploy.json are
# confirmed live (deploy/test-permissions.sh all-PASS). Safe to re-run — every
# step it calls is idempotent.
#
# Usage: bash deploy/first-deploy.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1  # stop Git Bash from rewriting "/"-leading args as Windows paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


echo "############################################"
echo "# 1/4  Opening security group ports"
echo "############################################"
bash "$SCRIPT_DIR/open-ports.sh"

echo
echo "############################################"
echo "# 2/4  Pushing app secrets to SSM (test + prod)"
echo "############################################"
node "$SCRIPT_DIR/push-secrets.mjs" test
node "$SCRIPT_DIR/push-secrets.mjs" prod

echo
echo "############################################"
echo "# 3/4  Uploading bootstrap script to SSM"
echo "############################################"
bash "$SCRIPT_DIR/push-bootstrap-script.sh"

echo
echo "############################################"
echo "# 4/4  Running bootstrap on both instances"
echo "############################################"
echo "--- test ---"
bash "$SCRIPT_DIR/run-bootstrap.sh" test
echo "--- prod ---"
bash "$SCRIPT_DIR/run-bootstrap.sh" prod

echo
echo "All done. Verify:"
echo "  https://dev.erp.mcaffeine.com/api/health  (test)"
echo "  https://erp.mcaffeine.com/api/health      (prod)"
echo "(port 3000 itself is only bound to the instance's loopback interface, not reachable directly —"
echo " nginx on 80/443 is the only public path in, per bootstrap-instance.sh)"
