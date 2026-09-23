#!/usr/bin/env bash
# Deploy ruleprobe.jakeselby.com from the Mac: infrastructure and site.
# Usage: ./scripts/deploy.sh
# Prerequisites: .env.infra deployment configuration (see README).
#
# CI deploys the site on every push to main (.github/workflows/deploy.yml);
# this script is for the first deploy, for infrastructure changes, and for a
# manual sync. Guards, in order: the tree must be committed, the branch must be
# main, the submodule must be at the commit the tree records, the tests, build
# and smoke test must pass, and only then does `cdk deploy` and the sync run.
# Override with ALLOW_DIRTY=1 or ALLOW_BRANCH=1 when you mean it.
set -euo pipefail

export AWS_REGION="us-east-1"
STACK="RuleprobeSite"

cd "$(dirname "$0")/.."

# Trusted local deployment values, kept separate from Astro's public build config.
if [ -f .env.infra ]; then
  set -a
  source .env.infra
  set +a
fi
: "${SITE_AWS_ACCOUNT_ID:?Set SITE_AWS_ACCOUNT_ID in .env.infra or the environment}"
: "${SITE_HOSTED_ZONE_ID:?Set SITE_HOSTED_ZONE_ID in .env.infra or the environment}"
: "${SITE_BUCKET_NAME:?Set SITE_BUCKET_NAME in .env.infra or the environment}"
: "${SITE_ROUTING_FUNCTION_NAME:?Set SITE_ROUTING_FUNCTION_NAME in .env.infra or the environment}"
: "${SITE_DEPLOY_ROLE_NAME:?Set SITE_DEPLOY_ROLE_NAME in .env.infra or the environment}"

echo "▶ Tree check..."
if [ -n "$(git status --porcelain)" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo "✗ Uncommitted changes present. Commit them (CI must build main), or ALLOW_DIRTY=1." >&2
  git status --short >&2
  exit 1
fi
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ] && [ "${ALLOW_BRANCH:-0}" != "1" ]; then
  echo "✗ On branch '$BRANCH', not main. Merge first, or ALLOW_BRANCH=1." >&2
  exit 1
fi

echo "▶ Submodule check..."
git submodule update --init
if git submodule status | grep -q '^[+-]'; then
  echo "✗ vendor/ruleprobe is not at the commit this tree records. Commit the bump or reset it." >&2
  git submodule status >&2
  exit 1
fi

echo "▶ AWS identity check..."
ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
if [ "$ACCOUNT" != "$SITE_AWS_ACCOUNT_ID" ]; then
  echo "✗ AWS credentials do not match SITE_AWS_ACCOUNT_ID." >&2
  exit 1
fi

echo "▶ Test, build, smoke..."
npm test
rm -rf dist
npm run build
node scripts/smoke.mjs

echo "▶ Deploying infrastructure (${STACK})..."
(cd infra && npx cdk deploy "$STACK" --require-approval never)

echo "▶ Reading stack outputs..."
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
DIST_ID=$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)
if [ "$BUCKET" != "$SITE_BUCKET_NAME" ] || [[ ! "$DIST_ID" =~ ^E[A-Z0-9]+$ ]]; then
  echo "✗ Missing or unexpected stack outputs; refusing to sync." >&2
  exit 1
fi
export BUCKET DIST_ID

./scripts/deploy-site.sh

echo "✓ Deploy complete → https://ruleprobe.jakeselby.com"
