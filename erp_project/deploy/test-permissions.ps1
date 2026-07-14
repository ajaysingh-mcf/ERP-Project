# Self-check: verifies every permission in deploy/iam-policy-erp-app-deploy.json
# is actually live for whichever AWS CLI identity/profile you run this under.
# Safe to re-run any number of times - mutating calls are dry-run or clean up after themselves.
#
# Usage:
#   .\deploy\test-permissions.ps1
#   .\deploy\test-permissions.ps1 -Profile some-profile-name

param(
    [string]$Profile = ""
)

$Region = "ap-south-1"
$TestSg = "sg-0ed005f62f2449112"
$ProdSg = "sg-0b47822934473fe9f"
$TestInstance = "i-0d269978588f3c2da"
$ProdInstance = "i-0a249d3d470e693d3"
$SsmTestParam = "/erp-app/test/_permtest"

$script:PassCount = 0
$script:FailCount = 0

function Invoke-AwsCheck {
    param(
        [string]$Label,
        [string[]]$Args
    )
    $fullArgs = $Args
    if ($Profile -ne "") { $fullArgs += @("--profile", $Profile) }
    $output = & aws @fullArgs 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PASS  $Label" -ForegroundColor Green
        $script:PassCount++
    } else {
        Write-Host "FAIL  $Label" -ForegroundColor Red
        ($output | Select-Object -First 3) | ForEach-Object { Write-Host "        $_" }
        $script:FailCount++
    }
}

Write-Host "== Identity =="
$identityArgs = @("sts", "get-caller-identity", "--output", "table")
if ($Profile -ne "") { $identityArgs += @("--profile", $Profile) }
& aws @identityArgs
Write-Host ""

Write-Host "== ECR =="
Invoke-AwsCheck "ecr:GetAuthorizationToken" @("ecr", "get-login-password", "--region", $Region)
Invoke-AwsCheck "ecr:DescribeRepositories (erp-app)" @("ecr", "describe-repositories", "--region", $Region, "--repository-names", "erp-app")

Write-Host ""
Write-Host "== SSM Parameter Store (/erp-app/*) =="
Invoke-AwsCheck "ssm:PutParameter" @("ssm", "put-parameter", "--region", $Region, "--name", $SsmTestParam, "--value", "ok", "--type", "String", "--overwrite")
Invoke-AwsCheck "ssm:GetParameter" @("ssm", "get-parameter", "--region", $Region, "--name", $SsmTestParam)
Invoke-AwsCheck "ssm:GetParametersByPath" @("ssm", "get-parameters-by-path", "--region", $Region, "--path", "/erp-app/test")
Invoke-AwsCheck "ssm:DeleteParameter (cleanup)" @("ssm", "delete-parameter", "--region", $Region, "--name", $SsmTestParam)

Write-Host ""
Write-Host "== SSM Run Command (both instances) =="
Invoke-AwsCheck "ssm:DescribeInstanceInformation" @("ssm", "describe-instance-information", "--region", $Region)

foreach ($pair in @(@{Name="test"; Id=$TestInstance}, @{Name="prod"; Id=$ProdInstance})) {
    $sendArgs = @("ssm", "send-command", "--region", $Region,
        "--instance-ids", $pair.Id,
        "--document-name", "AWS-RunShellScript",
        "--comment", "permission self-test",
        "--parameters", 'commands=["echo permtest-ok"]',
        "--query", "Command.CommandId", "--output", "text")
    if ($Profile -ne "") { $sendArgs += @("--profile", $Profile) }
    $cmdId = & aws @sendArgs 2>&1
    if ($LASTEXITCODE -eq 0 -and $cmdId -and $cmdId -ne "None") {
        Write-Host "PASS  ssm:SendCommand ($($pair.Name), command id $cmdId)" -ForegroundColor Green
        $script:PassCount++
        Start-Sleep -Seconds 3
        Invoke-AwsCheck "ssm:GetCommandInvocation ($($pair.Name))" @("ssm", "get-command-invocation", "--region", $Region, "--command-id", $cmdId, "--instance-id", $pair.Id)
    } else {
        Write-Host "FAIL  ssm:SendCommand ($($pair.Name))" -ForegroundColor Red
        ($cmdId | Select-Object -First 3) | ForEach-Object { Write-Host "        $_" }
        $script:FailCount++
    }
}

Write-Host ""
Write-Host "== Security Groups (dry-run only, no actual change) =="
foreach ($sg in @($TestSg, $ProdSg)) {
    $sgArgs = @("ec2", "authorize-security-group-ingress", "--region", $Region,
        "--group-id", $sg, "--protocol", "tcp", "--port", "80", "--cidr", "0.0.0.0/0", "--dry-run")
    if ($Profile -ne "") { $sgArgs += @("--profile", $Profile) }
    $output = & aws @sgArgs 2>&1
    if ($output -join "`n" -match "DryRunOperation") {
        Write-Host "PASS  ec2:AuthorizeSecurityGroupIngress ($sg) [dry-run confirms allowed]" -ForegroundColor Green
        $script:PassCount++
    } else {
        Write-Host "FAIL  ec2:AuthorizeSecurityGroupIngress ($sg)" -ForegroundColor Red
        ($output | Select-Object -First 3) | ForEach-Object { Write-Host "        $_" }
        $script:FailCount++
    }
}

Write-Host ""
Write-Host "== EC2 read-only =="
Invoke-AwsCheck "ec2:DescribeInstances" @("ec2", "describe-instances", "--region", $Region, "--instance-ids", $TestInstance, $ProdInstance)
Invoke-AwsCheck "ec2:DescribeImages" @("ec2", "describe-images", "--region", $Region, "--image-ids", "ami-01a18c38ece67e620")

Write-Host ""
Write-Host "== CloudWatch Logs / Metrics read-only =="
Invoke-AwsCheck "logs:DescribeLogGroups" @("logs", "describe-log-groups", "--region", $Region)
Invoke-AwsCheck "cloudwatch:ListMetrics" @("cloudwatch", "list-metrics", "--region", $Region, "--namespace", "AWS/EC2")

Write-Host ""
Write-Host "=================================================="
Write-Host "Result: $script:PassCount passed, $script:FailCount failed"
Write-Host "=================================================="

if ($script:FailCount -gt 0) { exit 1 } else { exit 0 }
