import { Account, Client, Databases, ID, Query, Storage } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;

function assertEnv() {
  if (!endpoint || !projectId || !databaseId) {
    throw new Error("Missing Appwrite endpoint/project/database environment variables.");
  }
}

export function createAdminServices() {
  assertEnv();

  if (!apiKey) {
    throw new Error("Missing APPWRITE_API_KEY for server APIs.");
  }

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);

  return {
    databases: new Databases(client),
    storage: new Storage(client),
  };
}

export function createSessionAccount(session) {
  assertEnv();

  if (!session) {
    throw new Error("Missing Appwrite session token.");
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setSession(session);

  return new Account(client);
}

export function createJWTAccount(jwt) {
  assertEnv();

  if (!jwt) {
    throw new Error("Missing Appwrite JWT token.");
  }

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt);

  return new Account(client);
}

export { ID, InputFile, Query, databaseId };
