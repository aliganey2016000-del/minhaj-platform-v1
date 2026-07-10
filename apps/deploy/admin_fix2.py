"""Fix admin — run Node script from correct directory with node_modules"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

# 1. Delete existing admin via mongosh
print("1. Deleting old admin...")
_, out, _ = run_cmd(c, 'mongosh --quiet --eval "use masjid-al-rahma; db.users.deleteOne({email:\\\"admin@masjidalrahma.com\\\"}); db.profiles.deleteOne({}); print(\"CLEANED\");" 2>&1')
print(f"   Delete: {out}")

# 2. Run the script from the backend directory (where node_modules is)
print("2. Creating admin via Node script...")
# The script needs to run from backend directory for module resolution
node_script = """
const mongoose = require('mongoose');
const path = require('path');
// Load models from the backend dist directory
const User = require('./models/user.model');
const Profile = require('./models/profile.model');

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/masjid-al-rahma');
    console.log('MONGO_CONNECTED');
    
    await User.deleteOne({ email: 'admin@masjidalrahma.com' });
    console.log('OLD_ADMIN_DELETED');
    
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
    console.log('ADMIN_CREATED:' + admin._id);
    console.log('ROLE:' + admin.role);
    
    await Profile.deleteOne({ user: admin._id });
    await Profile.create({
        user: admin._id,
        firstName: 'Admin',
        lastName: 'User',
        gender: 'male'
    });
    console.log('PROFILE_OK');
    await mongoose.disconnect();
    console.log('SUCCESS');
}
run().catch(e => { console.error('ERROR:' + e.message); process.exit(1); });
"""
run_cmd(c, f"cat > /tmp/admin-create.js << 'EOF'\n{node_script}\nEOF")

# Run from backend directory where node_modules is
_, out, err = run_cmd(c, "cd /var/www/masjid-al-rahma/backend && NODE_PATH=./node_modules node /tmp/admin-create.js 2>&1")
print(f"   Script: {out}")
if err:
    print(f"   Error: {err}")

# 3. Verify admin exists
print("3. Verifying admin...")
_, check, _ = run_cmd(c, 'mongosh --quiet masjid-al-rahma --eval "JSON.stringify(db.users.findOne({email:\\\"admin@masjidalrahma.com\\\"},{email:1,role:1,isActive:1,isVerified:1}))" 2>&1')
print(f"   Admin doc: {check}")

# 4. Test login
print("4. Testing login...")
_, login, _ = run_cmd(c,
    'curl -s -X POST http://localhost:5000/api/v1/auth/login '
    '-H "Content-Type: application/json" '
    '--data-raw \'{"email":"admin@masjidalrahma.com","password":"Admin@2025Secure!"}\' 2>&1')
print(f"   Login: {login[:300]}")

if '"accessToken"' in login and '"role":"admin"' in login:
    print("\n✅ ADMIN LOGIN SUCCESSFUL — Role: admin")
else:
    print("\n⚠️ Login still failing. Checking password...")
    # Alternative: use the backend register API then upgrade role
    _, reg, _ = run_cmd(c,
        'curl -s -X POST http://localhost:5000/api/v1/auth/register '
        '-H "Content-Type: application/json" '
        '-d \'{"email":"admin2@masjidalrahma.com","password":"Admin@2025Secure!","firstName":"Admin","lastName":"User","gender":"male","role":"student"}\' 2>&1')
    print(f"   Register alt: {reg[:200]}")
    if 'accessToken' in reg:
        # Upgrade to admin
        _, up, _ = run_cmd(c, 
            'mongosh --quiet masjid-al-rahma --eval '
            '"db.users.updateOne({email:\\\"admin2@masjidalrahma.com\\\"},{\\\"$set\\\":{role:\\\"admin\\\"}})"'
            ' 2>&1')
        print(f"   Upgrade: {up}")
        _, login2, _ = run_cmd(c,
            'curl -s -X POST http://localhost:5000/api/v1/auth/login '
            '-H "Content-Type: application/json" '
            '--data-raw \'{"email":"admin2@masjidalrahma.com","password":"Admin@2025Secure!"}\' 2>&1')
        print(f"   Login alt: {login2[:300]}")
        if '"accessToken"' in login2:
            print("\n✅ ADMIN LOGIN SUCCESSFUL (admin2)")
            print(f"   Email: admin2@masjidalrahma.com")

print(f"\n{'=' * 60}")
print(f"Login at: http://{VPS_HOST}/")
print(f"{'=' * 60}")

c.close()