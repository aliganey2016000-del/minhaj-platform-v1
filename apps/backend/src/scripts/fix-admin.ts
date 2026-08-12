/**
 * Fix Admin Script
 *
 * Resets the admin user password and unlocks the account.
 * Run: MONGODB_URI=... NEW_ADMIN_PASSWORD=... npx ts-node src/scripts/fix-admin.ts
 */

import mongoose from 'mongoose';
import User from '../models/user.model';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} env var is required to run this script.`);
  }
  return value;
}

const MONGODB_URI = requireEnv('MONGODB_URI');
const NEW_PASSWORD = requireEnv('NEW_ADMIN_PASSWORD');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@masjidalrahma.com';

async function fixAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const user = await User.findOne({ email: ADMIN_EMAIL }).select('+password +failedLoginAttempts +lockedUntil');

    if (!user) {
      console.log('❌ Admin user not found! Creating new admin...');
      const Profile = (await import('../models/profile.model')).default;
      
      const newUser = await User.create({
        email: ADMIN_EMAIL,
        password: NEW_PASSWORD,
        role: 'admin',
        isVerified: true,
        isActive: true,
        preferredLanguage: 'en',
      });

      await Profile.create({
        user: newUser._id,
        firstName: 'Admin',
        lastName: 'User',
        gender: 'male',
      });

      console.log('✅ Admin user created successfully');
    } else {
      // Update password, role, and unlock account
      user.password = NEW_PASSWORD;
      user.role = 'admin';
      user.organizationId = undefined;
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      user.isVerified = true;
      user.isActive = true;
      await user.save();

      console.log('✅ Admin user updated successfully');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 Email:    ${ADMIN_EMAIL}`);
    console.log('🔑 Password: (value of NEW_ADMIN_PASSWORD)');
    console.log('👤 Role:     admin');
    console.log('🔓 Status:   Unlocked & Active');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAdmin();