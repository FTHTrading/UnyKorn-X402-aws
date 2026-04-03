#!/usr/bin/env pwsh
# Wire SNS topic to all remaining CloudWatch alarms
# Usage: .\wire-sns-alarms.ps1

$snsArn = "arn:aws:sns:us-east-1:933629770808:unykorn-l1-alerts"

$alarms = @(
  @{ Name="unykorn-l1-charlie-cpu-high"; Desc="CPU > 85% on charlie for 15 minutes"; Metric="CPUUtilization"; Stat="Average"; Period=300; Eval=3; Thresh=85.0; Comp="GreaterThanThreshold"; Missing="notBreaching"; IID="i-0d87f793231da3772" },
  @{ Name="unykorn-l1-charlie-status-check"; Desc="Status check failed on charlie"; Metric="StatusCheckFailed"; Stat="Maximum"; Period=60; Eval=2; Thresh=0.0; Comp="GreaterThanThreshold"; Missing="breaching"; IID="i-0d87f793231da3772" },
  @{ Name="unykorn-l1-delta-cpu-high"; Desc="CPU > 85% on delta for 15 minutes"; Metric="CPUUtilization"; Stat="Average"; Period=300; Eval=3; Thresh=85.0; Comp="GreaterThanThreshold"; Missing="notBreaching"; IID="i-0e9a24f4902faaa06" },
  @{ Name="unykorn-l1-delta-status-check"; Desc="Status check failed on delta"; Metric="StatusCheckFailed"; Stat="Maximum"; Period=60; Eval=2; Thresh=0.0; Comp="GreaterThanThreshold"; Missing="breaching"; IID="i-0e9a24f4902faaa06" },
  @{ Name="unykorn-l1-echo-cpu-high"; Desc="CPU > 85% on echo for 15 minutes"; Metric="CPUUtilization"; Stat="Average"; Period=300; Eval=3; Thresh=85.0; Comp="GreaterThanThreshold"; Missing="notBreaching"; IID="i-0d9493de789fc744a" },
  @{ Name="unykorn-l1-echo-status-check"; Desc="Status check failed on echo"; Metric="StatusCheckFailed"; Stat="Maximum"; Period=60; Eval=2; Thresh=0.0; Comp="GreaterThanThreshold"; Missing="breaching"; IID="i-0d9493de789fc744a" }
)

foreach ($a in $alarms) {
  $json = @{
    AlarmName = $a.Name
    AlarmDescription = $a.Desc
    MetricName = $a.Metric
    Namespace = "AWS/EC2"
    Statistic = $a.Stat
    Period = $a.Period
    EvaluationPeriods = $a.Eval
    Threshold = $a.Thresh
    ComparisonOperator = $a.Comp
    TreatMissingData = $a.Missing
    Dimensions = @(@{ Name = "InstanceId"; Value = $a.IID })
    AlarmActions = @($snsArn)
    OKActions = @($snsArn)
    ActionsEnabled = $true
  } | ConvertTo-Json -Depth 5 -Compress

  $tmpFile = "$env:TEMP\alarm-$($a.Name).json"
  [System.IO.File]::WriteAllText($tmpFile, $json, [System.Text.Encoding]::ASCII)
  
  $result = aws cloudwatch put-metric-alarm --cli-input-json "file://$tmpFile" 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "OK: $($a.Name)" -ForegroundColor Green
  } else {
    Write-Host "FAIL: $($a.Name) => $result" -ForegroundColor Red
  }
  
  Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
}

Write-Host "`nDone. Verifying..."
aws cloudwatch describe-alarms --no-paginate --query "MetricAlarms[].{N:AlarmName,C:length(AlarmActions)}" --output text 2>&1 | Out-String
