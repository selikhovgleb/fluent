import { RDSDataClient } from "@aws-sdk/client-rds-data";
import { drizzle } from "drizzle-orm/aws-data-api/pg";
import * as schema from "./schema";

let database: ReturnType<typeof createDatabase> | undefined;

export function getDb() {
  database ??= createDatabase();
  return database;
}

function createDatabase() {
  const databaseName = required("DATABASE_NAME");
  const resourceArn = required("DATABASE_RESOURCE_ARN");
  const secretArn = required("DATABASE_SECRET_ARN");
  const client = new RDSDataClient({ region: process.env.AWS_REGION });
  return drizzle(client, { database: databaseName, resourceArn, secretArn, schema });
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
