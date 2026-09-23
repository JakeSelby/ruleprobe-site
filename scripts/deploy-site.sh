#!/usr/bin/env bash
# Sync a built site (dist/) to the bucket and invalidate CloudFront.
#
# Shared by deploy.sh (Mac) and the deploy workflow (CI). Needs BUCKET and
# DIST_ID; uses whatever AWS identity the environment already carries — the
# selected profile locally, the OIDC role on a runner.
set -euo pipefail

export AWS_REGION="us-east-1"
: "${BUCKET:?set BUCKET}" "${DIST_ID:?set DIST_ID}"
if [[ ! "$BUCKET" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || [[ ! "$DIST_ID" =~ ^E[A-Z0-9]+$ ]]; then
  echo "✗ Invalid stack outputs; refusing to sync." >&2
  exit 1
fi
[ -f dist/index.html ] || { echo "✗ dist/index.html missing — run 'npm run build' first" >&2; exit 1; }

echo "▶ Syncing site to s3://${BUCKET} ..."
aws s3 sync dist/ "s3://${BUCKET}" \
  --delete \
  --cache-control "public, max-age=0, must-revalidate" \
  --exclude "_astro/*" \
  --exclude "pagefind/*"

# Hashed assets: cache for a year.
aws s3 sync dist/_astro/ "s3://${BUCKET}/_astro/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable"

# The search index: fragments are hashed, the loader is not; an hour is safe
# because every deploy invalidates /* anyway.
aws s3 sync dist/pagefind/ "s3://${BUCKET}/pagefind/" \
  --delete \
  --cache-control "public, max-age=3600"

echo "▶ Invalidating CloudFront (${DIST_ID})..."
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text
