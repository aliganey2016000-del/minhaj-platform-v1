# Student Activity v2

## Source of truth

`LearningActivity` is an event/audit stream. It is not a reliable aggregate for time because event durations can overlap.

`LearningSession` is the source of truth for learning time.

## Time definitions

- **Active Study Time** — server-measured time between valid heartbeats while the learning page is visible and not blocked by a paused media player.
- **Idle Time** — time gaps beyond the 90-second heartbeat threshold, or explicit inactive heartbeats.
- **Video/Audio Watch Time** — playback time reported during active media playback, capped by the server heartbeat window.
- **Session Time** — wall-clock span from session start to end/expiry. This is contextual and must not be added to Active Study Time.
- **Event Duration** — legacy per-event duration. It remains available for historical/audit records but must not be summed for study-time analytics.

## Lifecycle

1. Student opens `/student/courses/:courseId/learn`.
2. Frontend starts a session with a random `clientSessionId`.
3. Server resolves the authenticated Student and verifies course enrollment.
4. Frontend sends a heartbeat every 20 seconds.
5. Server counts at most 60 seconds per heartbeat and treats gaps over 90 seconds as idle.
6. Route change or unmount ends the session; a later session start expires older active sessions for the same user.
7. Analytics aggregate `LearningSession.activeSeconds`, `idleSeconds`, and `watchSeconds`.

## UI terminology

Student Activity should use explicit labels:

- `Active study`
- `Video watched`
- `Idle`
- `Sessions`
- `Attempt time` for quizzes/exams

Never label a generic event span simply `Duration` when its semantic meaning is unclear.

## Backward compatibility

The existing `/activity/analytics/:studentId` endpoint is bridged so that, once session data exists, its study-time metrics come from `LearningSession`. Students with no sessions continue to receive legacy activity-duration analytics until they generate session data.

## Next UI migration

The Student Activity timeline should consume `/activity/session-analytics/:studentId` alongside the existing event timeline and display session rows separately from event rows. This avoids deriving a lesson's duration from unrelated events and makes overlapping activity visually explicit.
