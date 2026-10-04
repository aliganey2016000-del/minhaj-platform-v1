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

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set. Add it to backend/.env (local) or backend/.env.production.');
  process.exit(1);
}
const MONGODB_URI: string = process.env.MONGODB_URI;

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
    await import('./models/whatsapp-message.model');
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

    // Wrap attendance bulk writes after all required models are registered.
    // The wrapper sends WhatsApp/Telegram alerts asynchronously so an
    // external outage on either channel never prevents attendance from
    // being saved.
    await import('./services/attendance-notification-automation');
    const { sendInstallmentReminders } = await import('./services/installment-reminder.service');
    const { repairStudentRegistrationIndex } = await import('./scripts/repair-student-registration-index');
    const { backfillContentSchools } = await import('./utils/content-school-backfill');

    const appModule = await import('./app');
    const app = appModule.default;

    const { initSocket } = await import('./realtime/socket');
    const { expireStaleSessions } = await import('./controllers/learning-session.controller');
    const { AuditLogger } = await import('./utils/audit-logger');

    // Connect to MongoDB. Explicit pool/timeout options so a slow or
    // unreachable Mongo fails fast instead of hanging requests forever, and
    // so the connection pool size is tunable per deployment without a code
    // change. autoIndex is left at its (true) default on purpose: recent
    // migrations (incl. TTL indexes added below) rely on Mongoose building
    // them at boot, and there is no separate index-build step in this
    // deployment — disabling it would silently stop those indexes existing.
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: Number(process.env.MONGO_POOL_SIZE) || 20,
    });
    console.log('✅ Connected to MongoDB');

    // Start Express server (wrapped in a raw http.Server so Socket.IO can
    // share the same port instead of needing a separate one)
    const httpServer = http.createServer(app);
    const io = initSocket(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 API available at http://localhost:${PORT}/api/v1`);
      console.log(`💚 Health check: http://localhost:${PORT}/api/v1/health`);
      console.log(`🔌 Realtime (Socket.IO) ready`);
    });

    // Run the legacy registration-number index repair and the content
    // school backfill AFTER the server is already accepting traffic, and as
    // fire-and-forget: both are idempotent maintenance tasks, not
    // preconditions for serving requests, and previously ran before
    // listen() — so a thrown error (e.g. duplicate registration numbers on
    // an existing production DB) crashed the whole boot and put the
    // container in a restart loop. Non-strict mode here means a duplicate
    // group is logged and skipped instead of thrown.
    void repairStudentRegistrationIndex().catch((error) =>
      console.error('repairStudentRegistrationIndex failed:', error),
    );
    void backfillContentSchools()
      .then((result) => console.log('Content school backfill:', JSON.stringify(result)))
      .catch((error) => console.error('backfillContentSchools failed:', error));

    // Background schedulers. Each process in a multi-instance deployment
    // would otherwise run these redundantly with no leader election; until
    // that's added, RUN_SCHEDULERS=false lets every instance but one be
    // told to stay out of it.
    const runSchedulers = process.env.RUN_SCHEDULERS !== 'false';
    const intervals: ReturnType<typeof setInterval>[] = [];
    if (runSchedulers) {
      // Closes out learning sessions abandoned without an explicit
      // /activity/session/end call (closed tab, killed app, lost connection)
      // — otherwise they stay 'active' forever and admin views showing their
      // duration keep growing indefinitely. See expireStaleSessions' own
      // comment for why endedAt isn't just "now".
      intervals.push(
        setInterval(() => {
          void expireStaleSessions().catch((error) => console.error('expireStaleSessions failed:', error));
        }, 60_000),
      );

      intervals.push(
        setInterval(() => {
          void sendInstallmentReminders().catch((error) => console.error('sendInstallmentReminders failed:', error));
        }, 24 * 60 * 60 * 1000),
      );
      void sendInstallmentReminders().catch((error) => console.error('initial installment reminders failed:', error));

      // AuditLog also carries a 24-month TTL index as the primary cleanup
      // mechanism; this daily run is a backstop (and the only caller of
      // cleanupOldLogs, which previously existed but was never invoked).
      intervals.push(
        setInterval(() => {
          void AuditLogger.cleanupOldLogs(730).catch((error) => console.error('cleanupOldLogs failed:', error));
        }, 24 * 60 * 60 * 1000),
      );
    } else {
      console.log('⏸️  RUN_SCHEDULERS=false — background schedulers disabled on this instance');
    }

    // Graceful shutdown: stop accepting new work and close connections
    // cleanly on SIGTERM/SIGINT (container stop/restart), instead of the
    // process being killed mid-request. A hard-exit timer guarantees the
    // process still goes down even if something hangs while closing.
    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${signal} received: starting graceful shutdown`);

      const forceExit = setTimeout(() => {
        console.error('Graceful shutdown timed out after 25s; forcing exit.');
        process.exit(1);
      }, 25_000);
      forceExit.unref();

      for (const interval of intervals) clearInterval(interval);

      io.close(() => {
        httpServer.close(() => {
          mongoose.connection
            .close(false)
            .catch((error) => console.error('Error closing MongoDB connection:', error))
            .finally(() => {
              clearTimeout(forceExit);
              console.log('Graceful shutdown complete.');
              process.exit(0);
            });
        });
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Last-resort safety net: a rejected promise that no handler caught (e.g. an
// async route someone forgot to wrap in asyncHandler) would otherwise kill
// the whole process on Node 15+, taking every school offline. Log it and
// keep serving. Synchronous uncaught exceptions still exit, since process
// state after one is undefined — the container restarts it.
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

startServer();
