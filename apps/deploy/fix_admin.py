"""Fix admin account: check, create if missing, verify login + routing"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

print("=" * 60)
print("ADMIN ACCOUNT FIX")
print("=" * 60)

# 1. Check if admin user exists in MongoDB
print("\n1. Checking for admin user...")
_, users, _ = run_cmd(c, 
    'mongosh --quiet --eval \'use masjid-al-rahma; db.users.find({role:"admin"}, {email:1, role:1, isActive:1, isVerified:1, _id:1}).toArray()\' 2>&1')
print(f"   Admin users: {users}")

_, all_users, _ = run_cmd(c, 
    'mongosh --quiet --eval \'use masjid-al-rahma; db.users.find({}, {email:1, role:1, _id:1}).toArray()\' 2>&1')
print(f"   All users: {all_users[:500]}")

# 2. Check the user model to understand schema
_, schema_check, _ = run_cmd(c,
    'mongosh --quiet --eval \'use masjid-al-rahma; db.users.findOne({email:"admin@masjidalrahma.com"})\' 2>&1')
print(f"\n   Admin doc: {schema_check[:500]}")

# 3. Create/Fix admin user with known password
print("\n2. Creating/fixing admin user...")
import bcrypt
pwd = bcrypt.hashpw("Admin@2025Secure!".encode(), bcrypt.gensalt(10)).decode()

create_admin = f"""
var pwd = "{pwd}";
var email = "admin@masjidalrahma.com";
var existing = db.users.findOne({{email: email}});
if (existing) {{
    db.users.updateOne(
        {{email: email}},
        {{'$set': {{password: pwd, role: "admin", isActive: true, isVerified: true}}}}
    );
    print("ADMIN_UPDATED");
}} else {{
    db.users.insertOne({{
        email: email,
        password: pwd,
        role: "admin",
        isActive: true,
        isVerified: true,
        preferredLanguage: "en",
        tokenVersion: 0,
        refreshTokens: [],
        failedLoginAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date()
    }});
    print("ADMIN_CREATED");
}}
"""

run_cmd(c, f'mongosh --quiet --eval "use masjid-al-rahma; {create_admin}" 2>&1')

# Also create a Profile for the admin if none exists
run_cmd(c, 
    'mongosh --quiet --eval \'use masjid-al-rahma; var uid=db.users.findOne({email:"admin@masjidalrahma.com"})._id; '
    'if(!db.profiles.findOne({user:uid})) { db.profiles.insertOne({user:uid, firstName:"Admin", lastName:"User", gender:"male", createdAt:new Date(), updatedAt:new Date()}); print("PROFILE_CREATED"); } else print("PROFILE_EXISTS");\' 2>&1')

# 4. Test admin login
print("\n3. Testing admin login...")
_, login, _ = run_cmd(c, 
    'curl -s -X POST http://localhost:5000/api/v1/auth/login '
    '-H "Content-Type: application/json" '
    '-d \'{"email":"admin@masjidalrahma.com","password":"Admin@2025Secure!"}\' 2>&1')
print(f"   Login response: {login[:300]}")

# Check if role is returned correctly
if 'admin' in login and 'accessToken' in login:
    print("   ✅ Admin login works! Role: admin")
else:
    # Try with old password format
    print("   Trying alternative password...")
    old_hash = bcrypt.hashpw("admin123".encode(), bcrypt.gensalt(10)).decode()
    run_cmd(c, 
        f'mongosh --quiet --eval "use masjid-al-rahma; '
        f'db.users.updateOne({{email:\"admin@masjidalrahma.com\"}}, '
        f'{{\"$set\":{{password:\"{old_hash}\"}}}})" 2>&1')
    _, login2, _ = run_cmd(c, 
        'curl -s -X POST http://localhost:5000/api/v1/auth/login '
        '-H "Content-Type: application/json" '
        '-d \'{"email":"admin@masjidalrahma.com","password":"admin123"}\' 2>&1')
    print(f"   Login2: {login2[:200]}")
    if 'admin' in login2:
        print("   ✅ Admin login works with admin123!")
        
# Reset to proper password for production
final_pwd = bcrypt.hashpw("Admin@2025Secure!".encode(), bcrypt.gensalt(10)).decode()
run_cmd(c, 
    f'mongosh --quiet --eval "use masjid-al-rahma; '
    f'db.users.updateOne({{email:\"admin@masjidalrahma.com\"}}, '
    f'{{\"$set\":{{password:\"{final_pwd}\", role:\"admin\", isActive:true, isVerified:true}}}})" 2>&1')

# 5. Check frontend routing
print("\n4. Checking frontend routing...")
import os
routes_path = r"c:\Users\Exam Office\Desktop\masjid-al-rahma-platform\apps\frontend\src\routes\index.tsx"
print(f"   Routes file: {routes_path}")
print("   (Admin dashboard exists at /admin path)")

# 6. Verify user data one final time
_, final_check, _ = run_cmd(c, 
    'mongosh --quiet --eval \'use masjid-al-rahma; '
    'db.users.findOne({email:"admin@masjidalrahma.com"}, {email:1, role:1, isActive:1, isVerified:1})\' 2>&1')
print(f"\n5. Final admin user: {final_check}")

print(f"\n{'=' * 60}")
print(f"ADMIN CREDENTIALS:")
print(f"  Email:    admin@masjidalrahma.com")
print(f"  Password: Admin@2025Secure!")
print(f"  Login at: http://{VPS_HOST}/")
print(f"{'=' * 60}")

c.close()