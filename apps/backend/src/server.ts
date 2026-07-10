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