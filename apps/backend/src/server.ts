import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables before anything else touches process.env.
//
// backend/.env.production holds real VPS values (a Docker-internal Mongo
// URI, the VPS's public IP as CLIENT_URL, etc.) — loading it on a local
// dev machine breaks the DB connection and CORS. So: prefer a local-only
// backend/.env (gitignored, create it yourself with just the values you
// need to override locally, e.g. DEEPSEEK_API_KEY) and only fall back to
// .env.production if no local .env exists — e.g. when actually running
// on the VPS.
const localEnvPath = path.resolve(__dirname, '../.env');
const prodEnvPath = path.resolve(__dirname, '../.env.production');
dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : prodEnvPath });

import mongoose from 'mongoose';

// Register all models before routes are loaded
import './models/announcement.model';
import './models/news.model';
import './models/event.model';
import './models/gallery.model';
import './models/payment.model';
import './models/certificate.model';
import './models/exam.model';
import './models/result.model';
import './models/parent.model';
import './models/setting.model';
import './models/activity-log.model';
import './models/assignment.model';
import './models/school.model';
import './models/resource.model';
import './models/notification.model';
import './models/course-content.model';

import app from './app';

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rayan2016003_db_user:635110Liiali@rahma.bo0elay.mongodb.net/masjid-al-rahma?appName=rahma&retryWrites=true&w=majority';

// ---------------------------------------------------------------------------
// Database Connection & Server Start
// ---------------------------------------------------------------------------

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 API available at http://localhost:${PORT}/api/v1`);
      console.log(`💚 Health check: http://localhost:${PORT}/api/v1/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();