#!/bin/bash
# EC2 Launch Template user-data. Runs once at instance boot (Amazon Linux 2023).
# Replace the placeholders below (AWS_REGION, ECR_REPO_URI, SSM_PARAM_PATH) before
# pasting this into the Launch Template's "User data" field.
set -euo pipefail
exec > >(tee /var/log/erp-bootstrap.log) 2>&1

AWS_REGION="ap-south-1"
ECR_REPO_URI="230235764844.dkr.ecr.ap-south-1.amazonaws.com/erp-app"
SSM_PARAM_PATH="/erp/prod"
IMAGE_TAG="latest"

echo "== Installing Docker =="
dnf update -y
dnf install -y docker
systemctl enable --now docker

echo "== Installing CloudWatch Agent =="
dnf install -y amazon-cloudwatch-agent
mkdir -p /opt/aws/amazon-cloudwatch-agent/etc
cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json <<'CWCONFIG'
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "root" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/erp/app-*.log",   "log_group_name": "/erp/app",       "log_stream_name": "{instance_id}/app",   "timezone": "UTC" },
          { "file_path": "/var/log/erp/error-*.log", "log_group_name": "/erp/app",       "log_stream_name": "{instance_id}/error", "timezone": "UTC" },
          { "file_path": "/var/log/erp-bootstrap.log","log_group_name": "/erp/bootstrap", "log_stream_name": "{instance_id}",      "timezone": "UTC" }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "ERP/EC2",
    "append_dimensions": { "InstanceId": "${aws:InstanceId}", "AutoScalingGroupName": "${aws:AutoScalingGroupName}" },
    "metrics_collected": {
      "cpu":  { "measurement": ["cpu_usage_active"], "totalcpu": true },
      "mem":  { "measurement": ["mem_used_percent"] },
      "disk": { "measurement": ["used_percent"], "resources": ["/"] }
    }
  }
}
CWCONFIG
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json

echo "== Fetching app secrets from SSM Parameter Store =="
mkdir -p /etc/erp
aws ssm get-parameters-by-path \
  --path "$SSM_PARAM_PATH" --with-decryption --region "$AWS_REGION" \
  --query 'Parameters[].[Name,Value]' --output text \
| while IFS=$'\t' read -r name value; do
    key=$(basename "$name")
    printf '%s=%s\n' "$key" "$value" >> /etc/erp/env
  done
chmod 600 /etc/erp/env

echo "== Logging in to ECR =="
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ECR_REPO_URI%%/*}"

echo "== Pulling and starting the app container =="
mkdir -p /var/log/erp
chown 999:999 /var/log/erp  # matches the container's non-root "nextjs" user (uid/gid 999)
docker pull "${ECR_REPO_URI}:${IMAGE_TAG}"
docker rm -f erp 2>/dev/null || true
docker run -d \
  --name erp \
  --restart unless-stopped \
  -p 80:3000 \
  --env-file /etc/erp/env \
  -v /var/log/erp:/app/logs \
  "${ECR_REPO_URI}:${IMAGE_TAG}"

echo "== Done =="
