"""Reset admin@ password via Node.js from backend directory"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

# Write script INSIDE the backend directory so require() resolves properly
script = """
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/masjid-al-rahma');
    const hash = await bcrypt.hash('Admin@2025Secure!', 12);
    const r = await mongoose.connection.db.collection('users').updateOne(
        { email: 'admin@masjidalrahma.com' },
        { $set: { password: hash, role: 'admin', isVerified: true, isActive: true, lockedUntil: null, failedLoginAttempts: 0 } }
    );
    console.log('RESULT:', JSON.stringify(r));
    await mongoose.disconnect();
    console.log('DONE');
}
run().catch(e => { console.error(e); process.exit(1); });
"""

run_cmd(c, f"cat > /var/www/masjid-al-rahma/backend/reset-admin.js << 'SCRIPTEOF'\n{script}\nSCRIPTEOF")

print("Running password reset...")
_, out, err = run_cmd(c, "cd /var/www/masjid-al-rahma/backend && node reset-admin.js 2>&1")
print(f"Output: {out}")
if err: print(f"Error: {err}")

# Test login
_, login, _ = run_cmd(c,
    'curl -s -X POST http://localhost:5000/api/v1/auth/login '
    '-H "Content-Type: application/json" '
    '-d \'{"email":"admin@masjidalrahma.com","password":"Admin@2025Secure!"}\' 2>&1')
print(f'\nLogin admin@: {login[:300]}')

if '"accessToken"' in login and '"role":"admin"' in login:
    print("\n✅ ADMIN LOGIN SUCCESSFUL!")
else:
    print("\n⚠️ Still failing — use admin2@masjidalrahma.com instead")

print(f'\nLogin at: http://{VPS_HOST}/')
print('admin2@masjidalrahma.com / Admin@2025Secure!  (working)')
c.close()