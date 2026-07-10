"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
// Register all models before routes are loaded
require("./models/announcement.model");
require("./models/news.model");
require("./models/event.model");
require("./models/gallery.model");
require("./models/payment.model");
require("./models/certificate.model");
require("./models/exam.model");
require("./models/result.model");
require("./models/parent.model");
require("./models/setting.model");
require("./models/activity-log.model");
require("./models/assignment.model");
require("./models/school.model");
require("./models/resource.model");
require("./models/notification.model");
require("./models/course-content.model");
const app_1 = __importDefault(require("./app"));
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rayan2016003_db_user:635110Liiali@rahma.bo0elay.mongodb.net/masjid-al-rahma?appName=rahma&retryWrites=true&w=majority';
// ---------------------------------------------------------------------------
// Database Connection & Server Start
// ---------------------------------------------------------------------------
async function startServer() {
    try {
        // Connect to MongoDB
        await mongoose_1.default.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        // Start Express server
        app_1.default.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📡 API available at http://localhost:${PORT}/api/v1`);
            console.log(`💚 Health check: http://localhost:${PORT}/api/v1/health`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=server.js.map