#!/bin/bash

set -euo pipefail

create_queue_with_dlq() {
  local queue_name="$1"
  local dlq_name="$2"

  local dlq_url
  dlq_url=$(
    awslocal sqs create-queue \
      --queue-name "${dlq_name}" \
      --attributes '{"MessageRetentionPeriod":"1209600"}' \
      --query 'QueueUrl' \
      --output text
  )

  local dlq_arn
  dlq_arn=$(
    awslocal sqs get-queue-attributes \
      --queue-url "${dlq_url}" \
      --attribute-names QueueArn \
      --query 'Attributes.QueueArn' \
      --output text
  )

  local queue_attributes
  queue_attributes=$(
    printf \
      '{"VisibilityTimeout":"30","ReceiveMessageWaitTimeSeconds":"20","RedrivePolicy":"{\\"deadLetterTargetArn\\":\\"%s\\",\\"maxReceiveCount\\":\\"3\\"}"}' \
      "${dlq_arn}"
  )

  awslocal sqs create-queue \
    --queue-name "${queue_name}" \
    --attributes "${queue_attributes}"
}

create_queue_with_dlq \
  "wager-transactions" \
  "wager-transactions-dlq"

create_queue_with_dlq \
  "integration-events" \
  "integration-events-dlq"
