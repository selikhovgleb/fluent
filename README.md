# Fluent English Coach on AWS

Fluent is a containerized Next.js application hosted on AWS App Runner. It uses
Aurora PostgreSQL Serverless v2 through the RDS Data API, Google OAuth through
Auth.js, AWS Secrets Manager for credentials, ECR for the application image,
IAM for least-privilege access, and CloudWatch for service and database logs.

## Architecture

- **AWS App Runner** runs the public HTTPS web application and scales it.
- **Amazon ECR** stores the Docker image built by CDK.
- **Aurora PostgreSQL Serverless v2** stores users, correction analytics, and vocabulary data.
- **RDS Data API** gives the app HTTPS access to PostgreSQL without a public database endpoint or VPC connector.
- **AWS Secrets Manager** stores the OpenAI key, Google OAuth credentials, Auth.js secret, and database credentials.
- **AWS IAM** limits the App Runner instance role to the required database and secrets.
- **AWS Lambda + CloudFormation custom resource** applies versioned PostgreSQL migrations during deployment.
- **CloudWatch Logs** receives App Runner and PostgreSQL logs automatically.

The stack uses private isolated subnets and no NAT Gateway. App Runner keeps its
normal internet egress for Google OAuth and the OpenAI API; the database remains private.

## 1. Prerequisites

Install:

- Node.js 22.13 or newer
- Docker Desktop, running with Linux containers
- AWS CLI v2
- An AWS account with permission to create IAM, App Runner, ECR, RDS, EC2 networking, Lambda, Secrets Manager, and CloudFormation resources
- A Google Cloud account for the OAuth client

Choose a region that supports Aurora PostgreSQL Serverless v2 and the RDS Data
API. The default is `eu-central-1`.

Configure AWS credentials:

```powershell
aws configure
aws sts get-caller-identity
```

Install the project dependencies:

```powershell
npm ci
```

## 2. Bootstrap and deploy AWS infrastructure

In PowerShell, select the account and region:

```powershell
$AwsAccount = aws sts get-caller-identity --query Account --output text
$AwsRegion = "eu-central-1"
$env:CDK_DEFAULT_ACCOUNT = $AwsAccount
$env:CDK_DEFAULT_REGION = $AwsRegion
npx cdk bootstrap "aws://$AwsAccount/$AwsRegion"
```

Deploy the stack. Replace the email with the Google account that may access
`/admin`. Multiple administrators can be comma-separated.

```powershell
npm run aws:deploy -- --context adminEmails="you@gmail.com"
```

CDK builds the Docker image, pushes it to ECR, creates Aurora PostgreSQL, applies
the schema migration, and creates the App Runner service. The deployment outputs
include `ApplicationUrl` and `AppRunnerServiceArn`.

Retrieve them again later with:

```powershell
aws cloudformation describe-stacks --stack-name FluentProduction --query "Stacks[0].Outputs" --output table
```

## 3. Add the application secrets

Open **AWS Console → Secrets Manager** in the deployed region and replace the
current values of these secrets:

| Secret name | Value |
| --- | --- |
| `fluent-production/openai-api-key` | Your OpenAI API key |
| `fluent-production/google-client-id` | Google OAuth client ID from step 4 |
| `fluent-production/google-client-secret` | Google OAuth client secret from step 4 |

`fluent-production/auth-secret` and `fluent-production/database-admin` are
generated securely by AWS; do not replace them.

Do not put any of these values in Git, Docker build arguments, CDK context, or a
committed environment file.

## 4. Configure Google-only sign-in

1. Open Google Cloud Console and create or select a project.
2. Configure **Google Auth Platform → Branding/Audience**. For development, add your Google account as a test user.
3. Create an **OAuth client ID** with application type **Web application**.
4. Copy the `ApplicationUrl` from the CloudFormation outputs.
5. Add this authorized redirect URI:

   ```text
   https://YOUR-APP-RUNNER-URL/api/auth/callback/google
   ```

6. Store the client ID and client secret in the two Secrets Manager secrets from step 3.

For production, associate a domain you control with App Runner, add
`https://your-domain.example/api/auth/callback/google` to Google, and redeploy
with the canonical URL used for metadata:

```powershell
npm run aws:deploy -- --context adminEmails="you@gmail.com" --context appBaseUrl="https://your-domain.example"
```

## 5. Restart App Runner after changing secrets

App Runner reads referenced Secrets Manager values during deployment. Start a
new deployment after changing any secret:

```powershell
$ServiceArn = aws cloudformation describe-stacks `
  --stack-name FluentProduction `
  --query "Stacks[0].Outputs[?OutputKey=='AppRunnerServiceArn'].OutputValue" `
  --output text
aws apprunner start-deployment --service-arn $ServiceArn
```

Wait until App Runner reports **Running**, then open the application URL and sign
in with Google. All application pages and AI endpoints require a Google session;
the admin route also checks the `ADMIN_EMAILS` allowlist. Only the Auth.js callback
and the App Runner health endpoint are public.

## 6. Local development against AWS PostgreSQL

Copy `.env.example` to `.env.local` and fill in the application values. Use the
Aurora cluster ARN and database secret ARN from CloudFormation/RDS. The AWS SDK
uses your local AWS CLI credentials for Data API calls.

Generate a local Auth.js secret:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

For local Google OAuth, add this second redirect URI to the same Google client:

```text
http://localhost:3000/api/auth/callback/google
```

Then run:

```powershell
npm run dev
```

Your AWS identity needs `rds-data:ExecuteStatement` and
`secretsmanager:GetSecretValue` for the deployed database resources.

## Database migrations

The source schema is in `db/schema.ts`; generated migrations are under
`drizzle/`. The initial AWS migration is packaged in `infra/migration/` and is
applied automatically and exactly once by the deployment custom resource.

After changing the schema:

```powershell
npm run db:generate
```

Copy the new generated SQL file to `infra/migration/`, inspect it, and deploy
again. CDK calculates a migration fingerprint automatically, and the migration
runner records each filename after applying it. Never edit an already-applied migration.

## Validation

```powershell
npm run lint
npm test
npm run aws:synth -- --context adminEmails="you@gmail.com"
```

## Security and cost notes

- Aurora has deletion protection enabled and takes a final snapshot on stack removal.
- Aurora can auto-pause at 0 ACUs after ten idle minutes; first access after a pause can be slower.
- App Runner keeps one provisioned instance ready (`minSize: 1`) and therefore has a continuous baseline cost.
- App Runner, Aurora, Secrets Manager, ECR storage, CloudWatch logs, and data transfer are billable AWS services.
- Set an AWS Budget and billing alert before production use.

Useful official references: [App Runner image services](https://docs.aws.amazon.com/apprunner/latest/dg/service-source-image.html), [App Runner IAM roles](https://docs.aws.amazon.com/apprunner/latest/dg/security_iam_service-with-iam.html), [Aurora Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.create.html), and [RDS Data API support](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.Aurora_Fea_Regions_DB-eng.Feature.Data_API.html).
