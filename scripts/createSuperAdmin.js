import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Admin } from "../src/models/Admin.model.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const createSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("📁 Connected to MongoDB");

    // Check if Super Admin already exists
    const existingSuperAdmin = await Admin.findOne({ role: "super_admin" });

    if (existingSuperAdmin) {
      console.log("⚠️  Super Admin already exists:");
      console.log(`   Name: ${existingSuperAdmin.name}`);
      console.log(`   Email: ${existingSuperAdmin.email}`);
      console.log(`   Role: ${existingSuperAdmin.role}`);
      process.exit(0);
    }

    // Create Super Admin data
    const superAdminData = {
      name: "System Administrator",
      email: "superadmin@hotel.com",
      password: await bcrypt.hash("superadmin123", 12),
      role: "super_admin",
      department: "system",
      employeeId: "SUPER001",
      assignedBranches: [],
      permissions: {
        manageBranches: true,
        manageUsers: true,
        manageManagers: true,
        manageStaff: true,
        manageMenu: true,
        managePricing: true,
        manageOffers: true,
        viewReports: true,
        viewAnalytics: true,
        viewFinancials: true,
        manageInventory: true,
        manageSystem: true,
        manageAdmins: true,
      },
      isEmailVerified: true,
      status: "active",
      createdAt: new Date(),
    };

    // Create Super Admin
    const superAdmin = new Admin(superAdminData);
    await superAdmin.save();

    console.log("🎉 Super Admin created successfully!");
    console.log("📋 Login Credentials:");
    console.log(`   Email: ${superAdminData.email}`);
    console.log(`   Password: superadmin123`);
    console.log(`   Role: ${superAdminData.role}`);
    console.log("\n🚀 You can now start the server and login!");
  } catch (error) {
    console.error("❌ Error creating Super Admin:", error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

// Run the script
createSuperAdmin();
