# Fluent English Coach

Fluent is a production Next.js application for AI writing correction and vocabulary review. CloudFront provides its public HTTPS URL, the application runs as a Docker container on Amazon EC2, and user data is stored in Aurora PostgreSQL Serverless v2 through the RDS Data API.

## What is real today

- Google-only sign-in protects every app page and API except auth callbacks and health checks.
- Writing corrections come from the OpenAI API. Failed AI calls display an error; the UI does not fabricate a local result.
- Corrections, scores, and mistake categories are recorded in PostgreSQL. Original/corrected text is stored only when the user enables sentence history.
- Profile preferences and statistics come from PostgreSQL.
- Vocabulary entries and spaced-review events are persisted in PostgreSQL.
- The focus-word panel uses saved account data. A true always-on-top desktop widget and notifications are explicitly marked as not implemented.
- The admin dashboard reads live operational and learning data from PostgreSQL.

## AWS architecture

- **CloudFront** provides the generated `cloudfront.net` HTTPS address and forwards dynamic requests without caching them.
- **EC2** runs the application container on Amazon Linux 2023. The default instance type is `t3.small`.
- **Elastic IP** keeps the server address stable when the instance is replaced.
- **Caddy** reverse-proxies CloudFront origin requests to the application container. A secret origin header rejects direct requests to the Elastic IP.
- **ECR** stores immutable application images built by CDK.
- **Aurora PostgreSQL Serverless v2** stores user, correction, and vocabulary data in private isolated subnets.
- **RDS Data API** connects EC2 to PostgreSQL without exposing the database publicly.
- **Secrets Manager** stores OpenAI, Google OAuth, Auth.js, and database credentials.
- **Lambda + a CloudFormation custom resource** apply versioned SQL migrations.
- **Systems Manager** deploys and administers the instance without SSH or an inbound port 22.
- **GitHub Actions + AWS OIDC** deploy every push/merge to `main` without long-lived AWS access keys in GitHub.

## One-time production setup

### 1. Prerequisites

Install Node.js 22.13+, Docker Desktop (Linux containers), AWS CLI v2, and Git. Configure an AWS identity with permission to bootstrap CDK and create the resources above. A purchased domain is not required: CloudFront supplies an AWS-managed HTTPS hostname and certificate.

```powershell
aws configure
aws sts get-caller-identity
npm ci
```

This deployment remains configured for AWS Europe (Frankfurt), `eu-central-1`, so it uses the Secrets Manager values and CDK bootstrap resources already created there. EC2 is available in Stockholm, but changing regions now would require recreating or migrating the regional resources.

```powershell
$AwsAccount = aws sts get-caller-identity --query Account --output text
$AwsRegion = "eu-central-1"
$env:CDK_DEFAULT_ACCOUNT = $AwsAccount
$env:CDK_DEFAULT_REGION = $AwsRegion
npx cdk bootstrap "aws://$AwsAccount/$AwsRegion"
```

### 2. Create real application secrets

Before the first app deployment, create these three **Other type of secret** values in AWS Secrets Manager in the selected region:

| Secret name | Secret value |
| --- | --- |
| `fluent-production/openai-api-key` | A real OpenAI API key |
| `fluent-production/google-client-id` | Google Web OAuth client ID |
| `fluent-production/google-client-secret` | Google Web OAuth client secret |

Create the Google client in Google Cloud Console with application type **Web application**. You can initially add the local callback `http://localhost:3000/api/auth/callback/google`; add the remote callback after AWS produces the application URL.

Do not commit these values or add them to GitHub Actions. The EC2 instance reads them directly from Secrets Manager using its IAM role. The retained `fluent-production/auth-secret` from the original deployment is imported rather than recreated; do not delete it. CDK generates the database credential and a separately named CloudFront origin-verification secret.

### 3. Create the GitHub OIDC deploy role

Run the one-time CI bootstrap using your administrator AWS identity:

```powershell
$env:AWS_REGION = "eu-north-1"
$env:AWS_DEFAULT_REGION = "eu-north-1"
$env:CDK_DEFAULT_REGION = "eu-north-1"
npm run aws:ci-bootstrap -- --context githubRepo="selikhovgleb/fluent" --context githubOwnerId="36789374" --context githubRepositoryId="1331360323" --context githubBranch="main" --context deploymentRegion="eu-central-1"
```

The bootstrap CloudFormation stack already exists in Stockholm (`eu-north-1`), while `deploymentRegion` deliberately grants deployment access to Frankfurt (`eu-central-1`). Run this command again once after upgrading the infrastructure; it adds the narrowly scoped Systems Manager permissions that GitHub Actions needs to roll out images on EC2.

Copy the `GitHubDeployRoleArn` output. The trust policy accepts only the immutable GitHub identity for the `selikhovgleb/fluent` repository's `main` branch and the standard AWS audience. The owner and repository IDs protect this trust across renames and prevent recycled names from inheriting access.

If the AWS account already has the GitHub Actions OIDC provider, import it instead of creating a duplicate:

```powershell
npm run aws:ci-bootstrap -- --context githubRepo="selikhovgleb/fluent" --context githubOwnerId="36789374" --context githubRepositoryId="1331360323" --context githubBranch="main" --context deploymentRegion="eu-central-1" --context githubOidcProviderArn="arn:aws:iam::AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
```

### 4. Configure GitHub repository variables

Open **GitHub → selikhovgleb/fluent → Settings → Secrets and variables → Actions → Variables** and add:

| Variable | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `GitHubDeployRoleArn` from step 3 |
| `AWS_REGION` | `eu-central-1` |
| `ADMIN_EMAILS` | Google email(s) allowed into `/admin`, comma-separated |

These are identifiers/configuration, not credentials. No AWS access-key GitHub secrets are needed.

Delete the old `APP_BASE_URL` repository variable if it exists. The deployment now derives this value from the CloudFront stack output.

### 5. Deploy the application

The workflow at `.github/workflows/deploy-production.yml` runs for every push to `main`, including merged pull requests. It performs:

1. `npm ci`
2. lint and production build/tests
3. AWS authentication with a short-lived GitHub OIDC token
4. required-secret existence checks
5. CDK synthesis and infrastructure deployment
6. an in-place container rollout through Systems Manager
7. a live `GET /api/health` check

Trigger the workflow from the **Actions** tab with **Run workflow**, or merge/push to `main`. CloudFront deployment can take several minutes. Read the generated HTTPS URL from the stack output:

```powershell
aws cloudformation describe-stacks --stack-name FluentProduction --region eu-central-1 --query "Stacks[0].Outputs[?OutputKey=='ApplicationUrl'].OutputValue" --output text
```

It will look like `https://d123example.cloudfront.net`. The workflow injects this exact URL into the application and verifies `/api/health` through CloudFront.

### 6. Finish Google OAuth

In the Google Web OAuth client, add the generated hostname from `ApplicationUrl`:

| Setting | Value |
| --- | --- |
| Authorized JavaScript origin | `https://d123example.cloudfront.net` |
| Authorized redirect URI | `https://d123example.cloudfront.net/api/auth/callback/google` |

Google requires the redirect URI to match exactly, including `https` and the callback path. After saving these settings, sign-in works without another AWS deployment. If you change a Google credential or another application secret in Secrets Manager, run the workflow again so the container refreshes its environment.

### 7. Optional EC2 sizing

The default instance is `t3.small` (2 GiB RAM). Override it during a manual synth/deploy with `--context instanceType=t3.micro` or another compatible x86 instance type. Keep `t3.small` initially; the Docker build happens in GitHub Actions/CDK, but Next.js, Caddy, Docker, and the operating system still share the instance memory.

## Local development

Copy `.env.example` to `.env.local` and provide real local values. For Google OAuth, authorize `http://localhost:3000/api/auth/callback/google`. The AWS identity running Next.js needs RDS Data API and database-secret access.

```powershell
npm run dev
```

## Database migrations

The source schema is `db/schema.ts`. Generate and inspect a migration after schema changes:

```powershell
npm run db:generate
```

Place the approved SQL migration in `infra/migration/`. CDK fingerprints that directory, and the migration Lambda records each applied filename. Never edit an already-applied migration.

## Local validation

```powershell
npm run lint
npm test
npm run aws:synth -- --context adminEmails="you@gmail.com"
npx cdk synth --app "node infra/ci-bootstrap.mjs"
```

## Cost and safety

- Aurora has deletion protection and a snapshot removal policy. Aurora, CloudFront, the EC2 instance, its EBS volume, Elastic IP usage, ECR, Secrets Manager, CloudWatch, data transfer, and OpenAI usage can create charges.
- The single EC2 host is a single point of failure. Docker restarts containers after a process or machine restart, but this MVP does not yet include a load balancer, multiple instances, or zero-downtime deployments.
- Set an AWS Budget and billing alert before production use.
- Only origin port 80 is open on EC2; Caddy requires CloudFront's secret origin header. The database has no public endpoint, port 22 is closed, and operational commands use Systems Manager with IAM authorization.

Official references: [GitHub OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [AWS credentials action](https://github.com/aws-actions/configure-aws-credentials), [CloudFront custom origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html), [Systems Manager Run Command](https://docs.aws.amazon.com/systems-manager/latest/userguide/run-command.html), [Aurora Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.create.html), and [RDS Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html).
