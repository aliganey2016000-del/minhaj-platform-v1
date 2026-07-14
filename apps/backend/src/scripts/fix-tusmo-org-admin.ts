/**
 * Fix Org Admin — "tusmo" organization
 *
 * The org_admin sync hook (school.controller.ts create()) failed silently
 * for this specific organization before that path had try/catch error
 * logging, leaving the school registered with no matching login account.
 * This script finds the "tusmo" school by its registered email and
 * creates/repairs the matching org_admin user (email + phone-as-password,
 * hashed once via the model's pre-save hook).
 *
 * Run: npx ts-node src/scripts/fix-tusmo-org-admin.ts
 */

import mongoose from 'mongoose';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import School from '../models/school.model';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rayan2016003_db_user:635110Liiali@rahma.bo0elay.mongodb.net/masjid-al-rahma?appName=rahma&retryWrites=true&w=majority';

const TARGET_EMAIL = 'diriye1@gmail.com';

async function fixTusmoOrgAdmin() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const school = await School.findOne({ email: TARGET_EMAIL.toLowerCase() });
  if (!school) {
    console.error(`❌ No school found with email "${TARGET_EMAIL}". Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`🏫 Found organization: "${school.name}" (phone: ${school.phone})`);

  let user = await User.findOne({ email: TARGET_EMAIL.toLowerCase() }).select('+password +failedLoginAttempts +lockedUntil');

  if (user) {
    console.log('⚠️  User already exists — repairing role, password, and lock state...');
    user.role = 'org_admin';
    user.password = school.phone; // re-set raw value; pre-save hook hashes it once
    user.organizationId = school._id;
    user.isVerified = true;
    user.isActive = true;
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
    console.log('✅ User repaired.');
  } else {
    console.log('⚠️  No user found — creating org_admin account...');
    user = await User.create({
      email: TARGET_EMAIL.toLowerCase(),
      password: school.phone,
      role: 'org_admin',
      organizationId: school._id,
      isVerified: true,
      isActive: true,
      preferredLanguage: 'en',
    });
    await Profile.create({
      user: user._id,
      firstName: school.principalName || 'Principal',
      lastName: '',
      gender: 'male',
    });
    console.log('✅ User created with profile.');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Email:    ', TARGET_EMAIL);
  console.log('🔑 Password: ', school.phone, '(the organization phone number)');
  console.log('👤 Role:     org_admin');
  console.log('🏢 Org:      ', school.name, `(${school._id})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 Login at: http://localhost:5173/auth/login');

  await mongoose.disconnect();
  process.exit(0);
}

fixTusmoOrgAdmin().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
