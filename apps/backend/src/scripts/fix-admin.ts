/**
 * Fix Admin Script
 * 
 * Resets the admin user password and unlocks the account.
 * Run: npx ts-node src/scripts/fix-admin.ts
 */

import mongoose from 'mongoose';
import User from '../models/user.model';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rayan2016003_db_user:635110Liiali@rahma.bo0elay.mongodb.net/masjid-al-rahma?appName=rahma&retryWrites=true&w=majority';

const ADMIN_EMAIL = 'admin@masjidalrahma.com';
const NEW_PASSWORD = 'Admin@2025#Secure';

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
      // Update password and unlock account
      user.password = NEW_PASSWORD;
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      user.isVerified = true;
      user.isActive = true;
      await user.save();

      console.log('✅ Admin user updated successfully');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    admin@masjidalrahma.com');
    console.log('🔑 Password: Admin@2025#Secure');
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