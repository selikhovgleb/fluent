# Fluent English Coach

Fluent is a production Next.js application for AI writing correction and vocabulary review. It runs on AWS App Runner, stores user data in Aurora PostgreSQL Serverless v2 through the RDS Data API, and uses Google OAuth through Auth.js.

## What is real today

- Google-only sign-in protects every app page and API except auth callbacks and health checks.
- Writing corrections come from the OpenAI API. Failed AI calls display an error; the UI does not fabricate a local result.
- Corrections, scores, and mistake categories are recorded in PostgreSQL. Original/corrected text is stored only when the user enables sentence history.
- Profile preferences and statistics come from PostgreSQL.
- Vocabulary entries and spaced-review events are persisted in PostgreSQL.
- The focus-word panel uses saved account data. A true always-on-top desktop widget and notifications are explicitly marked as not implemented.
- The admin dashboard reads live operational and learning data from PostgreSQL.

## AWS architecture

- **App Runner** serves the container over public HTTPS.
- **ECR** stores immutable application images built by CDK.
- **Aurora PostgreSQL Serverless v2** stores user, correction, and vocabulary data in private isolated subnets.
- **RDS Data API** connects App Runner to PostgreSQL without exposing the database publicly.
- **Secrets Manager** stores OpenAI, Google OAuth, Auth.js, and database credentials.
- **Lambda + a CloudFormation custom resource** apply versioned SQL migrations.
- **GitHub Actions + AWS OIDC** deploy every push/merge to `main` without long-lived AWS access keys in GitHub.

## One-time production setup

### 1. Prerequisites

Install Node.js 22.13+, Docker Desktop (Linux containers), AWS CLI v2, and Git. Configure an AWS identity with permission to bootstrap CDK and create the resources above.

```powershell
aws configure
aws sts get-caller-identity
npm ci
```

This project is configured for AWS Europe (Stockholm), `eu-north-1`. Keep CDK, Secrets Manager, and GitHub Actions in this same region.

```powershell
$AwsAccount = aws sts get-caller-identity --query Account --output text
$AwsRegion = "eu-north-1"
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

Do not commit these values or add them to GitHub Actions. App Runner reads them directly from Secrets Manager. CDK generates the Auth.js secret and database credential securely.

### 3. Create the GitHub OIDC deploy role

Run the one-time CI bootstrap using your administrator AWS identity:

```powershell
npm run aws:ci-bootstrap -- --context githubRepo="selikhovgleb/fluent" --context githubOwnerId="36789374" --context githubRepositoryId="1331360323" --context githubBranch="main"
```

Copy the `GitHubDeployRoleArn` output. The trust policy accepts only the immutable GitHub identity for the `selikhovgleb/fluent` repository's `main` branch and the standard AWS audience. The owner and repository IDs protect this trust across renames and prevent recycled names from inheriting access.

If the AWS account already has the GitHub Actions OIDC provider, import it instead of creating a duplicate:

```powershell
npm run aws:ci-bootstrap -- --context githubRepo="selikhovgleb/fluent" --context githubOwnerId="36789374" --context githubRepositoryId="1331360323" --context githubBranch="main" --context githubOidcProviderArn="arn:aws:iam::AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
```

### 4. Configure GitHub repository variables

Open **GitHub → selikhovgleb/fluent → Settings → Secrets and variables → Actions → Variables** and add:

| Variable | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `GitHubDeployRoleArn` from step 3 |
| `AWS_REGION` | `eu-north-1` |
| `ADMIN_EMAILS` | Google email(s) allowed into `/admin`, comma-separated |
| `APP_BASE_URL` | Optional custom-domain HTTPS URL; leave unset for the App Runner URL |

These are identifiers/configuration, not credentials. No AWS access-key GitHub secrets are needed.

### 5. Trigger the first deployment

The workflow at `.github/workflows/deploy-production.yml` runs for every push to `main`, including merged pull requests. It performs:

1. `npm ci`
2. lint and production build/tests
3. AWS authentication with a short-lived GitHub OIDC token
4. required-secret existence checks
5. CDK synthesis and deployment
6. a live `GET /api/health` check against the App Runner URL

Trigger it from the **Actions** tab with **Run workflow**, or merge/push to `main`. The successful run summary contains the public application URL.

### 6. Finish Google OAuth

Read the deployed URL if needed:

```powershell
aws cloudformation describe-stacks --stack-name FluentProduction --query "Stacks[0].Outputs[?OutputKey=='ApplicationUrl'].OutputValue" --output text
```

Add the following authorized redirect URI to the Google Web OAuth client:

```text
https://YOUR-APP-RUNNER-URL/api/auth/callback/google
```

If you changed either Google credential value in Secrets Manager, start another workflow deployment so App Runner receives the current secret values.

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

- Aurora has deletion protection and snapshot removal policy; App Runner keeps one warm instance. Both create ongoing AWS charges.
- App Runner, ECR, Secrets Manager, CloudWatch, data transfer, and OpenAI usage are billable.
- Set an AWS Budget and billing alert before production use.
- The database has no public endpoint, and the GitHub deployment role can only assume this account's CDK bootstrap roles plus perform narrow preflight reads.

Official references: [GitHub OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [AWS credentials action](https://github.com/aws-actions/configure-aws-credentials), [App Runner image services](https://docs.aws.amazon.com/apprunner/latest/dg/service-source-image.html), [Aurora Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.create.html), and [RDS Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html).
