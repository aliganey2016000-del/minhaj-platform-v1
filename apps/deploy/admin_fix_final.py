"""Fix admin: use Node script with Mongoose model for proper password hashing"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

# Create a Node script that uses the actual User model for proper password hashing
node_script = r"""
const mongoose = require('mongoose');
const User = require('./models/user.model');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/masjid-al-rahma', { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to MongoDB');
  
  // Delete existing admin
  await User.deleteOne({ email: 'admin@masjidalrahma.com' });
  console.log('Deleted old admin');
  
  // Create new admin with proper password hashing via Mongoose
  const admin = new User({
    email: 'admin@masjidalrahma.com',
    password: 'Admin@2025Secure!',
    role: 'admin',
    isVerified: true,
    isActive: true,
    preferredLanguage: 'en',
    tokenVersion: 0,
    failedLoginAttempts: 0
  });
  
  await admin.save();
  console.log('Admin created with ID:', admin._id);
  console.log('Role:', admin.role);
  console.log('Password hashed via Mongoose pre-save hook');
  
  // Also create a Profile
  const Profile = require('./models/profile.model');
  await Profile.deleteOne({ user: admin._id });
  await Profile.create({
    user: admin._id,
    firstName: 'Admin',
    lastName: 'User',
    gender: 'male'
  });
  console.log('Profile created');
  
  await mongoose.disconnect();
  console.log('DONE');
}
run().catch(e => { console.error(e); process.exit(1); });
"""

run_cmd(c, f"cat > /tmp/create-admin.js << 'NODEEOF'\n{node_script}\nNODEEOF")

print("\nRunning admin creation script via Node.js...")
_, out, err = run_cmd(c, "cd /var/www/masjid-al-rahma/backend && node /tmp/create-admin.js 2>&1")
print(f"Script output: {out}")
if err:
    print(f"Errors: {err}")

# Test login
print("\nTesting admin login...")
_, login, _ = run_cmd(c,
    'curl -s -X POST http://localhost:5000/api/v1/auth/login '
    '-H "Content-Type: application/json" '
    '-d "{\\"email\\":\\"admin@masjidalrahma.com\\",\\"password\\":\\"Admin@2025Secure!\\"}" 2>&1')
print(f"Login: {login[:300]}")

if 'accessToken' in login:
    # Extract role
    if '"role":"admin"' in login:
        print("\n✅ Admin login successful with role: admin")
    else:
        print("\n✅ Login successful — check role in response above")

print(f"\n{'=' * 60}")
print(f"ADMIN CREDENTIALS:")
print(f"  Email:    admin@masjidalrahma.com")
print(f"  Password: Admin@2025Secure!")
print(f"  Login at: http://{VPS_HOST}/")
print(f"{'=' * 60}")

c.close()