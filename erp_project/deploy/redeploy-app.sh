#!/bin/bash
# Repeatable app-only redeploy, run by CI on every push (after bootstrap-instance.sh
# has provisioned the box once). Does NOT touch nginx/Certbot/CloudWatch Agent setup.
# Usage on the box: sudo bash redeploy-app.sh <test|prod>
set -euo pipefail

ENV_NAME="${1:?Usage: redeploy-app.sh <test|prod>}"
AWS_REGION="ap-south-1"
ECR_REPO_URI="157320387454.dkr.ecr.ap-south-1.amazonaws.com/erp-app"

case "$ENV_NAME" in
  test) IMAGE_TAG="test" ;;
  prod) IMAGE_TAG="prod" ;;
  *) echo "Unknown env '$ENV_NAME' (expected test or prod)" >&2; exit 1 ;;
esac

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ECR_REPO_URI%%/*}"

docker pull "${ECR_REPO_URI}:${IMAGE_TAG}"
docker rm -f erp 2>/dev/null || true
docker run -d \
  --name erp \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --env-file /etc/erp/env \
  -v /var/log/erp:/app/logs \
  "${ECR_REPO_URI}:${IMAGE_TAG}"

docker image prune -f
