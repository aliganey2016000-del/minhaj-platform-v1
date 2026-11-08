router.patch('/room-plan-settings', adminOnly, asyncHandler(roomPlanSettingsController.updateSettings));

// Named exam containers (Midterm, Final, etc.) are created first; their
// grade/shift grid is then edited through /schedule-grid.
router.get('/periods', adminOrTeacher, asyncHandler(examController.getExamPeriods));
router.post('/periods', adminOnly, asyncHandler(examController.createExamPeriod));
router.patch('/periods/:periodId', adminOnly, asyncHandler(examController.updateExamPeriod));
router.delete('/periods/:periodId', adminOnly, asyncHandler(examController.deleteExamPeriod));
router.post('/periods/:periodId/duplicate', adminOnly, asyncHandler(examController.duplicateExamPeriod));
router.post('/periods/:periodId/auto-generate', adminOnly, asyncHandler(examController.autoGeneratePeriodSchedule));
router.post('/periods/:periodId/move-schedule-group', adminOnly, asyncHandler(examController.moveScheduleGroup));
router.post('/periods/:periodId/assign-schedule-cell', adminOnly, asyncHandler(examController.assignScheduleCell));
router.post('/periods/:periodId/edit-department-schedule', adminOnly, asyncHandler(examController.editDepartmentSchedule));
router.post('/periods/:periodId/reset-department-schedule', adminOnly, asyncHandler(examController.resetDepartmentSchedule));
router.post('/schedule-grid', adminOnly, asyncHandler(examController.saveScheduleGrid));

// Master seating: one room + seat for every student across all subjects in an exam period.
router.get('/seating-plan', adminOrTeacher, asyncHandler(masterSeatController.list));
router.get('/seating-plan/stats', adminOrTeacher, asyncHandler(masterSeatController.stats));
router.get('/seating-plan/rooms', adminOrTeacher, asyncHandler(masterSeatController.rooms));
router.post('/seating-plan', adminOrTeacher, asyncHandler(masterSeatController.add));
router.patch('/seating-plan/:id', adminOrTeacher, asyncHandler(masterSeatController.update));
router.delete('/seating-plan/:id', adminOrTeacher, asyncHandler(masterSeatController.remove));
router.delete('/seating-plan', adminOrTeacher, asyncHandler(masterSeatController.bulkRemove));
router.patch('/seating-plan/lock', adminOrTeacher, asyncHandler(masterSeatController.bulkLock));
router.post('/seating-plan/import-preview', adminOrTeacher, upload.single('file'), asyncHandler(masterSeatController.previewImport));
router.post('/seating-plan/import', adminOrTeacher, upload.single('file'), asyncHandler(masterSeatController.importExcel));