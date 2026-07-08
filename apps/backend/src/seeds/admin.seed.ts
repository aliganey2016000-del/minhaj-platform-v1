/**
 * Admin User Seed Script
 * 
 * Creates a default admin user in the database.
 * Run: npx ts-node src/seeds/admin.seed.ts
 */

import mongoose from 'mongoose';
import User from '../models/user.model';
import Profile from '../models/profile.model';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rayan2016003_db_user:635110Liiali@rahma.bo0elay.mongodb.net/masjid-al-rahma?appName=rahma&retryWrites=true&w=majority';

const ADMIN_USER = {
  email: 'admin@masjidalrahma.com',
  password: 'Admin@123',
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
    console.log('📧 Email:    admin@masjidalrahma.com');
    console.log('🔑 Password: Admin@123');
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