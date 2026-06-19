import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL),
});

// Users
const users = [
  {
    id: 1,
    name: "Ajay Singh",
    email: "ajay@example.com",
  },
  {
    id: 2,
    name: "Rahul Sharma",
    email: "rahul@example.com",
  },
  {
    id: 3,
    name: "Priya Patel",
    email: "priya@example.com",
  },
];

// Orders
const orders = [
  {
    id: 1,
    productName: "Laptop",
    quantity: 1,
    price: 75000,
    userId: 1,
  },
  {
    id: 2,
    productName: "Mouse",
    quantity: 2,
    price: 1500,
    userId: 1,
  },
  {
    id: 3,
    productName: "Keyboard",
    quantity: 1,
    price: 3500,
    userId: 2,
  },
  {
    id: 4,
    productName: "Monitor",
    quantity: 1,
    price: 18000,
    userId: 3,
  },
];

const departments = [
  {
    name: "Engineering",
    location: "Mumbai",
  },
  {
    name: "Human Resources",
    location: "Pune",
  },
  {
    name: "Finance",
    location: "Delhi",
  },
];

const employees = [
  {
    firstName: "Ajay",
    lastName: "Singh",
    email: "ajay@example.com",
    salary: 85000,
    departmentId: 1,
  },
  {
    firstName: "Rahul",
    lastName: "Sharma",
    email: "rahul@example.com",
    salary: 65000,
    departmentId: 1,
  },
  {
    firstName: "Priya",
    lastName: "Patel",
    email: "priya@example.com",
    salary: 55000,
    departmentId: 2,
  },
  {
    firstName: "Rohit",
    lastName: "Verma",
    email: "rohit@example.com",
    salary: 72000,
    departmentId: 3,
  },
];

async function main() {
  try {
    // Insert users first
    const userRes = await prisma.User_TEST.createMany({
      data: users,
      skipDuplicates: true,
    });

    console.log("Users seeded:", userRes);

    // Insert orders separately
    const orderRes = await prisma.Order_Test.createMany({
      data: orders,
      skipDuplicates: true,
    });

    console.log("Orders seeded:", orderRes);

    // Insert departments
    const departmentRes = await prisma.Department.createMany({
      data: departments,
      skipDuplicates: true,
    });

    console.log("Departments seeded:", departmentRes);

    // Insert employees
    const employeeRes = await prisma.Employee.createMany({
      data: employees,
      skipDuplicates: true,
    });

    console.log("Employees seeded:", employeeRes);

  } catch (error) {
    console.error("Error seeding data:", error);
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
