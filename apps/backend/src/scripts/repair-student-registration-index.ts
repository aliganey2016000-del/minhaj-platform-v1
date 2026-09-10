import dotenv from 'dotenv';

dotenv.config();

import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is not set');

async function main() {
  await mongoose.connect(uri);
  const collection = mongoose.connection.collection('studentregistrations');
  const indexes = await collection.indexes();
  const oldIndex = indexes.find((index) => index.name === 'school_1_registrationNumber_1');
  const newIndexName = 'school_registrationNumber_unique';

  // The old sparse index incorrectly indexed explicit null values. Before
  // replacing it, verify that real registration-number strings are already
  // unique so the new partial unique index cannot fail halfway through.
  const duplicates = await collection.aggregate([
    { $match: { registrationNumber: { $type: 'string' } } },
    { $group: { _id: { school: '$school', registrationNumber: '$registrationNumber' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  if (duplicates.length > 0) {
    throw new Error(`Refusing index repair: ${duplicates.length} duplicate registration-number group(s) already exist.`);
  }

  if (oldIndex) await collection.dropIndex(oldIndex.name);

  const existingNew = indexes.find((index) => index.name === newIndexName);
  if (!existingNew) {
    await collection.createIndex(
      { school: 1, registrationNumber: 1 },
      {
        unique: true,
        name: newIndexName,
        partialFilterExpression: { registrationNumber: { $type: 'string' } },
      },
    );
  }

  console.log('StudentRegistration index repaired: null/absent registration numbers are no longer blocked per school.');
}

main()
  .catch((error) => {
    console.error('StudentRegistration index repair failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
