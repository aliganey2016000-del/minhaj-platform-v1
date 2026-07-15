# Backend Implementation Guide - Video-Gated Lessons

## Overview

This document outlines the backend API endpoints and database schemas needed to support the Video-Gated Lesson system. The frontend components have been fully implemented and are ready for integration.

## Database Models

### 1. Video Gating Settings Model

**File**: `backend/src/models/video-gating-settings.model.ts`

```typescript
import mongoose from 'mongoose';

const VideoGatingSettingsSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      unique: true,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    blockForwardSeeking: {
      type: Boolean,
      default: true,
    },
    checkpoints: {
      type: [Number], // e.g., [33, 66, 95]
      default: [33, 66, 95],
      validate: {
        validator: function(v: number[]) {
          return v.every(n => n > 0 && n <= 100);
        },
        message: 'All checkpoints must be between 0 and 100',
      },
    },
    minWatchPercentToUnlock: {
      type: Number,
      default: 95,
      min: 50,
      max: 100,
    },
    showCheckpointAlerts: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

export default mongoose.model('VideoGatingSettings', VideoGatingSettingsSchema);
```

### 2. Lesson Progress Model

**File**: `backend/src/models/lesson-progress.model.ts`

```typescript
import mongoose from 'mongoose';

const LessonProgressSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
    },
    percentWatched: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    lastWatchedTime: {
      type: Number,
      default: 0, // in seconds
    },
    reachedCheckpoints: {
      type: [Number],
      default: [],
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for faster queries
LessonProgressSchema.index({ studentId: 1, courseId: 1, lessonId: 1 }, { unique: true });

export default mongoose.model('LessonProgress', LessonProgressSchema);
```

## API Controllers

### 1. Video Gating Controller

**File**: `backend/src/controllers/video-gating.controller.ts`

```typescript
import { Request, Response } from 'express';
import VideoGatingSettings from '../models/video-gating-settings.model';
import LessonProgress from '../models/lesson-progress.model';
import { asyncHandler } from '../middleware/async-handler.middleware';

// Get video gating settings for a course
export const getVideoGatingSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const { courseId } = req.params;

    const settings = await VideoGatingSettings.findOne({ courseId });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Video gating settings not found for this course',
        data: {
          enabled: false,
          blockForwardSeeking: true,
          checkpoints: [33, 66, 95],
          minWatchPercentToUnlock: 95,
        },
      });
    }

    res.json({ success: true, data: settings });
  }
);

// Create or update video gating settings
export const saveVideoGatingSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const { courseId } = req.params;
    const { enabled, blockForwardSeeking, checkpoints, minWatchPercentToUnlock, showCheckpointAlerts, description } =
      req.body;

    // Validate input
    if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Checkpoints must be a non-empty array of numbers',
      });
    }

    if (minWatchPercentToUnlock < 50 || minWatchPercentToUnlock > 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum watch percentage must be between 50 and 100',
      });
    }

    let settings = await VideoGatingSettings.findOne({ courseId });

    if (!settings) {
      settings = new VideoGatingSettings({
        courseId,
        enabled,
        blockForwardSeeking,
        checkpoints,
        minWatchPercentToUnlock,
        showCheckpointAlerts,
        description,
      });
    } else {
      settings.enabled = enabled;
      settings.blockForwardSeeking = blockForwardSeeking;
      settings.checkpoints = checkpoints;
      settings.minWatchPercentToUnlock = minWatchPercentToUnlock;
      settings.showCheckpointAlerts = showCheckpointAlerts;
      settings.description = description;
    }

    await settings.save();

    res.json({
      success: true,
      message: 'Video gating settings saved',
      data: settings,
    });
  }
);

// Track lesson progress
export const trackLessonProgress = asyncHandler(
  async (req: Request, res: Response) => {
    const { lessonId } = req.params;
    const { courseId } = req.body;
    const { percentWatched, lastWatchedTime } = req.body;
    const studentId = req.user._id; // Assuming authentication middleware sets req.user

    // Validate input
    if (typeof percentWatched !== 'number' || percentWatched < 0 || percentWatched > 100) {
      return res.status(400).json({
        success: false,
        message: 'percentWatched must be a number between 0 and 100',
      });
    }

    // Get or create progress record
    let progress = await LessonProgress.findOne({
      studentId,
      courseId,
      lessonId,
    });

    if (!progress) {
      progress = new LessonProgress({
        studentId,
        courseId,
        lessonId,
        percentWatched,
        lastWatchedTime: lastWatchedTime || 0,
      });
    } else {
      progress.percentWatched = Math.max(progress.percentWatched, percentWatched);
      progress.lastWatchedTime = lastWatchedTime || progress.lastWatchedTime;

      // Check if lesson is now completed
      const settings = await VideoGatingSettings.findOne({ courseId });
      const minWatch = settings?.minWatchPercentToUnlock || 95;

      if (progress.percentWatched >= minWatch && !progress.isCompleted) {
        progress.isCompleted = true;
        progress.completedAt = new Date();
      }

      // Track reached checkpoints
      if (settings?.checkpoints) {
        settings.checkpoints.forEach((checkpoint) => {
          if (
            progress.percentWatched >= checkpoint &&
            !progress.reachedCheckpoints.includes(checkpoint)
          ) {
            progress.reachedCheckpoints.push(checkpoint);
          }
        });
      }
    }

    await progress.save();

    res.json({
      success: true,
      message: 'Progress tracked',
      data: progress,
    });
  }
);

// Get student progress for a lesson
export const getLessonProgress = asyncHandler(
  async (req: Request, res: Response) => {
    const { courseId, lessonId } = req.params;
    const studentId = req.user._id;

    const progress = await LessonProgress.findOne({
      studentId,
      courseId,
      lessonId,
    });

    if (!progress) {
      return res.json({
        success: true,
        data: {
          percentWatched: 0,
          lastWatchedTime: 0,
          reachedCheckpoints: [],
          isCompleted: false,
        },
      });
    }

    res.json({ success: true, data: progress });
  }
);

// Get course progress for student
export const getCourseProgress = asyncHandler(
  async (req: Request, res: Response) => {
    const { courseId } = req.params;
    const studentId = req.user._id;

    const progressRecords = await LessonProgress.find({
      studentId,
      courseId,
    });

    const totalLessons = progressRecords.length;
    const completedLessons = progressRecords.filter((p) => p.isCompleted).length;
    const averageProgress =
      totalLessons > 0
        ? progressRecords.reduce((sum, p) => sum + p.percentWatched, 0) / totalLessons
        : 0;

    res.json({
      success: true,
      data: {
        totalLessons,
        completedLessons,
        averageProgress: Math.round(averageProgress),
        lessons: progressRecords,
      },
    });
  }
);

// Delete video gating settings
export const deleteVideoGatingSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const { courseId } = req.params;

    await VideoGatingSettings.findOneAndDelete({ courseId });

    res.json({
      success: true,
      message: 'Video gating settings deleted',
    });
  }
);
```

## API Routes

**File**: `backend/src/routes/video-gating.routes.ts`

```typescript
import { Router } from 'express';
import {
  getVideoGatingSettings,
  saveVideoGatingSettings,
  trackLessonProgress,
  getLessonProgress,
  getCourseProgress,
  deleteVideoGatingSettings,
} from '../controllers/video-gating.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

// Public/Admin routes
router.get('/courses/:courseId/video-gating', getVideoGatingSettings);
router.post('/courses/:courseId/video-gating', authenticate, authorize(['admin', 'teacher']), saveVideoGatingSettings);
router.delete('/courses/:courseId/video-gating', authenticate, authorize(['admin', 'teacher']), deleteVideoGatingSettings);

// Student progress routes
router.post(
  '/lessons/:lessonId/progress',
  authenticate,
  authorize(['student']),
  trackLessonProgress
);
router.get(
  '/courses/:courseId/lessons/:lessonId/progress',
  authenticate,
  authorize(['student']),
  getLessonProgress
);
router.get(
  '/courses/:courseId/progress',
  authenticate,
  authorize(['student']),
  getCourseProgress
);

export default router;
```

## Integration Steps

### 1. Register Routes in Main App

**File**: `backend/src/app.ts`

```typescript
import videoGatingRoutes from './routes/video-gating.routes';

// ... existing routes ...

app.use('/api', videoGatingRoutes);
```

### 2. Register Models

**File**: `backend/src/models/index.ts`

```typescript
import VideoGatingSettings from './video-gating-settings.model';
import LessonProgress from './lesson-progress.model';

export { VideoGatingSettings, LessonProgress };
```

### 3. Add to Exports

**File**: `backend/src/index.ts`

```typescript
export * from './models';
export * from './controllers/video-gating.controller';
```

## Error Handling

The backend should return appropriate HTTP status codes:

- `200 OK`: Successful request
- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: User not authenticated
- `403 Forbidden`: User doesn't have permission
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Example error response:

```json
{
  "success": false,
  "message": "Invalid checkpoint percentages",
  "errors": ["Checkpoint 105 is out of range (0-100)"]
}
```

## Testing

### Test Cases for Backend

1. **Create Video Gating Settings**
   - Valid settings should save
   - Invalid checkpoints should fail
   - Invalid minWatch should fail

2. **Track Progress**
   - Progress should update correctly
   - Checkpoints should be tracked
   - Completion should be marked at minWatch percentage

3. **Get Progress**
   - Student should only see their own progress
   - Non-existent progress should return defaults

4. **Course Progress**
   - Should aggregate all lesson progress
   - Average should be calculated correctly

## Performance Optimizations

1. **Indexing**: LessonProgress has compound index on studentId, courseId, lessonId
2. **Caching**: Consider caching video gating settings per course
3. **Batch Updates**: For bulk progress tracking
4. **Pagination**: For large datasets of lesson progress

## Security Considerations

1. **Authentication**: All progress endpoints require authentication
2. **Authorization**: Students can only view/update their own progress
3. **Rate Limiting**: Limit progress tracking to prevent abuse
4. **Input Validation**: All inputs are validated
5. **Data Integrity**: Unique constraint on LessonProgress

## Monitoring and Analytics

Consider adding:
- Log all progress updates
- Track checkpoint reach rates
- Monitor video completion rates
- Alert on unusual patterns (e.g., instant 100% completion)

## Sample API Calls

### Save Video Gating Settings

```bash
curl -X POST http://localhost:3000/api/courses/courseId/video-gating \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "blockForwardSeeking": true,
    "checkpoints": [33, 66, 95],
    "minWatchPercentToUnlock": 95,
    "showCheckpointAlerts": true,
    "description": "This is a gated lesson"
  }'
```

### Track Progress

```bash
curl -X POST http://localhost:3000/api/lessons/lessonId/progress \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "courseId": "courseId",
    "percentWatched": 35,
    "lastWatchedTime": 120
  }'
```

### Get Progress

```bash
curl http://localhost:3000/api/courses/courseId/lessons/lessonId/progress \
  -H "Authorization: Bearer token"
```

## Next Steps

1. Create models in MongoDB
2. Implement controllers
3. Create routes
4. Add authentication/authorization checks
5. Test endpoints thoroughly
6. Deploy to production

---

**For Frontend Integration**: See [VIDEO_GATING_DOCUMENTATION.md](./VIDEO_GATING_DOCUMENTATION.md)
