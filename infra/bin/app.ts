#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { readInfraConfig } from '../lib/config.js';
import { RuleprobeSiteStack } from '../lib/ruleprobe-site-stack.js';

const envFile = fileURLToPath(new URL('../../.env.infra', import.meta.url));
if (existsSync(envFile)) loadEnvFile(envFile);
const config = readInfraConfig(process.env);

const app = new cdk.App();

new RuleprobeSiteStack(app, 'RuleprobeSite', {
  config,
  env: {
    account: config.accountId,
    region: 'us-east-1',
  },
  description: 'ruleprobe.jakeselby.com reference site: S3, CloudFront, ACM and Route53',
  tags: {
    Project: 'ruleprobe-site',
    ManagedBy: 'cdk',
  },
});
