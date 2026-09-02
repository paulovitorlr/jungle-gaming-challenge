#!/bin/bash

set -euo pipefail

DLQ_NAME="wager-transactions-dlq"
QUEUE_NAME="wager-transactions"

DLQ_URL=$(
  awslocal sqs create-queue \
    --queue-name "${DLQ_NAME}" \
    --attributes '{"MessageRetentionPeriod":"1209600"}' \
    --query 'QueueUrl' \
    --output text
)

DLQ_ARN=$(
  awslocal sqs get-queue-attributes \
    --queue-url "${DLQ_URL}" \
    --attribute-names QueueArn \
    --query 'Attributes.QueueArn' \
    --output text
)

QUEUE_ATTRIBUTES=$(
  printf \
    '{"VisibilityTimeout":"30","ReceiveMessageWaitTimeSeconds":"20","RedrivePolicy":"{\\"deadLetterTargetArn\\":\\"%s\\",\\"maxReceiveCount\\":\\"3\\"}"}' \
    "${DLQ_ARN}"
)

awslocal sqs create-queue \
  --queue-name "${QUEUE_NAME}" \
  --attributes "${QUEUE_ATTRIBUTES}"