import type { ProjectConfig, BucketDefinition } from "@ploybundle/shared";

interface SeaweedfsS3Config {
  identities: Array<{
    name: string;
    credentials: Array<{
      accessKey: string;
      secretKey: string;
    }>;
    actions: string[];
  }>;
}

export function renderSeaweedfsConfig(
  _config: ProjectConfig,
  accessKey: string,
  secretKey: string
): string {
  const s3Config: SeaweedfsS3Config = {
    identities: [
      {
        name: "admin",
        credentials: [{ accessKey, secretKey }],
        actions: ["Admin", "Read", "Write", "List", "Tagging"],
      },
      {
        name: "readonly",
        credentials: [
          {
            accessKey: `${accessKey}-ro`,
            secretKey: `${secretKey}-ro`,
          },
        ],
        actions: ["Read", "List"],
      },
    ],
  };

  return JSON.stringify(s3Config, null, 2);
}

export function renderBucketInitScript(_config: ProjectConfig, buckets: BucketDefinition[]): string {
  const allBuckets = [
    { name: "directus", public: false },
    ...buckets,
  ];

  // Deduplicate by name
  const seen = new Set<string>();
  const uniqueBuckets = allBuckets.filter((b) => {
    if (seen.has(b.name)) return false;
    seen.add(b.name);
    return true;
  });

  const commands = uniqueBuckets.map((bucket) => {
    const publicFlag = bucket.public ? "--acl public-read" : "";
    return `echo "Creating bucket: ${bucket.name}"
aws --endpoint-url http://seaweedfs:8333 s3 mb s3://${bucket.name} ${publicFlag} 2>/dev/null || echo "Bucket ${bucket.name} already exists"`;
  });

  return `#!/bin/sh
set -e

# Wait for SeaweedFS to be ready
echo "Waiting for SeaweedFS..."
until wget -q -O /dev/null http://seaweedfs:9333/cluster/healthz 2>/dev/null; do
  sleep 2
done
echo "SeaweedFS is ready."

export AWS_ACCESS_KEY_ID="\${SEAWEEDFS_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="\${SEAWEEDFS_SECRET_KEY}"
export AWS_DEFAULT_REGION="us-east-1"

${commands.join("\n\n")}

echo "All buckets created successfully."
`;
}
