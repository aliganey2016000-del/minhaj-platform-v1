import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, '../src/controllers/teacher.controller.ts');
let text = fs.readFileSync(file, 'utf8');

const oldUpdate = "  const { firstName, lastName, gender, school, qualification, specialization, experience, bio, status, joiningDate } = req.body;";
const newUpdate = `  const { firstName, lastName, gender, school, qualification, specialization, experience, bio, status, joiningDate, email, phone, password } = req.body;

  const user = await User.findById(teacher.user).select('+password');
  if (!user) throw new NotFoundError('Teacher user');

  if (email !== undefined) {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail) throw new BadRequestError('Email cannot be empty');
    const emailOwner = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } }).select('_id');
    if (emailOwner) throw new ConflictError('A user with this email already exists');
    user.email = normalizedEmail;
  }

  if (phone !== undefined) {
    const normalizedPhone = String(phone).trim();
    if (normalizedPhone) {
      const phoneOwner = await User.findOne({ phone: normalizedPhone, _id: { $ne: user._id } }).select('_id');
      if (phoneOwner) throw new ConflictError('A user with this phone number already exists');
      user.phone = normalizedPhone;
    } else {
      user.phone = undefined;
    }
  }

  if (password !== undefined && String(password).length > 0) {
    if (String(password).length < 8) throw new BadRequestError('Password must be at least 8 characters');
    user.password = String(password);
    user.tokenVersion += 1;
  }

  if (email !== undefined || phone !== undefined || (password !== undefined && String(password).length > 0)) {
    await user.save();
  }`;
if (!text.includes(oldUpdate)) throw new Error('Teacher update anchor not found');
text = text.replace(oldUpdate, newUpdate);
text = text.replaceAll(".populate('user', 'email isVerified isActive')", ".populate('user', 'email phone isVerified isActive')");
text = text.replaceAll(".populate('user', 'email isVerified isActive preferredLanguage')", ".populate('user', 'email phone isVerified isActive preferredLanguage')");

fs.writeFileSync(file, text);
console.log('Teacher backend account fields patch applied.');
