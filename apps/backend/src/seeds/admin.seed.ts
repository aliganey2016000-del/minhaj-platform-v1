/**
 * Admin User Seed Script
 *
 * Creates a default admin user in the database.
 * Run: MONGODB_URI=... SEED_ADMIN_PASSWORD=... npx ts-node src/seeds/admin.seed.ts
 */

import mongoose from 'mongoose';
import User from '../models/user.model';
import Profile from '../models/profile.model';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} env var is required to run this script.`);
  }
  return value;
}

const MONGODB_URI = requireEnv('MONGODB_URI');
const SEED_ADMIN_PASSWORD = requireEnv('SEED_ADMIN_PASSWORD');
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@masjidalrahma.com';

const ADMIN_USER = {
  email: SEED_ADMIN_EMAIL,
  password: SEED_ADMIN_PASSWORD,
  firstName: 'Admin',
  lastName: 'User',
  gender: 'male',
};

async function seedAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existing = await User.findOne({ email: ADMIN_USER.email });
    if (existing) {
      console.log('⚠️ Admin user already exists. Updating password...');
      existing.password = ADMIN_USER.password;
      await existing.save();
      console.log('✅ Admin password updated');
    } else {
      // Create User
      const user = await User.create({
        email: ADMIN_USER.email,
        password: ADMIN_USER.password,
        role: 'admin',
        isVerified: true,
        isActive: true,
        preferredLanguage: 'en',
      });

      // Create Profile
      await Profile.create({
        user: user._id,
        firstName: ADMIN_USER.firstName,
        lastName: ADMIN_USER.lastName,
        gender: ADMIN_USER.gender,
      });

      console.log('✅ Admin user created successfully');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 Email:    ${ADMIN_USER.email}`);
    console.log('🔑 Password: (value of SEED_ADMIN_PASSWORD)');
    console.log('👤 Role:     admin');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 Login at: http://localhost:5173/auth/login');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

seedAdmin();