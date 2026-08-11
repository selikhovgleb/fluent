import { readdir, readFile } from "node:fs/promises";
import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({});
const database = process.env.DATABASE_NAME;
const resourceArn = process.env.DATABASE_RESOURCE_ARN;
const secretArn = process.env.DATABASE_SECRET_ARN;

export async function handler(event) {
  const fingerprint = event.ResourceProperties.MigrationFingerprint;
  const physicalResourceId = `fluent-postgres-${fingerprint.slice(0, 16)}`;
  if (event.RequestType === "Delete") return { PhysicalResourceId: physicalResourceId };

  const base = { database, resourceArn, secretArn };
  await client.send(new ExecuteStatementCommand({
    ...base,
    sql: "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  }));
  const directory = new URL("./", import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) await applyMigration(base, name, await readFile(new URL(name, directory), "utf8"));
  return { PhysicalResourceId: physicalResourceId };
}

async function applyMigration(base, version, source) {
  const existing = await client.send(new ExecuteStatementCommand({
    ...base,
    sql: "SELECT version FROM schema_migrations WHERE version = :version",
    parameters: [{ name: "version", value: { stringValue: version } }],
  }));
  if (existing.records?.length) return;

  const statements = source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
  const transaction = await client.send(new BeginTransactionCommand(base));
  try {
    for (const sql of statements) {
      await client.send(new ExecuteStatementCommand({ ...base, transactionId: transaction.transactionId, sql }));
    }
    await client.send(new ExecuteStatementCommand({
      ...base,
      transactionId: transaction.transactionId,
      sql: "INSERT INTO schema_migrations (version) VALUES (:version)",
      parameters: [{ name: "version", value: { stringValue: version } }],
    }));
    await client.send(new CommitTransactionCommand({ ...base, transactionId: transaction.transactionId }));
  } catch (error) {
    await client.send(new RollbackTransactionCommand({ ...base, transactionId: transaction.transactionId }));
    throw error;
  }
}
