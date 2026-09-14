# Class Schedule & Timetable A-Z QA

This branch adds permanent automated regression coverage for school timetable period settings, schedule CRUD, class/teacher/room conflicts, teacher/student portal visibility, tenant isolation, and schedule-linked lesson attendance.

Authenticated mobile/desktop/print visual checks remain a browser QA step; backend/API invariants are enforced in CI by `npm run test:schedule-qa`.
