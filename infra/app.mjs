#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
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
    const appBaseUrl = props.appBaseUrl;

    const vpc = new ec2.Vpc(this, "DatabaseVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: "database", subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
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
      vpc,
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
    const ecrAccessRole = new iam.Role(this, "AppRunnerEcrAccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSAppRunnerServicePolicyForECRAccess")],
    });
    const instanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });
    database.grantDataApiAccess(instanceRole);
    database.secret.grantRead(instanceRole);
    for (const secret of [openAiKey, googleClientId, googleClientSecret, authSecret]) secret.grantRead(instanceRole);

    const scaling = new apprunner.CfnAutoScalingConfiguration(this, "AppScaling", {
      autoScalingConfigurationName: "fluent-production",
      minSize: 1,
      maxSize: 3,
      maxConcurrency: 80,
    });

    const runtimeEnvironmentVariables = [
      { name: "NODE_ENV", value: "production" },
      { name: "AWS_REGION", value: this.region },
      { name: "DATABASE_NAME", value: "fluent" },
      { name: "DATABASE_RESOURCE_ARN", value: database.clusterArn },
      { name: "DATABASE_SECRET_ARN", value: database.secret.secretArn },
      { name: "OPENAI_CORRECTION_MODEL", value: "gpt-5.6-terra" },
      { name: "OPENAI_VOCABULARY_MODEL", value: "gpt-5.6-luna" },
      { name: "ADMIN_EMAILS", value: adminEmails },
      ...(appBaseUrl ? [{ name: "APP_BASE_URL", value: appBaseUrl }] : []),
    ];

    const service = new apprunner.CfnService(this, "WebService", {
      serviceName: "fluent-english-coach",
      autoScalingConfigurationArn: scaling.attrAutoScalingConfigurationArn,
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        authenticationConfiguration: { accessRoleArn: ecrAccessRole.roleArn },
        imageRepository: {
          imageIdentifier: image.imageUri,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "3000",
            runtimeEnvironmentVariables,
            runtimeEnvironmentSecrets: [
              { name: "OPENAI_API_KEY", value: openAiKey.secretArn },
              { name: "GOOGLE_CLIENT_ID", value: googleClientId.secretArn },
              { name: "GOOGLE_CLIENT_SECRET", value: googleClientSecret.secretArn },
              { name: "AUTH_SECRET", value: authSecret.secretArn },
            ],
          },
        },
      },
      instanceConfiguration: { cpu: "1 vCPU", memory: "2 GB", instanceRoleArn: instanceRole.roleArn },
      healthCheckConfiguration: { protocol: "HTTP", path: "/api/health", interval: 10, timeout: 5, healthyThreshold: 1, unhealthyThreshold: 5 },
      networkConfiguration: { egressConfiguration: { egressType: "DEFAULT" }, ipAddressType: "IPV4" },
    });
    service.node.addDependency(migration);

    new cdk.CfnOutput(this, "ApplicationUrl", { value: `https://${service.attrServiceUrl}` });
    new cdk.CfnOutput(this, "AppRunnerServiceArn", { value: service.attrServiceArn });
    new cdk.CfnOutput(this, "OpenAiSecretName", { value: openAiKey.secretName });
    new cdk.CfnOutput(this, "GoogleClientIdSecretName", { value: googleClientId.secretName });
    new cdk.CfnOutput(this, "GoogleClientSecretSecretName", { value: googleClientSecret.secretName });
    new cdk.CfnOutput(this, "DatabaseClusterArn", { value: database.clusterArn });
  }
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
const appBaseUrl = String(app.node.tryGetContext("appBaseUrl") ?? "").trim();
new FluentAwsStack(app, "FluentProduction", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "eu-central-1" },
  adminEmails,
  appBaseUrl,
  openAiSecretArn: String(app.node.tryGetContext("openAiSecretArn") ?? "").trim(),
  googleClientIdSecretArn: String(app.node.tryGetContext("googleClientIdSecretArn") ?? "").trim(),
  googleClientSecretSecretArn: String(app.node.tryGetContext("googleClientSecretSecretArn") ?? "").trim(),
  description: "Fluent English coach: App Runner, Aurora PostgreSQL, Data API, Google OAuth, and managed secrets",
});
