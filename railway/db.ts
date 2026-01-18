// Database client for Railway deployment (PostgreSQL)
// This file replaces db.ts when deploying to Railway

import { PrismaClient } from "../generated/prisma";

const prismaClient = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

export const db = prismaClient;
