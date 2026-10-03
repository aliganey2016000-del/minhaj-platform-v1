/**
 * Starts the database a regression script runs against.
 *
 * CI uses an ephemeral mongodb-memory-server, as every other e2e script
 * does. TEST_MONGODB_URI points the script at an already-running server
 * instead (for environments where the MongoDB binary cannot be downloaded);
 * each run then gets its own throwaway database name.
 */

import mongoose from 'mongoose';

export async function startTestDb(name: string): Promise<{ uri: string; stop: () => Promise<void> }> {
  const external = process.env.TEST_MONGODB_URI;
  if (external) {
    const base = external.replace(/\/+$/, '');
    const uri = `${base}/${name}-${Date.now()}`;
    process.env.MONGODB_URI = uri;
    await mongoose.connect(uri);
    return {
      uri,
      stop: async () => {
        await mongoose.connection.dropDatabase().catch(() => {});
        await mongoose.disconnect();
      },
    };
  }

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
  return {
    uri,
    stop: async () => {
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}
