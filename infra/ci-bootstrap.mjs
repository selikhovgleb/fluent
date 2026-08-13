#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

class FluentCiBootstrapStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const { githubRepo, githubBranch, existingProviderArn } = props;
    const provider = existingProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, "GitHubProvider", existingProviderArn)
      : new iam.OpenIdConnectProvider(this, "GitHubProvider", {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      });

    const role = new iam.Role(this, "GitHubDeployRole", {
      roleName: "fluent-github-deploy",
      description: "Short-lived GitHub Actions identity for Fluent production deployments",
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${githubRepo}:ref:refs/heads/${githubBranch}`,
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    role.addToPolicy(new iam.PolicyStatement({
      actions: ["sts:AssumeRole", "sts:TagSession"],
      resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["cloudformation:DescribeStacks"],
      resources: ["*"],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [`arn:${this.partition}:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/hnb659fds/version`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:DescribeSecret"],
      resources: [
        `arn:${this.partition}:secretsmanager:${this.region}:${this.account}:secret:fluent-production/openai-api-key-*`,
        `arn:${this.partition}:secretsmanager:${this.region}:${this.account}:secret:fluent-production/google-client-id-*`,
        `arn:${this.partition}:secretsmanager:${this.region}:${this.account}:secret:fluent-production/google-client-secret-*`,
      ],
    }));

    new cdk.CfnOutput(this, "GitHubDeployRoleArn", { value: role.roleArn });
    new cdk.CfnOutput(this, "TrustedSubject", { value: `repo:${githubRepo}:ref:refs/heads/${githubBranch}` });
  }
}

const app = new cdk.App();
const githubRepo = String(app.node.tryGetContext("githubRepo") ?? "selikhovgleb/fluent").trim();
const githubBranch = String(app.node.tryGetContext("githubBranch") ?? "main").trim();
const existingProviderArn = String(app.node.tryGetContext("githubOidcProviderArn") ?? "").trim();
new FluentCiBootstrapStack(app, "FluentCiBootstrap", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "eu-central-1" },
  githubRepo, githubBranch, existingProviderArn,
  description: "GitHub OIDC trust and least-privilege CDK deployment role for Fluent",
});
