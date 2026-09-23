export interface InfraConfig {
  accountId: string;
  hostedZoneId: string;
  bucketName: string;
  routingFunctionName: string;
  deployRoleName: string;
}

export function readInfraConfig(env: NodeJS.ProcessEnv): InfraConfig {
  const required = (name: string, pattern: RegExp): string => {
    const value = env[name]?.trim();
    if (!value || !pattern.test(value)) {
      throw new Error(`Set a valid ${name} in .env.infra or the environment.`);
    }
    return value;
  };

  const accountId = required('SITE_AWS_ACCOUNT_ID', /^\d{12}$/);
  if (env.CDK_DEFAULT_ACCOUNT && env.CDK_DEFAULT_ACCOUNT !== accountId) {
    throw new Error('AWS credentials do not match SITE_AWS_ACCOUNT_ID.');
  }

  return {
    accountId,
    hostedZoneId: required('SITE_HOSTED_ZONE_ID', /^Z[A-Z0-9]+$/),
    bucketName: required('SITE_BUCKET_NAME', /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    routingFunctionName: required('SITE_ROUTING_FUNCTION_NAME', /^[A-Za-z0-9_-]{1,64}$/),
    deployRoleName: required('SITE_DEPLOY_ROLE_NAME', /^[A-Za-z0-9_+=,.@-]{1,64}$/),
  };
}
