#!/bin/bash

# Quick test script for DRB Chat Worker
# Usage: ./test-query.sh "Your question here" [worker-url]

WORKER_URL="${2:-https://drb-chat-worker.drbtaskforce.workers.dev}"
QUESTION="$1"

if [ -z "$QUESTION" ]; then
  echo "Usage: $0 \"Your question\" [worker-url]"
  echo "Example: $0 \"What is DRB?\""
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 DRB Chatbot Query"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Worker: $WORKER_URL"
echo "Question: $QUESTION"
echo ""

RESPONSE=$(curl -s -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -H "Origin: https://drbtaskforce.github.io" \
  -d "{\"message\": \"$QUESTION\"}")

if [ $? -ne 0 ]; then
  echo "❌ Request failed"
  exit 1
fi

# Pretty print the response
echo "$RESPONSE" | jq -r '.reply // .error // .'
echo ""
