# AWS Setup Commands (hosting account)

> **Architecture update (2026-07-07):** for testing, the ALB + Auto Scaling Group
> described in steps 6-7 below were torn down in favor of a single standalone EC2
> instance with an **Elastic IP** (`35.154.13.21`) attached directly (no load
> balancer). Deploys now go out via `aws ssm send-command` targeting
> `Key=tag:Name,Values=erp-app` instead of an ASG instance refresh — see
> `.github/workflows/deploy.yml`. Steps 6-7 (ALB/ASG) are left below for reference
> if load balancing/redundancy is reintroduced later; they are not currently live.
>
> **Domain + HTTPS added (same day):** the app is reachable at
> `https://erp.mcaffeine.com` via **nginx** running directly on the instance as a
> reverse proxy in front of the container (`nginx` on 80/443 → container on
> `127.0.0.1:3000`, not exposed publicly). TLS is a free **Let's Encrypt**
> certificate via Certbot, auto-renewed by a systemd timer (`certbot-renew.timer`).
> `AUTH_URL=https://erp.mcaffeine.com` is set in SSM (`/erp/prod/AUTH_URL`) so
> NextAuth doesn't have to derive its own origin — without it, Auth.js fell back
> to the container's internal bind address (`0.0.0.0:3000`) in generated callback
> URLs, breaking Google Sign-In. All of this is baked into `deploy/user-data.sh`
> so a replacement instance reproduces it automatically (DNS must already point
> at the new instance's Elastic IP before Certbot runs).

Run these yourself against the **hosting** AWS account (not the bucket-access account
currently in your default CLI profile). Replace anything in `<ANGLE_BRACKETS>`.
Work top to bottom — later steps depend on IDs from earlier ones.

After you finish, send back the values noted in **"Report back"** at the end of each
section so I can fill them into `deploy/user-data.sh` and the CI workflow.

---

## 1. ECR repository

```
aws ecr create-repository --repository-name erp-app --region <AWS_REGION>
```
**Report back:** the `repositoryUri` from the output (e.g. `123456789012.dkr.ecr.ap-south-1.amazonaws.com/erp-app`).

## 2. Networking (VPC, subnets, security groups)

If you don't already have a VPC you want to use:
```
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --region <AWS_REGION>
# create 2 public subnets (for ALB) + 2 private subnets (for EC2/RDS) across 2 AZs
# attach an internet gateway + route table for the public subnets
# (NAT gateway needed in private subnets if EC2 needs outbound internet for ECR/SSM pulls,
#  or use VPC endpoints for ECR/S3/SSM instead — cheaper for a small fleet)
```

Security groups:
```
aws ec2 create-security-group --group-name alb-sg --description "ALB" --vpc-id <VPC_ID>
aws ec2 authorize-security-group-ingress --group-id <ALB_SG_ID> --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id <ALB_SG_ID> --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 create-security-group --group-name ec2-sg --description "EC2 app" --vpc-id <VPC_ID>
aws ec2 authorize-security-group-ingress --group-id <EC2_SG_ID> --protocol tcp --port 3000 --source-group <ALB_SG_ID>
# add port 22 from your IP only if you need SSH; prefer SSM Session Manager instead (no inbound needed)

aws ec2 create-security-group --group-name rds-sg --description "RDS" --vpc-id <VPC_ID>
aws ec2 authorize-security-group-ingress --group-id <RDS_SG_ID> --protocol tcp --port 3306 --source-group <EC2_SG_ID>
```
**Report back:** `VPC_ID`, public subnet IDs (x2), private subnet IDs (x2), `ALB_SG_ID`, `EC2_SG_ID`, `RDS_SG_ID`.

## 3. RDS MariaDB

Skip this if you already have a MariaDB RDS instance the app currently uses (check `DB_HOST` in your `.env`) — just make sure `rds-sg` above is attached to it, or that its existing security group allows inbound 3306 from `EC2_SG_ID`.

Otherwise:
```
aws rds create-db-subnet-group --db-subnet-group-name erp-db-subnets \
  --subnet-ids <PRIVATE_SUBNET_1> <PRIVATE_SUBNET_2> --db-subnet-group-description "ERP RDS subnets"

aws rds create-db-instance \
  --db-instance-identifier erp-mariadb \
  --db-instance-class db.t4g.micro \
  --engine mariadb \
  --master-username <DB_USER> \
  --master-user-password <DB_PASSWORD> \
  --allocated-storage 20 \
  --vpc-security-group-ids <RDS_SG_ID> \
  --db-subnet-group-name erp-db-subnets \
  --no-publicly-accessible
```
**Report back:** the RDS endpoint (`aws rds describe-db-instances --db-instance-identifier erp-mariadb --query 'DBInstances[0].Endpoint.Address'`).

## 4. Secrets in SSM Parameter Store

Push every value currently in your `.env` under `/erp/prod/<NAME>`:
```
aws ssm put-parameter --name /erp/prod/DB_HOST --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/DB_USER --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/DB_PASSWORD --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/DB_NAME --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/AUTH_SECRET --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/GOOGLE_CLIENT_ID --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/GOOGLE_CLIENT_SECRET --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/GMAIL_USER --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/GMAIL_APP_PASSWORD --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/REGION_AWS --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/ACCESS_KEY_ID_AWS --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/SECRET_ACCESS_KEY_AWS --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/S3_BUCKET_FILES_AWS --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/S3_BUCKET_EVENTS_AWS --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/UNIWARE_BASE_URL --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/UNIWARE_USER_NAME --value "<value>" --type SecureString --region <AWS_REGION>
aws ssm put-parameter --name /erp/prod/UNIWARE_PASSWORD --value "<value>" --type SecureString --region <AWS_REGION>
```
Note: `ACCESS_KEY_ID_AWS`/`SECRET_ACCESS_KEY_AWS` here are for the app's own S3 bucket access (the *other* AWS account) — unrelated to the EC2 instance role below.

## 5. IAM instance role

The EC2 instance needs permission to read the SSM parameters and pull from ECR:
```
aws iam create-role --role-name erp-ec2-role --assume-role-policy-document '{
  "Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]
}'
aws iam attach-role-policy --role-name erp-ec2-role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam attach-role-policy --role-name erp-ec2-role --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy
aws iam attach-role-policy --role-name erp-ec2-role --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
# plus an inline policy scoped to ssm:GetParametersByPath on arn:aws:ssm:<region>:<account>:parameter/erp/prod/*
aws iam create-instance-profile --instance-profile-name erp-ec2-profile
aws iam add-role-to-instance-profile --instance-profile-name erp-ec2-profile --role-name erp-ec2-role
```
`AmazonSSMManagedInstanceCore` also gives you SSM Session Manager access to the instance (no SSH/bastion needed).

## 6. Launch Template

- Fill in `deploy/user-data.sh` with your real `AWS_REGION`, `ECR_REPO_URI` (from step 1), `SSM_PARAM_PATH=/erp/prod`.
- Create the Launch Template (console is easiest for this one): Amazon Linux 2023 AMI, instance type `t3.small`, IAM instance profile `erp-ec2-profile`, security group `ec2-sg`, paste the filled-in `user-data.sh` into "User data".

## 7. ALB + Target Group + Auto Scaling Group

```
aws elbv2 create-target-group --name erp-tg --protocol HTTP --port 3000 \
  --vpc-id <VPC_ID> --health-check-path /api/health --target-type instance

aws elbv2 create-load-balancer --name erp-alb --subnets <PUBLIC_SUBNET_1> <PUBLIC_SUBNET_2> \
  --security-groups <ALB_SG_ID> --scheme internet-facing

aws elbv2 create-listener --load-balancer-arn <ALB_ARN> --protocol HTTPS --port 443 \
  --certificates CertificateArn=<ACM_CERT_ARN> \
  --default-actions Type=forward,TargetGroupArn=<TG_ARN>

aws autoscaling create-auto-scaling-group --auto-scaling-group-name erp-asg \
  --launch-template LaunchTemplateId=<LT_ID>,Version='$Latest' \
  --min-size 1 --max-size 3 --desired-capacity 2 \
  --vpc-zone-identifier "<PRIVATE_SUBNET_1>,<PRIVATE_SUBNET_2>" \
  --target-group-arns <TG_ARN> \
  --health-check-type ELB --health-check-grace-period 60
```
(ACM cert must be requested/validated in Certificate Manager first, for your domain.)

## 8. Route53

Point your domain's A/ALIAS record at the ALB's DNS name.

## 9. CloudWatch alarms (optional, do after the above is live)

```
aws cloudwatch put-metric-alarm --alarm-name erp-high-cpu \
  --namespace AWS/EC2 --metric-name CPUUtilization --statistic Average \
  --period 300 --threshold 80 --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 --dimensions Name=AutoScalingGroupName,Value=erp-asg \
  --alarm-actions <SNS_TOPIC_ARN>
```

## 10. GitHub Actions OIDC role (for `.github/workflows/deploy.yml`)

So CI can push to ECR and trigger an instance refresh without long-lived AWS keys stored in GitHub:
```
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

aws iam create-role --role-name erp-gha-deploy --assume-role-policy-document '{
  "Version":"2012-10-17","Statement":[{
    "Effect":"Allow",
    "Principal":{"Federated":"arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"},
    "Action":"sts:AssumeRoleWithWebIdentity",
    "Condition":{"StringEquals":{"token.actions.githubusercontent.com:sub":"repo:<GITHUB_ORG>/<GITHUB_REPO>:ref:refs/heads/main"}}
  }]
}'
aws iam attach-role-policy --role-name erp-gha-deploy --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
# plus an inline policy allowing autoscaling:StartInstanceRefresh on the erp-asg ARN
```
Then in the GitHub repo: Settings → Secrets and variables → Actions → add secret
`AWS_DEPLOY_ROLE_ARN` = the role's ARN from the `create-role` output.

---

**Report back when done:** ECR URI, VPC/subnet/SG IDs, RDS endpoint, ALB ARN/DNS name,
Launch Template ID, Auto Scaling Group name. I'll use these to finalize
`deploy/user-data.sh` and `.github/workflows/deploy.yml` (region + ASG name).
