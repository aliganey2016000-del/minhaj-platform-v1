"""Create admin user via the backend API (proper bcrypt hashing)"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

print("Creating admin user via API...")

# Step 1: Create admin via register endpoint
cmd = (
    'curl -s -X POST http://localhost:5000/api/v1/auth/register '
    '-H "Content-Type: application/json" '
    '-d \'{"email":"admin@masjidalrahma.com","password":"Admin@2025Secure!",'
    '"firstName":"Admin","lastName":"User","gender":"male",'
    '"role":"student","preferredLanguage":"en"}\' 2>&1'
)
_, result, _ = run_cmd(c, cmd)
print(f"Register result: {result[:300]}")

# Step 2: Change role to admin directly in MongoDB
_, update, _ = run_cmd(c, 
    'mongosh --quiet masjid-al-rahma --eval '
    '"db.users.updateOne({email:\\\"admin@masjidalrahma.com\\\"}, '
    '{\\\"$set\\\":{role:\\\"admin\\\",isVerified:true,isActive:true}})"'
    ' 2>&1')
print(f"Role update: {update}")

# Step 3: Verify the admin
_, check, _ = run_cmd(c,
    'mongosh --quiet masjid-al-rahma --eval '
    '"db.users.findOne({email:\\\"admin@masjidalrahma.com\\\"}, '
    '{email:1,role:1,isActive:1,isVerified:1})" 2>&1')
print(f"Admin user: {check}")

# Step 4: Test login
print("\nTesting admin login...")
_, login, _ = run_cmd(c,
    'curl -s -X POST http://localhost:5000/api/v1/auth/login '
    '-H "Content-Type: application/json" '
    '-d \'{"email":"admin@masjidalrahma.com","password":"Admin@2025Secure!"}\' 2>&1')
print(f"Login: {login[:300]}")

if 'accessToken' in login and '"role":"admin"' in login:
    print("\n✅ Admin login successful!")
elif 'accessToken' in login:
    print("\n✅ Login works but role might be wrong — checking...")
    # Extract role from token or response
    print(f"   Full response: {login}")

print(f"\nCredentials:")
print(f"  Email: admin@masjidalrahma.com")
print(f"  Password: Admin@2025Secure!")
print(f"  Login at: http://{VPS_HOST}/")

c.close()