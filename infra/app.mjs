#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as customResources from "aws-cdk-lib/custom-resources";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = path.join(projectRoot, "infra", "migration");
const migrationFingerprint = crypto.createHash("sha256")
  .update(fs.readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).sort().map((name) => fs.readFileSync(path.join(migrationDirectory, name))).join("\n"))
  .digest("hex");

class FluentAwsStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const adminEmails = props.adminEmails;

    const databaseVpc = new ec2.Vpc(this, "DatabaseVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: "database", subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });
    const applicationVpc = new ec2.Vpc(this, "ApplicationVpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [{ name: "application", subnetType: ec2.SubnetType.PUBLIC }],
    });

    const database = new rds.DatabaseCluster(this, "Postgres", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_16_11 }),
      writer: rds.ClusterInstance.serverlessV2("writer"),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      serverlessV2AutoPauseDuration: cdk.Duration.minutes(10),
      enableDataApi: true,
      credentials: rds.Credentials.fromGeneratedSecret("fluent_admin", { secretName: "fluent-production/database-admin" }),
      defaultDatabaseName: "fluent",
      vpc: databaseVpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      backup: { retention: cdk.Duration.days(7) },
      cloudwatchLogsExports: ["postgresql"],
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });
    database.secret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    const openAiKey = importedSecret(this, "OpenAiKey", "fluent-production/openai-api-key", props.openAiSecretArn);
    const googleClientId = importedSecret(this, "GoogleClientId", "fluent-production/google-client-id", props.googleClientIdSecretArn);
    const googleClientSecret = importedSecret(this, "GoogleClientSecret", "fluent-production/google-client-secret", props.googleClientSecretSecretArn);
    const authSecret = generatedSecret(this, "AuthSecret", "fluent-production/auth-secret", 64);
    const originVerificationSecret = generatedSecret(this, "OriginVerificationSecret", "fluent-production/origin-verification", 48);

    const migrationHandler = new lambda.Function(this, "MigrationHandler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(migrationDirectory),
      timeout: cdk.Duration.minutes(5),
      environment: {
        DATABASE_NAME: "fluent",
        DATABASE_RESOURCE_ARN: database.clusterArn,
        DATABASE_SECRET_ARN: database.secret.secretArn,
      },
    });
    database.grantDataApiAccess(migrationHandler);
    database.secret.grantRead(migrationHandler);
    const migrationProvider = new customResources.Provider(this, "MigrationProvider", { onEventHandler: migrationHandler });
    const migration = new cdk.CustomResource(this, "PostgresMigration", {
      serviceToken: migrationProvider.serviceToken,
      properties: { MigrationFingerprint: migrationFingerprint },
    });

    const image = new ecrAssets.DockerImageAsset(this, "ApplicationImage", { directory: projectRoot });
    const instanceRole = new iam.Role(this, "ApplicationInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")],
    });
    image.repository.grantPull(instanceRole);
    database.grantDataApiAccess(instanceRole);
    database.secret.grantRead(instanceRole);
    for (const secret of [openAiKey, googleClientId, googleClientSecret, authSecret, originVerificationSecret]) secret.grantRead(instanceRole);

    const applicationSecurityGroup = new ec2.SecurityGroup(this, "ApplicationSecurityGroup", {
      vpc: applicationVpc,
      description: "CloudFront origin access to Fluent; administration uses Systems Manager",
      allowAllOutbound: true,
    });
    applicationSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "CloudFront HTTP origin");

    const elasticIp = new ec2.CfnEIP(this, "ApplicationElasticIp", { domain: "vpc" });
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -euo pipefail",
      "dnf install -y docker",
      "systemctl enable --now docker",
      "install -d -m 700 /opt/fluent",
      `ORIGIN_VERIFY=$(aws secretsmanager get-secret-value --region '${this.region}' --secret-id '${originVerificationSecret.secretName}' --query SecretString --output text)`,
      `cat > /opt/fluent/Caddyfile <<CADDYFILE\n:80 {\n  @fromCloudFront header X-Fluent-Origin-Verify $ORIGIN_VERIFY\n  handle @fromCloudFront {\n    encode zstd gzip\n    reverse_proxy fluent-app:3000\n  }\n  respond 403\n}\nCADDYFILE`,
      // Shell quoting is intentionally explicit because this template is written verbatim to the host.
      // eslint-disable-next-line no-useless-escape
      `cat > /opt/fluent/deploy.sh <<'DEPLOY_SCRIPT'\n#!/usr/bin/env bash\nset -euo pipefail\nIMAGE_URI=\"$1\"\nAPP_URL=\"$2\"\nREGION=\"${this.region}\"\ncase \"$APP_URL\" in https://*.cloudfront.net) ;; *) echo 'Expected the generated CloudFront HTTPS URL.' >&2; exit 2 ;; esac\nfetch_secret() { aws secretsmanager get-secret-value --region \"$REGION\" --secret-id \"$1\" --query SecretString --output text; }\numask 077\n{\n  printf '%s\\n' 'NODE_ENV=production' 'AWS_REGION=${this.region}' 'DATABASE_NAME=fluent'\n  printf '%s\\n' 'DATABASE_RESOURCE_ARN=${database.clusterArn}' 'DATABASE_SECRET_ARN=${database.secret.secretArn}'\n  printf '%s\\n' 'OPENAI_CORRECTION_MODEL=gpt-5.6-terra' 'OPENAI_VOCABULARY_MODEL=gpt-5.6-luna'\n  printf '%s\\n' 'ADMIN_EMAILS=${shellSingleQuote(adminEmails)}' \"APP_BASE_URL=$APP_URL\"\n  printf 'OPENAI_API_KEY=%s\\n' \"$(fetch_secret '${openAiKey.secretName}')\"\n  printf 'GOOGLE_CLIENT_ID=%s\\n' \"$(fetch_secret '${googleClientId.secretName}')\"\n  printf 'GOOGLE_CLIENT_SECRET=%s\\n' \"$(fetch_secret '${googleClientSecret.secretName}')\"\n  printf 'AUTH_SECRET=%s\\n' \"$(fetch_secret '${authSecret.secretName}')\"\n} > /opt/fluent/app.env\naws ecr get-login-password --region \"$REGION\" | docker login --username AWS --password-stdin \"$(printf '%s' \"$IMAGE_URI\" | cut -d/ -f1)\"\ndocker pull \"$IMAGE_URI\"\ndocker network inspect fluent >/dev/null 2>&1 || docker network create fluent\ndocker rm -f fluent-app >/dev/null 2>&1 || true\ndocker run -d --name fluent-app --restart unless-stopped --network fluent --env-file /opt/fluent/app.env \"$IMAGE_URI\"\ndocker image prune -af --filter 'until=168h'\ndocker rm -f fluent-proxy >/dev/null 2>&1 || true\ndocker run -d --name fluent-proxy --restart unless-stopped --network fluent -p 80:80 -v /opt/fluent/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2.10-alpine\nDEPLOY_SCRIPT`,
      "chmod 700 /opt/fluent/deploy.sh",
    );

    const instance = new ec2.Instance(this, "ApplicationHost", {
      vpc: applicationVpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: ec2.MachineImage.fromSSMParameter(
        "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64",
        ec2.OperatingSystemType.LINUX,
      ),
      role: instanceRole,
      securityGroup: applicationSecurityGroup,
      userData,
      userDataCausesReplacement: true,
      requireImdsv2: true,
      blockDevices: [{
        deviceName: "/dev/xvda",
        volume: ec2.BlockDeviceVolume.ebs(16, { encrypted: true, volumeType: ec2.EbsDeviceVolumeType.GP3 }),
      }],
    });
    instance.node.addDependency(migration);
    cdk.Tags.of(instance).add("Name", "fluent-production");

    const ipAssociation = new ec2.CfnEIPAssociation(this, "ApplicationIpAssociation", {
      allocationId: elasticIp.attrAllocationId,
      instanceId: instance.instanceId,
    });

    const originDomainName = cdk.Fn.join(".", [
      `ec2-${cdk.Fn.join("-", cdk.Fn.split(".", elasticIp.attrPublicIp))}`,
      this.region,
      `compute.${this.urlSuffix}`,
    ]);
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Fluent English Coach production",
      defaultBehavior: {
        origin: new origins.HttpOrigin(originDomainName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80,
          customHeaders: {
            "X-Fluent-Origin-Verify": originVerificationSecret.secretValue.unsafeUnwrap(),
          },
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
    distribution.node.addDependency(ipAssociation);

    new cdk.CfnOutput(this, "ApplicationUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "CloudFrontDistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "ApplicationIp", { value: elasticIp.attrPublicIp });
    new cdk.CfnOutput(this, "ApplicationInstanceId", { value: instance.instanceId });
    new cdk.CfnOutput(this, "ApplicationImageUri", { value: image.imageUri });
    new cdk.CfnOutput(this, "OpenAiSecretName", { value: openAiKey.secretName });
    new cdk.CfnOutput(this, "GoogleClientIdSecretName", { value: googleClientId.secretName });
    new cdk.CfnOutput(this, "GoogleClientSecretSecretName", { value: googleClientSecret.secretName });
    new cdk.CfnOutput(this, "DatabaseClusterArn", { value: database.clusterArn });
  }
}

function shellSingleQuote(value) {
  return value.replaceAll("'", "'\\''");
}

function generatedSecret(scope, id, secretName, passwordLength) {
  return new secretsmanager.Secret(scope, id, {
    secretName,
    generateSecretString: { passwordLength, excludePunctuation: true },
    removalPolicy: cdk.RemovalPolicy.RETAIN,
  });
}

function importedSecret(scope, id, secretName, completeArn) {
  return completeArn
    ? secretsmanager.Secret.fromSecretCompleteArn(scope, id, completeArn)
    : secretsmanager.Secret.fromSecretNameV2(scope, id, secretName);
}

const app = new cdk.App();
const adminEmails = String(app.node.tryGetContext("adminEmails") ?? "").trim();
if (!adminEmails) throw new Error("Pass at least one Google account with --context adminEmails=you@example.com");
const instanceType = String(app.node.tryGetContext("instanceType") ?? "t3.small").trim();
new FluentAwsStack(app, "FluentProduction", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "eu-central-1" },
  adminEmails,
  instanceType,
  openAiSecretArn: String(app.node.tryGetContext("openAiSecretArn") ?? "").trim(),
  googleClientIdSecretArn: String(app.node.tryGetContext("googleClientIdSecretArn") ?? "").trim(),
  googleClientSecretSecretArn: String(app.node.tryGetContext("googleClientSecretSecretArn") ?? "").trim(),
  description: "Fluent English coach: CloudFront, EC2, Aurora PostgreSQL, Data API, Google OAuth, and managed secrets",
});
