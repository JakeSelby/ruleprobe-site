import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { InfraConfig } from './config.js';

export interface RuleprobeSiteStackProps extends cdk.StackProps {
  config: InfraConfig;
}

const DOMAIN = 'ruleprobe.jakeselby.com';
const REPO = 'JakeSelby/ruleprobe-site';

/**
 * ruleprobe.jakeselby.com: the public reference site for the ruleprobe package.
 *
 * Same shape as the other jakeselby.com surfaces:
 *   - ACM cert, DNS-validated against the jakeselby.com zone (us-east-1, for CloudFront)
 *   - Private S3 bucket behind origin access control, versioned, retained on delete
 *   - CloudFront with a viewer-request function rewriting clean URLs to index.html
 *   - Route53 A alias for the subdomain
 *   - A GitHub Actions deploy role (OIDC) that can only sync the bucket and invalidate
 *
 * Prerequisites: the configured hosted zone and the account's GitHub OIDC provider
 * both exist. See .env.infra.example for deployment configuration.
 */
export class RuleprobeSiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RuleprobeSiteStackProps) {
    super(scope, id, props);
    const { config } = props;

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: config.hostedZoneId,
      zoneName: 'jakeselby.com',
    });

    const cert = new acm.Certificate(this, 'Cert', {
      domainName: DOMAIN,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Versioned so a bad `s3 sync --delete` is recoverable; old versions expire after 30 days.
    const bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: config.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: cdk.Duration.days(30) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // Astro writes detectors/index.html; without this, /detectors/
    // is a missing key and S3 answers 403.
    const routingFunction = new cloudfront.Function(this, 'RoutingFunction', {
      functionName: config.routingFunctionName,
      code: cloudfront.FunctionCode.fromInline(
        `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}
      `.trim(),
      ),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const origin = origins.S3BucketOrigin.withOriginAccessControl(bucket);
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      domainNames: [DOMAIN],
      certificate: cert,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [
          { function: routingFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        '_astro/*': {
          origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'AssetsCachePolicy', {
            defaultTtl: cdk.Duration.days(365),
            maxTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.days(365),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
          }),
          compress: true,
        },
      },
      // The site ships src/pages/404.astro, so both S3's 403-for-missing-key and a real
      // 404 land on a page that exists.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.seconds(0) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.seconds(0) },
      ],
    });

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: DOMAIN,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      comment: `${DOMAIN} → CloudFront (ruleprobe reference site)`,
    });

    // ── CI deploy role (GitHub Actions, OIDC) ────────────────────────────────
    // Trusts only this repository's main branch and can do only what
    // scripts/deploy-site.sh does: write the bucket, invalidate the distribution,
    // read this stack's outputs. Infrastructure changes stay a `cdk deploy` from the Mac.
    const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubOidc',
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );
    const deployRole = new iam.Role(this, 'DeployRole', {
      roleName: config.deployRoleName,
      description: `GitHub Actions in ${REPO} (main): sync the site, invalidate CloudFront`,
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        // GitHub issues the subject in two shapes — the plain owner/repo form and
        // the newer owner@id/repo@id form — so both are accepted, as the other
        // deploy roles in this account do.
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            `repo:${REPO}:ref:refs/heads/main`,
            `repo:${REPO.replace('/', '@*/')}@*:ref:refs/heads/main`,
          ],
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
    });
    bucket.grantReadWrite(deployRole);
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['cloudformation:DescribeStacks'], resources: [this.stackId] }),
    );

    // ── Outputs (deploy.sh and deploy.yml read these back) ───────────────────
    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: 'Set as the AWS_DEPLOY_ROLE_ARN repository variable in GitHub',
    });
    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket — deploy: aws s3 sync dist/ s3://<bucket>',
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID — used for cache invalidation',
    });
    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain for smoke-testing before DNS propagates',
    });
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${DOMAIN}` });
  }
}
