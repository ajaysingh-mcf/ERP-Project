#!/bin/bash
# Self-check: verifies every permission in deploy/iam-policy-erp-app-deploy.json
# is actually live for whichever AWS CLI identity/profile you run this under.
# Safe to re-run any number of times — mutating calls are dry-run or clean up after themselves.
#
# Usage: bash deploy/test-permissions.sh [aws-cli-profile-name]
set -uo pipefail

# Without this, Git Bash/MSYS silently rewrites any argument starting with "/"
# (like our SSM parameter names, e.g. "/erp-app/test/_permtest") into a Windows
# path such as "C:/Users/.../Git/erp-app/test/_permtest" before it reaches the
# aws CLI — every SSM check below would then hit a bogus path and report a false
# AccessDenied instead of testing the real /erp-app/* resource.
export MSYS_NO_PATHCONV=1

PROFILE_ARGS=()
if [ -n "${1:-}" ]; then
  PROFILE_ARGS=(--profile "$1")
fi

REGION="ap-south-1"
ACCOUNT="157320387454"
TEST_SG="sg-0ed005f62f2449112"
PROD_SG="sg-0b47822934473fe9f"
TEST_INSTANCE="i-0d269978588f3c2da"
PROD_INSTANCE="i-0a249d3d470e693d3"
SSM_TEST_PARAM="/erp-app/test/_permtest"

PASS=0
FAIL=0

check() {
  local label="$1"
  shift
  if "$@" >/tmp/permtest_out.txt 2>&1; then
    echo "PASS  $label"
    PASS=$((PASS+1))
  else
    echo "FAIL  $label"
    sed 's/^/        /' /tmp/permtest_out.txt | head -3
    FAIL=$((FAIL+1))
  fi
}

echo "== Identity =="
aws sts get-caller-identity "${PROFILE_ARGS[@]}" --output table
echo

echo "== ECR =="
check "ecr:GetAuthorizationToken" \
  aws ecr get-login-password --region "$REGION" "${PROFILE_ARGS[@]}"
check "ecr:DescribeRepositories (erp-app)" \
  aws ecr describe-repositories --region "$REGION" "${PROFILE_ARGS[@]}" --repository-names erp-app

echo
echo "== SSM Parameter Store (/erp-app/*) =="
check "ssm:PutParameter" \
  aws ssm put-parameter --region "$REGION" "${PROFILE_ARGS[@]}" \
    --name "$SSM_TEST_PARAM" --value "ok" --type String --overwrite
check "ssm:GetParameter" \
  aws ssm get-parameter --region "$REGION" "${PROFILE_ARGS[@]}" --name "$SSM_TEST_PARAM"
check "ssm:GetParametersByPath" \
  aws ssm get-parameters-by-path --region "$REGION" "${PROFILE_ARGS[@]}" --path "/erp-app/test"
check "ssm:DeleteParameter (cleanup)" \
  aws ssm delete-parameter --region "$REGION" "${PROFILE_ARGS[@]}" --name "$SSM_TEST_PARAM"

echo
echo "== SSM Run Command (both instances) =="
check "ssm:DescribeInstanceInformation" \
  aws ssm describe-instance-information --region "$REGION" "${PROFILE_ARGS[@]}"

for pair in "test:$TEST_INSTANCE" "prod:$PROD_INSTANCE"; do
  env_name="${pair%%:*}"
  instance="${pair##*:}"
  cmd_id=$(aws ssm send-command --region "$REGION" "${PROFILE_ARGS[@]}" \
    --instance-ids "$instance" \
    --document-name "AWS-RunShellScript" \
    --comment "permission self-test" \
    --parameters 'commands=["echo permtest-ok"]' \
    --query 'Command.CommandId' --output text 2>/tmp/permtest_out.txt)
  if [ -n "$cmd_id" ] && [ "$cmd_id" != "None" ]; then
    echo "PASS  ssm:SendCommand ($env_name, command id $cmd_id)"
    PASS=$((PASS+1))
    sleep 3
    check "ssm:GetCommandInvocation ($env_name)" \
      aws ssm get-command-invocation --region "$REGION" "${PROFILE_ARGS[@]}" \
        --command-id "$cmd_id" --instance-id "$instance"
  else
    echo "FAIL  ssm:SendCommand ($env_name)"
    sed 's/^/        /' /tmp/permtest_out.txt | head -3
    FAIL=$((FAIL+1))
  fi
done

echo
echo "== Security Groups (dry-run only, no actual change) =="
for sg in "$TEST_SG" "$PROD_SG"; do
  if aws ec2 authorize-security-group-ingress --region "$REGION" "${PROFILE_ARGS[@]}" \
      --group-id "$sg" --protocol tcp --port 80 --cidr 0.0.0.0/0 --dry-run \
      >/tmp/permtest_out.txt 2>&1; then
    echo "PASS  ec2:AuthorizeSecurityGroupIngress ($sg)"
    PASS=$((PASS+1))
  elif grep -q "DryRunOperation" /tmp/permtest_out.txt; then
    echo "PASS  ec2:AuthorizeSecurityGroupIngress ($sg) [dry-run confirms allowed]"
    PASS=$((PASS+1))
  else
    echo "FAIL  ec2:AuthorizeSecurityGroupIngress ($sg)"
    sed 's/^/        /' /tmp/permtest_out.txt | head -3
    FAIL=$((FAIL+1))
  fi
done

echo
echo "== EC2 read-only =="
check "ec2:DescribeInstances" \
  aws ec2 describe-instances --region "$REGION" "${PROFILE_ARGS[@]}" \
    --instance-ids "$TEST_INSTANCE" "$PROD_INSTANCE"
check "ec2:DescribeImages" \
  aws ec2 describe-images --region "$REGION" "${PROFILE_ARGS[@]}" --image-ids ami-01a18c38ece67e620

echo
echo "== CloudWatch Logs / Metrics read-only =="
check "logs:DescribeLogGroups" \
  aws logs describe-log-groups --region "$REGION" "${PROFILE_ARGS[@]}"
check "cloudwatch:ListMetrics" \
  aws cloudwatch list-metrics --region "$REGION" "${PROFILE_ARGS[@]}" --namespace AWS/EC2

echo
echo "=================================================="
echo "Result: $PASS passed, $FAIL failed"
echo "=================================================="
[ "$FAIL" -eq 0 ]
