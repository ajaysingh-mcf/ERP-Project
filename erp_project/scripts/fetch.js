import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL),
});

const Update = async () => {
    try {
        await prisma.user_TEST.update({
            where: { id: 1 },
            data: { name: "Ajay Singh Updated Twice" },
        });
        console.log("User updated successfully.");
    }
    catch (error) {
        console.error("Error updating user:", error);
    }
}
const fetchData = async () => {
  try {
    console.log("Fetching users...");
    const users = await prisma.user_TEST.findMany();
    console.log("Users:", users);
  }catch (error) {
        console.error("Error fetching data:", error);
    }
}
Update();
fetchData();

