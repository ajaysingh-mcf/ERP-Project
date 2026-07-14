#!/bin/bash
# One-time provisioning for an already-running erp-app-{test,prod} EC2 instance.
# Unlike deploy/user-data.sh (which ran at Launch Template boot time), this runs
# via `aws ssm send-command` against a box that's already up. Usage on the box:
#   sudo bash bootstrap-instance.sh <test|prod>
set -euo pipefail
exec > >(tee /var/log/erp-bootstrap.log) 2>&1

ENV_NAME="${1:?Usage: bootstrap-instance.sh <test|prod>}"
AWS_REGION="ap-south-1"
ECR_REPO_URI="157320387454.dkr.ecr.ap-south-1.amazonaws.com/erp-app"
CERTBOT_EMAIL="ajay.singh@mcaffeine.com"

case "$ENV_NAME" in
  test)
    IMAGE_TAG="test"
    SSM_PARAM_PATH="/erp-app/test"
    LOG_GROUP="/erp-app/test"
    DOMAIN="dev.erp.mcaffeine.com"
    ;;
  prod)
    IMAGE_TAG="prod"
    SSM_PARAM_PATH="/erp-app/prod"
    LOG_GROUP="/erp-app/prod"
    DOMAIN="erp.mcaffeine.com"
    ;;
  *)
    echo "Unknown env '$ENV_NAME' (expected test or prod)" >&2
    exit 1
    ;;
esac

echo "== Bootstrapping erp-app ($ENV_NAME) - domain=$DOMAIN, tag=$IMAGE_TAG =="

echo "== Installing Docker =="
dnf update -y
dnf install -y docker
systemctl enable --now docker

echo "== Installing CloudWatch Agent =="
dnf install -y amazon-cloudwatch-agent
mkdir -p /opt/aws/amazon-cloudwatch-agent/etc
cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json <<CWCONFIG
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "root" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/erp/app-*.log",   "log_group_name": "${LOG_GROUP}", "log_stream_name": "{instance_id}/app",       "timezone": "UTC" },
          { "file_path": "/var/log/erp/error-*.log", "log_group_name": "${LOG_GROUP}", "log_stream_name": "{instance_id}/error",     "timezone": "UTC" },
          { "file_path": "/var/log/erp-bootstrap.log","log_group_name": "${LOG_GROUP}", "log_stream_name": "{instance_id}/bootstrap", "timezone": "UTC" }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "ERP/EC2",
    "append_dimensions": { "InstanceId": "\${aws:InstanceId}" },
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

echo "== Fetching app secrets from SSM Parameter Store ($SSM_PARAM_PATH) =="
mkdir -p /etc/erp
: > /etc/erp/env
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
  -p 127.0.0.1:3000:3000 \
  --env-file /etc/erp/env \
  -v /var/log/erp:/app/logs \
  "${ECR_REPO_URI}:${IMAGE_TAG}"

echo "== Installing nginx + Certbot (reverse proxy + HTTPS) =="
dnf install -y nginx python3-pip
systemctl enable nginx
pip3 install certbot certbot-nginx
ln -sf /usr/local/bin/certbot /usr/bin/certbot

cat > /etc/nginx/conf.d/erp.conf <<NGINXCONF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXCONF
rm -f /etc/nginx/conf.d/default.conf
systemctl restart nginx

# Requires the domain's DNS to already point at this instance's public IP
# before this runs, or Certbot's HTTP-01 challenge will fail.
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect

cat > /etc/systemd/system/certbot-renew.service <<'EOF'
[Unit]
Description=Certbot renewal

[Service]
Type=oneshot
ExecStart=/usr/local/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF

cat > /etc/systemd/system/certbot-renew.timer <<'EOF'
[Unit]
Description=Run certbot renew twice daily

[Timer]
OnCalendar=*-*-* 03,15:00:00
RandomizedDelaySec=1800
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now certbot-renew.timer

echo "== Done ($ENV_NAME) =="
