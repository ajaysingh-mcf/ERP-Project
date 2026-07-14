#!/bin/bash
# Runs bootstrap-instance.sh on a live instance via `aws ssm send-command` — the
# instance fetches the script from SSM Parameter Store (pushed there by
# push-bootstrap-script.sh) rather than having it inlined into this call.
# Usage: run-bootstrap.sh <test|prod>
set -euo pipefail
export MSYS_NO_PATHCONV=1  # stop Git Bash from rewriting "/"-leading args as Windows paths

REGION="ap-south-1"
PARAM_NAME="/erp-app/scripts/bootstrap-instance"

ENV_NAME="${1:?Usage: run-bootstrap.sh <test|prod>}"
case "$ENV_NAME" in
  test) INSTANCE_ID="i-0d269978588f3c2da" ;;
  prod) INSTANCE_ID="i-0a249d3d470e693d3" ;;
  *) echo "Unknown env '$ENV_NAME' (expected test or prod)" >&2; exit 1 ;;
esac

# Built as a string (not a file://... reference) — on Git Bash/Windows, file://
# URIs never get MSYS-path-translated (it skips any arg containing "://"), so
# the AWS CLI ends up looking for a literal MSYS-style path that doesn't exist
# from Windows' point of view. Passing the JSON directly sidesteps that.
PARAMS_JSON=$(cat <<JSON
{
  "commands": [
    "aws ssm get-parameter --region ${REGION} --name '${PARAM_NAME}' --query Parameter.Value --output text > /tmp/bootstrap-instance.sh",
    "chmod +x /tmp/bootstrap-instance.sh",
    "/tmp/bootstrap-instance.sh ${ENV_NAME}"
  ]
}
JSON
)

echo "== Sending bootstrap command to $INSTANCE_ID ($ENV_NAME) =="
COMMAND_ID=$(aws ssm send-command --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "bootstrap erp-app ($ENV_NAME)" \
  --timeout-seconds 1800 \
  --parameters "$PARAMS_JSON" \
  --query 'Command.CommandId' --output text)

echo "Command ID: $COMMAND_ID"
echo "Polling for completion (installs Docker/nginx/Certbot — can take several minutes)..."

for i in $(seq 1 60); do
  sleep 10
  STATUS=$(aws ssm get-command-invocation --region "$REGION" \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query 'Status' --output text 2>/dev/null || echo "Pending")
  echo "  [$i] status: $STATUS"
  case "$STATUS" in
    Success)
      echo "== Success =="
      aws ssm get-command-invocation --region "$REGION" \
        --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
        --query 'StandardOutputContent' --output text
      exit 0
      ;;
    Failed|Cancelled|TimedOut)
      echo "== $STATUS =="
      aws ssm get-command-invocation --region "$REGION" \
        --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
        --query 'StandardErrorContent' --output text
      exit 1
      ;;
  esac
done

echo "Timed out waiting after 10 minutes. Check manually:"
echo "  aws ssm get-command-invocation --region $REGION --command-id $COMMAND_ID --instance-id $INSTANCE_ID"
exit 1
