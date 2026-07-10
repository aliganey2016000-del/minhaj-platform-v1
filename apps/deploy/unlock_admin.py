import sys,os; sys.path.insert(0, os.path.dirname(__file__))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

# Unlock admin@masjidalrahma.com
run_cmd(c, 'mongosh masjid-al-rahma --quiet --eval \'db.users.updateOne({email:"admin@masjidalrahma.com"},{$set:{role:"admin",isVerified:true,isActive:true,lockedUntil:null,failedLoginAttempts:0}})\' 2>&1')

# Set admin2 role
run_cmd(c, 'mongosh masjid-al-rahma --quiet --eval \'db.users.updateOne({email:"admin2@masjidalrahma.com"},{$set:{role:"admin",isVerified:true}})\' 2>&1')

# Verify
for email in ["admin@masjidalrahma.com", "admin2@masjidalrahma.com"]:
    _, doc, _ = run_cmd(c, f'mongosh masjid-al-rahma --quiet --eval \'JSON.stringify(db.users.findOne({{email:"{email}"}},{{email:1,role:1,isActive:1,isVerified:1,lockedUntil:1,failedLoginAttempts:1}}))\' 2>&1')
    print(f'{email}: {doc}')

# Test login
_, login, _ = run_cmd(c, 'curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" -d \'{"email":"admin@masjidalrahma.com","password":"Admin@2025Secure!"}\' 2>&1')
print(f'Login admin@: {login[:300]}')

_, login2, _ = run_cmd(c, 'curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" -d \'{"email":"admin2@masjidalrahma.com","password":"Admin@2025Secure!"}\' 2>&1')
print(f'Login admin2: {login2[:300]}')

print(f'\nhttp://{VPS_HOST}/')
c.close()