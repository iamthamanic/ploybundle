#!/bin/sh
set -e

# Wait for SeaweedFS to be ready
echo "Waiting for SeaweedFS..."
until wget -q -O /dev/null http://seaweedfs:9333/cluster/healthz 2>/dev/null; do
  sleep 2
done
echo "SeaweedFS is ready."

export AWS_ACCESS_KEY_ID="${SEAWEEDFS_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${SEAWEEDFS_SECRET_KEY}"
export AWS_DEFAULT_REGION="us-east-1"

echo "Creating bucket: directus"
aws --endpoint-url http://seaweedfs:8333 s3 mb s3://directus  2>/dev/null || echo "Bucket directus already exists"

echo "Creating bucket: uploads"
aws --endpoint-url http://seaweedfs:8333 s3 mb s3://uploads  2>/dev/null || echo "Bucket uploads already exists"

echo "Creating bucket: exports"
aws --endpoint-url http://seaweedfs:8333 s3 mb s3://exports  2>/dev/null || echo "Bucket exports already exists"

echo "All buckets created successfully."
