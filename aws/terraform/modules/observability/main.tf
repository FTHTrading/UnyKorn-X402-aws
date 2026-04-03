# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Observability Module â€” UnyKorn L1
# CloudWatch, Amazon Managed Prometheus, Managed Grafana
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

variable "project_name"       { type = string }
variable "environment"        { type = string }
variable "aws_region"         { type = string }
variable "vpc_id"             { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "node_instance_ids"  { type = map(string) }
variable "alb_arn_suffix" {
  type        = string
  description = "ALB ARN suffix for CloudWatch dimensions (e.g. app/my-alb/abc123)"
}

variable "enable_grafana" {
  type    = bool
  default = false
}

# â”€â”€â”€ SNS Alert Topic (pre-existing, looked up by name) â”€â”€â”€
data "aws_sns_topic" "alerts" {
  name = "${var.project_name}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = data.aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "kevan@unykorn.org"
}

# â”€â”€â”€ CloudWatch Log Groups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_cloudwatch_log_group" "nodes" {
  for_each = var.node_instance_ids

  name              = "/unykorn/${each.key}"
  retention_in_days = 30

  tags = {
    Name = "${var.project_name}-${var.environment}-logs-${each.key}"
    Node = each.key
  }
}

resource "aws_cloudwatch_log_group" "chain" {
  name              = "/unykorn/chain"
  retention_in_days = 30

  tags = { Name = "${var.project_name}-${var.environment}-logs-chain" }
}

# â”€â”€â”€ CloudWatch Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "CPU Utilization - Chain Nodes"
          region  = var.aws_region
          metrics = [
            for name, id in var.node_instance_ids : [
              "AWS/EC2", "CPUUtilization", "InstanceId", id,
              { label = name }
            ]
          ]
          period = 300
          stat   = "Average"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Network In/Out - Chain Nodes"
          region  = var.aws_region
          metrics = concat([
            for name, id in var.node_instance_ids : [
              "AWS/EC2", "NetworkIn", "InstanceId", id, { label = "${name}-in" }
            ]
          ], [
            for name, id in var.node_instance_ids : [
              "AWS/EC2", "NetworkOut", "InstanceId", id, { label = "${name}-out" }
            ]
          ])
          period = 300
          stat   = "Average"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title     = "Disk Read/Write - Chain Nodes"
          region    = var.aws_region
          namespace = "UnyKorn/L1"
          metrics = [
            for name, id in var.node_instance_ids : [
              "AWS/EC2", "EBSWriteBytes", "InstanceId", id,
              { label = name }
            ]
          ]
          period = 300
          stat   = "Sum"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title     = "Custom - Block Height / TPS"
          region    = var.aws_region
          namespace = "UnyKorn/L1"
          metrics = [
            ["UnyKorn/L1", "BlockHeight", "Node", "alpha"],
            ["UnyKorn/L1", "TransactionsPerSecond", "Node", "alpha"]
          ]
          period = 60
          stat   = "Maximum"
          view   = "timeSeries"
        }
      }
    ]
  })
}

# â”€â”€â”€ CloudWatch Alarms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_cloudwatch_metric_alarm" "node_cpu_high" {
  for_each = var.node_instance_ids

  alarm_name          = "${var.project_name}-${each.key}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "CPU > 85% on ${each.key} for 15 minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = each.value
  }

  alarm_actions = [data.aws_sns_topic.alerts.arn]
  ok_actions    = [data.aws_sns_topic.alerts.arn]

  tags = {
    Name = "${var.project_name}-${var.environment}-alarm-cpu-${each.key}"
    Node = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "node_status_check" {
  for_each = var.node_instance_ids

  alarm_name          = "${var.project_name}-${each.key}-status-check"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Status check failed on ${each.key}"
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = each.value
  }

  alarm_actions = [data.aws_sns_topic.alerts.arn]
  ok_actions    = [data.aws_sns_topic.alerts.arn]

  tags = {
    Name = "${var.project_name}-${var.environment}-alarm-status-${each.key}"
    Node = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${var.project_name}-alb-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "ALB has unhealthy targets for 5+ minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  alarm_actions = [data.aws_sns_topic.alerts.arn]
  ok_actions    = [data.aws_sns_topic.alerts.arn]

  tags = {
    Name = "${var.project_name}-${var.environment}-alarm-alb-health"
  }
}

# â”€â”€â”€ Amazon Managed Prometheus â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_prometheus_workspace" "main" {
  alias = "${var.project_name}-${var.environment}"

  tags = { Name = "${var.project_name}-${var.environment}-prometheus" }
}

# â”€â”€â”€ Amazon Managed Grafana â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_grafana_workspace" "main" {
  count                    = var.enable_grafana ? 1 : 0
  name                     = "${var.project_name}-${var.environment}"
  account_access_type      = "CURRENT_ACCOUNT"
  authentication_providers = ["AWS_SSO"]
  permission_type          = "SERVICE_MANAGED"
  role_arn                 = aws_iam_role.grafana[0].arn

  data_sources = ["PROMETHEUS", "CLOUDWATCH"]

  tags = { Name = "${var.project_name}-${var.environment}-grafana" }
}

resource "aws_iam_role" "grafana" {
  count = var.enable_grafana ? 1 : 0
  name  = "${var.project_name}-${var.environment}-grafana-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "grafana.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "grafana" {
  count = var.enable_grafana ? 1 : 0
  name  = "${var.project_name}-${var.environment}-grafana-policy"
  role  = aws_iam_role.grafana[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PrometheusRead"
        Effect = "Allow"
        Action = [
          "aps:QueryMetrics",
          "aps:GetSeries",
          "aps:GetLabels",
          "aps:GetMetricMetadata"
        ]
        Resource = aws_prometheus_workspace.main.arn
      },
      {
        Sid    = "CloudWatchRead"
        Effect = "Allow"
        Action = [
          "cloudwatch:DescribeAlarmsForMetric",
          "cloudwatch:DescribeAlarmHistory",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:ListMetrics",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetInsightRuleReport",
          "logs:DescribeLogGroups",
          "logs:GetLogGroupFields",
          "logs:StartQuery",
          "logs:StopQuery",
          "logs:GetQueryResults",
          "logs:GetLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# â”€â”€â”€ Outputs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
output "prometheus_endpoint" {
  value = aws_prometheus_workspace.main.prometheus_endpoint
}

output "prometheus_workspace_id" {
  value = aws_prometheus_workspace.main.id
}

output "grafana_endpoint" {
  value = var.enable_grafana ? aws_grafana_workspace.main[0].endpoint : ""
}

output "cloudwatch_dashboard_name" {
  value = aws_cloudwatch_dashboard.main.dashboard_name
}

output "sns_topic_arn" {
  value = data.aws_sns_topic.alerts.arn
}

# â”€â”€â”€ CloudTrail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
locals {
  account_id = data.aws_caller_identity.current.account_id
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "cloudtrail" {
  bucket        = "${var.project_name}-${var.environment}-cloudtrail-${local.account_id}"
  force_destroy = true

  tags = { Name = "${var.project_name}-${var.environment}-cloudtrail" }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket                  = aws_s3_bucket.cloudtrail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AWSCloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.cloudtrail.arn
      },
      {
        Sid       = "AWSCloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.cloudtrail.arn}/AWSLogs/${local.account_id}/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
        }
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/aws/cloudtrail/${var.project_name}-${var.environment}"
  retention_in_days = 90
  tags              = { Name = "${var.project_name}-${var.environment}-cloudtrail-logs" }
}

resource "aws_iam_role" "cloudtrail" {
  name = "${var.project_name}-${var.environment}-cloudtrail-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "cloudtrail_logs" {
  name = "${var.project_name}-${var.environment}-cloudtrail-logs"
  role = aws_iam_role.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
    }]
  })
}

resource "aws_cloudtrail" "main" {
  name                          = "${var.project_name}-${var.environment}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.cloudtrail.arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  tags = { Name = "${var.project_name}-${var.environment}-trail" }

  # Ensure bucket policy exists before trail tries to write
  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

output "cloudtrail_arn" {
  value = aws_cloudtrail.main.arn
}

output "cloudtrail_bucket" {
  value = aws_s3_bucket.cloudtrail.bucket
}

# â”€â”€â”€ CloudWatch Synthetics Canary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Heartbeat canary: hits /health every 5 min, alarms to SNS.

data "archive_file" "canary_script" {
  type        = "zip"
  output_path = "${path.module}/canary_script.zip"

  source {
    filename = "nodejs/index.js"
    content  = <<-JS
      const synthetics = require('Synthetics');

      exports.handler = async () => {
        await synthetics.executeHttpStep(
          'FTH Pay Health Check',
          {
            hostname: 'fth-api.unykorn.org',
            method:   'GET',
            path:     '/health',
            port:     443,
            protocol: 'https:'
          }
        );
      };
    JS
  }
}

resource "aws_s3_bucket" "canary_artifacts" {
  bucket        = "${var.project_name}-${var.environment}-canary-${local.account_id}"
  force_destroy = true
  tags          = { Name = "${var.project_name}-${var.environment}-canary-artifacts" }
}

resource "aws_s3_bucket_public_access_block" "canary_artifacts" {
  bucket                  = aws_s3_bucket.canary_artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_role" "canary" {
  name = "${var.project_name}-${var.environment}-canary-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "canary" {
  name = "${var.project_name}-${var.environment}-canary-policy"
  role = aws_iam_role.canary.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Artifacts"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetBucketLocation"
        ]
        Resource = [
          aws_s3_bucket.canary_artifacts.arn,
          "${aws_s3_bucket.canary_artifacts.arn}/*"
        ]
      },
      {
        Sid    = "CloudWatch"
        Effect = "Allow"
        Action = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = { "cloudwatch:namespace" = "CloudWatchSynthetics" }
        }
      },
      {
        Sid    = "Logs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:log-group:/aws/lambda/cwsyn-*"
      },
      {
        Sid    = "XRay"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_synthetics_canary" "fth_pay_health" {
  name                 = "${var.project_name}-health"
  artifact_s3_location = "s3://${aws_s3_bucket.canary_artifacts.bucket}/"
  execution_role_arn   = aws_iam_role.canary.arn
  handler              = "index.handler"
  runtime_version      = "syn-nodejs-puppeteer-9.1"
  zip_file             = data.archive_file.canary_script.output_path
  start_canary         = true

  schedule {
    expression = "rate(5 minutes)"
  }

  run_config {
    timeout_in_seconds = 60
  }

  tags = { Name = "${var.project_name}-${var.environment}-health-canary" }

  depends_on = [aws_s3_bucket.canary_artifacts, aws_iam_role_policy.canary]
}

resource "aws_cloudwatch_metric_alarm" "canary_failed" {
  alarm_name          = "${var.project_name}-${var.environment}-canary-failed"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "SuccessPercent"
  namespace           = "CloudWatchSynthetics"
  period              = 300
  statistic           = "Average"
  threshold           = 100
  alarm_description   = "FTH Pay /health canary success rate dropped below 100%"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  ok_actions          = [data.aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"

  dimensions = {
    CanaryName = aws_synthetics_canary.fth_pay_health.name
  }
}

output "canary_arn" {
  value = aws_synthetics_canary.fth_pay_health.arn
}

output "canary_artifacts_bucket" {
  value = aws_s3_bucket.canary_artifacts.bucket
}

