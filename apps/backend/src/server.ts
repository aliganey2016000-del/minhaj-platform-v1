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

// All remaining imports must use dynamic import() so they only execute AFTER
// dotenv has populated process.env. Static `import` is hoisted above regular
// code by the runtime, which would cause validateSecurityEnv() in app.ts to
// see empty MONGODB_URI/NODE_ENV and crash.
//
// Register all models before routes are loaded

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rayan2016003_db_user:635110Liiali@rahma.bo0elay.mongodb.net/masjid-al-rahma?appName=rahma&retryWrites=true&w=majority';

// ---------------------------------------------------------------------------
// Database Connection & Server Start
// ---------------------------------------------------------------------------

async function startServer() {
  try {
    // Dynamic imports — env is already loaded at this point
    const mongoose = (await import('mongoose')).default;
    const http = await import('http');

    // Register models
    await import('./models/announcement.model');
    await import('./models/news.model');
    await import('./models/event.model');
    await import('./models/gallery.model');
    await import('./models/payment.model');
    await import('./models/certificate.model');
    await import('./models/exam.model');
    await import('./models/result.model');
    await import('./models/parent.model');
    await import('./models/setting.model');
    await import('./models/activity-log.model');
    await import('./models/assignment.model');
    await import('./models/school.model');
    await import('./models/resource.model');
    await import('./models/notification.model');
    await import('./models/course-content.model');
    await import('./models/course.model');
    await import('./models/class.model');
    await import('./models/attendance.model');
    await import('./models/teacher.model');
    await import('./models/student.model');
    await import('./models/user.model');
    await import('./models/profile.model');
    await import('./models/forum.model');
    await import('./models/exam-room.model');
    await import('./models/exam-attendance.model');
    await import('./models/exam-incident.model');
    await import('./models/exam-appeal.model');
    await import('./models/exam-paper.model');
    await import('./models/exam-attempt.model');
    await import('./models/sidebar-setting.model');
    await import('./models/seat-allocation.model');
    await import('./models/progress.model');
    await import('./models/class-schedule.model');
    await import('./models/push-subscription.model');
    await import('./models/quiz-attempt.model');

    const appModule = await import('./app');
    const app = appModule.default;

    const { initSocket } = await import('./realtime/socket');

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Start Express server (wrapped in a raw http.Server so Socket.IO can
    // share the same port instead of needing a separate one)
    const httpServer = http.createServer(app);
    initSocket(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 API available at http://localhost:${PORT}/api/v1`);
      console.log(`💚 Health check: http://localhost:${PORT}/api/v1/health`);
      console.log(`🔌 Realtime (Socket.IO) ready`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
