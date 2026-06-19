import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL),
});

async function testConnection() {
  try {
    console.log("Connecting to database...");
    await prisma.$connect();
    console.log("Connection successful!");

    const result = await prisma.$queryRaw`SELECT NOW() AS now`;
    console.log("Server time:", result[0]?.now ?? result[0]);

    console.log("Database connection test passed.");
  } catch (error) {
    console.error("Connection failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
