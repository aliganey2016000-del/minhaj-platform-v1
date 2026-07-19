/**
 * Student AI Tutor — Full-page chat workspace for course/lesson context.
 *
 * Route: /student/courses/:courseId/ai-tutor
 *
 * Layout:
 *   Left sidebar (collapsible): Course summary, progress, chapter quick-toggle
 *   Main center panel: Chat bubbles, quick-prompt pills, sticky input
 *
 * Context: courseId (required) + lessonId (optional via query) are injected
 * into the system prompt so the AI Tutor is aware of the exact course material.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import { Mic, Square, Phone, X } from 'lucide-react';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Entity highlighting — wraps key Somali historical terms, locations, names
// and dates in semantic styled spans.
// ---------------------------------------------------------------------------

const ENTITY_PATTERNS: { pattern: RegExp; className: string }[] = [
  // Dates & historical years (e.g. "1864", "1920", "December 21, 1920")
  {
    pattern: /\b(?:\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{4})\b/gm,
    className: 'font-bold text-blue-600 dark:text-blue-400',
  },
  // Geographical locations & cities
  {
    pattern: /\b(?:Dulbahante|Harar|Mogadishu|Kismayo|Sudan|Mecca|Makkah|Madinah|Medina|Jiddah|Riyadh|Cairo|Aden|Zeila|Berbera|Hargeisa|Bosaso|Garowe|Galkacyo|Baidoa|Beledweyne|Jowhar|Marka|Baraawe|Luuq|Bardera|Afgooye|Buuhoodle|Taleh|Eyl|Qardho|Dhahar|Cee||Nugaal|Sanaag|Sool|Bari|Mudug|Galguduud|Hiiraan|Shabelle|Jubba|Togdheer|Woqooyi|Awdal|Somaliland|Puntland|Jubaland|Ogaden|Nairobi|Addis Ababa|Djibouti|Dire Dawa|Ethiopia|Kenya|Yemen|Oman|Iraq|Syria|Damascus|Baghdad|Jerusalem|Ottoman|British|Italian|French|Abyssinia)\b/gm,
    className: 'font-bold text-blue-600 dark:text-blue-400',
  },
  // Historical names & titles
  {
    pattern: /\b(?:Sayid Maxamed Cabdulle Hassan|Sayid Muhammad Abdullah Hassan|Mad Mullah|Salihiyya|Dervish|Daraawiish|Ismaaciil Mire|Cali Garaad|Maxamuud Cali Shire|Cali Yuusuf|Xaaji Suudi|Sultan Nuur|Caraale|Xaaji Warabe|Sheikh Bashir|Sheekh Uweys|Sheikh Cali Maye|Ahmed Gurey|Axmed Guray|Imam Ahmed|Garaad|Boqor|Suldaan|Ugaas|Malaaq|Islaan|Reer|Darawiish)\b/gm,
    className: 'font-bold text-blue-600 dark:text-blue-400',
  },
  // Key historical events / battles
  {
    pattern: /\b(?:Battle of Cagaarweyne|Jidbali|Afbakayle|Qoob Fardood|Beledweyne|Ruuga|Daratole|Ferdiddin|Beer-Dhagax|Eyl|Ilig|Ilig Daldala|Dul-Madoobe|Gumburka|Cagaarweyne|Erigo|Gurdumi|Samala)\b/gm,
    className: 'font-bold text-blue-600 dark:text-blue-400',
  },
];

/** Parse markdown first with marked, THEN inject entity highlight spans
 *  only into the resulting HTML text nodes — never inside tag attributes.
 *  This avoids the \b boundary collision with markdown formatting markers. */
function renderMarkdownWithHighlights(rawMarkdown: string): string {
  // Step 1 — Escape any user-supplied HTML that isn't part of markdown
  let safe = rawMarkdown
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');

  // Step 2 — Parse markdown first (**bold**, lists, headings, etc.)
  const html = (marked.parse(safe, { breaks: true }) as string) || '';

  // Step 3 — Highlight entities in the rendered HTML, but only in text
  // nodes (outside of HTML tags so we never break tag attributes).
  // We do this by splitting on tag boundaries and only replacing in text.
  let result = html;
  for (const { pattern, className } of ENTITY_PATTERNS) {
    // Match only text outside HTML tags — split/rejoin around <...>
    const parts: string[] = [];
    let last = 0;
    const tagRe = /<[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(result)) !== null) {
      // Text before this tag
      const text = result.slice(last, m.index);
      if (text) {
        parts.push(text.replace(pattern, (match: string) =>
          `<span class="${className}">${match}</span>`
        ));
      }
      parts.push(m[0]); // Tag itself, unmodified
      last = tagRe.lastIndex;
    }
    // Remaining text after last tag
    const tail = result.slice(last);
    if (tail) {
      parts.push(tail.replace(pattern, (match: string) =>
        `<span class="${className}">${match}</span>`
      ));
    }
    result = parts.join('');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Progress {
  _id: string;
  completedLessons: number;
  completedQuizzes: number;
  completedAssignments: number;
  totalItems: number;
  completedItems: number;
  status: 'in_progress' | 'completed';
  percent?: number;
  lastAccessed: string | null;
}

interface CourseBrief {
  _id: string;
  title: { en: string; so: string; ar: string };
  slug: string;
  description?: { en: string; so: string; ar: string };
  category: string;
  level: string;
  duration: number;
  teacher?: {
    _id: string;
    profile?: { firstName: string; lastName: string };
  };
  progress?: Progress;
  accessMode?: 'open' | 'restricted';
}

interface Chapter {
  _id: string;
  title: string;
  items: any[];
}

interface CourseContent {
  _id?: string;
  course: string;
  chapters: Chapter[];
  totalDuration: number;
  totalLessons: number;
  totalQuizzes: number;
  totalAssignments: number;
}

interface ChatMessage {
  id: string;
  role: 'student' | 'tutor';
  content: string;
  timestamp: number;
  audioUrl?: string; // local object URL for a recorded voice note, if any
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUICK_PROMPTS = [
  { emoji: '📝', label: 'Summarize the current chapter' },
  { emoji: '❓', label: 'Give me a practice question' },
  { emoji: '💡', label: 'Explain the core concepts' },
  { emoji: '📅', label: 'Create a study plan for this module' },
  { emoji: '🧠', label: 'Test my understanding with a quiz' },
  { emoji: '🌍', label: 'Provide real-world examples' },
];

const WELCOME_MESSAGE_EN = `Assalamu alaykum! I'm your AI Tutor for this course. I have access to the course material, chapters, and your progress. Ask me anything — I can summarize topics, explain concepts, generate practice questions, or help you review. How can I assist you today?`;
const WELCOME_MESSAGE_SO = `Assalamu calaykum! Waxaan ahay macallinkaaga AI ee koorsadan. Waxaan heli karaa qalabka koorsada, cutubyada, iyo horumarkaaga. Waxaad i weydiin kartaa wax kasta — waan soo koobi karaa mowduucyada, sharxi karaa fikradaha, soo saari karaa su'aalo tababar, ama kaa caawin karaa dib-u-eegista. Sideen ku caawin karaa maanta?`;
const WELCOME_MESSAGE_AR = `السلام عليكم! أنا معلمك الذكي في هذه الدورة. لدي إمكانية الوصول إلى مواد الدورة والفصول وتقدمك. اسألني أي شيء — يمكنني تلخيص المواضيع، شرح المفاهيم، إنشاء أسئلة تدريبية، أو مساعدتك في المراجعة. كيف يمكنني مساعدتك اليوم؟`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const categoryLabels: Record<string, string> = {
  quran: 'Quran', fiqh: 'Fiqh', aqeedah: 'Aqeedah', seerah: 'Seerah',
  arabic: 'Arabic', tajweed: 'Tajweed', hadith: 'Hadith', akhlaq: 'Akhlaq',
};

const levelLabels: Record<string, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};

const levelColors: Record<string, string> = {
  beginner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  advanced: 'bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StudentAiTutor() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
  const lessonId = searchParams.get('lessonId') || undefined;
  const navigate = useNavigate();
  const { i18n } = useTranslation('common');
  const lang = i18n.language as 'en' | 'so' | 'ar';

  // ── Data ──
  const [course, setCourse] = useState<CourseBrief | null>(null);
  const [content, setContent] = useState<CourseContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Chat state ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Voice input state ──
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sidebar ──
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Timer ref for simulated streaming ──
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch course + content ──
  const fetchData = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const [myRes, contentRes] = await Promise.all([
        api.get('/students/my/courses'),
        api.get(`/courses/${courseId}/content`),
      ]);
      const courses: CourseBrief[] = myRes.data.data || [];
      const found = courses.find((c) => c._id === courseId);
      if (!found) { setError('Course not found.'); setLoading(false); return; }
      setCourse(found);
      setContent(contentRes.data.data as CourseContent);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load course data.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Initialize welcome message when data loads ──
  useEffect(() => {
    if (course && messages.length === 0) {
      const welcomeText =
        lang === 'so' ? WELCOME_MESSAGE_SO
        : lang === 'ar' ? WELCOME_MESSAGE_AR
        : WELCOME_MESSAGE_EN;
      setMessages([{
        id: 'welcome',
        role: 'tutor',
        content: welcomeText,
        timestamp: Date.now(),
      }]);
    }
  }, [course, lang, messages.length]);

  // ── Auto-scroll to bottom ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Cleanup streaming timer ──
  useEffect(() => {
    return () => {
      if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
    };
  }, []);

  // ── Derived ──
  const getTitle = (c: CourseBrief) => {
    if (lang === 'so' && c.title?.so) return c.title.so;
    if (lang === 'ar' && c.title?.ar) return c.title.ar;
    return c.title?.en || 'Untitled';
  };

  const getDescription = (c: CourseBrief) => {
    if (lang === 'so' && (c as any).description?.so) return (c as any).description.so;
    if (lang === 'ar' && (c as any).description?.ar) return (c as any).description.ar;
    return (c as any).description?.en || '';
  };

  const completedCount = (course?.progress?.completedItems || 0) + (course?.progress?.completedLessons || 0) + (course?.progress?.completedQuizzes || 0) + (course?.progress?.completedAssignments || 0);
  const totalCount = course?.progress?.totalItems || content?.totalLessons || 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : (course?.progress?.percent || 0);

  // Current lesson context
  const activeLessonTitle = useMemo(() => {
    if (!lessonId || !content) return null;
    for (const ch of content.chapters) {
      for (const item of ch.items) {
        if ((item as any)._id === lessonId || (item as any).id === lessonId) {
          return {
            lessonTitle: (item as any).title || 'Lesson',
            chapterTitle: ch.title || 'Chapter',
          };
        }
      }
    }
    return null;
  }, [lessonId, content]);

  // Ref-based guard — prevents duplicate submissions when React Strict Mode
  // double-invokes updater callbacks during development.
  const isSendingRef = useRef(false);

  // ── Send real API request to backend AI Tutor endpoint ──
  const fetchTutorResponse = useCallback(async (userMessage: string, thinkingId: string) => {
    try {
      // Build conversation history from current state (last 20 real messages)
      const conversationForApi: { role: 'student' | 'tutor'; content: string }[] = [];
      // We read messages via a ref set during sendMessage to avoid stale closure
      // but for simplicity, we snapshot via a function-updater pattern.
      // Actually, we'll read from the messages state via the callback pattern.

      const { data } = await api.post('/ai/tutor/chat', {
        courseId,
        lessonId: lessonId || undefined,
        conversation: conversationForApi,
        message: userMessage,
      });

      const reply: string = data?.data?.reply || data?.reply || '';

      // Remove thinking placeholder and add real response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== thinkingId);
        return [...filtered, {
          id: 'msg-' + Date.now(),
          role: 'tutor' as const,
          content: reply || 'Sorry, I could not generate a response. Please try again.',
          timestamp: Date.now(),
        }];
      });
    } catch (err: any) {
      // Remove thinking placeholder and add error message
      const errorText = err.response?.data?.message || 'Sorry, something went wrong. Please try again.';
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== thinkingId);
        return [...filtered, {
          id: 'msg-' + Date.now(),
          role: 'tutor' as const,
          content: errorText,
          timestamp: Date.now(),
        }];
      });
    } finally {
      isSendingRef.current = false;
      setSending(false);
    }
  }, [courseId, lessonId]);

  // ── Send message ──
  const sendMessage = useCallback(async (text?: string) => {
    const messageContent = (text || draft).trim();
    if (!messageContent) return;
    if (isSendingRef.current || sending) return;

    // Lock immediately — prevents double-fire from React strict mode
    isSendingRef.current = true;
    setSending(true);
    setDraft('');

    const thinkingId = 'msg-think-' + Date.now();

    const studentMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      role: 'student',
      content: messageContent,
      timestamp: Date.now(),
    };

    const thinkingMsg: ChatMessage = {
      id: thinkingId,
      role: 'tutor',
      content: '...',
      timestamp: Date.now(),
    };

    // Add both messages in ONE setState call — no duplicates
    setMessages((prev) => [...prev, studentMsg, thinkingMsg]);

    // Fire API call outside of setState to avoid double invocation
    fetchTutorResponse(messageContent, thinkingId);
  }, [draft, sending, fetchTutorResponse]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    sendMessage(prompt);
  };

  // ── Voice: Record Voice Note ──
  const startRecording = async () => {
    setMicMenuOpen(false);
    setVoiceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => { void handleRecordingStopped(); };

      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      setVoiceError('Microphone access was denied or is unavailable.');
    }
  };

  const stopRecordingAndSend = () => {
    mediaRecorderRef.current?.stop();
  };

  const cancelRecording = () => {
    audioChunksRef.current = [];
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null; // skip the send-on-stop flow
      mediaRecorderRef.current.stop();
    }
    teardownRecording();
  };

  const teardownRecording = () => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setRecording(false);
    setRecordingSeconds(0);
  };

  const handleRecordingStopped = async () => {
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    const blob = new Blob(audioChunksRef.current, { type: mimeType });
    teardownRecording();
    if (blob.size === 0) return;

    const localUrl = URL.createObjectURL(blob);

    // Persist to the server (best-effort — playback uses the local blob URL
    // above regardless, since this chat session isn't saved/reloaded).
    const fd = new FormData();
    fd.append('file', blob, `voice-note.${mimeType.includes('webm') ? 'webm' : 'mp3'}`);
    api.post('/ai/tutor/voice-note', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {});

    const studentMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      role: 'student',
      content: '',
      audioUrl: localUrl,
      timestamp: Date.now(),
    };
    const tutorMsg: ChatMessage = {
      id: 'msg-' + (Date.now() + 1),
      role: 'tutor',
      content:
        lang === 'so'
          ? 'Waan helay codkaaga! Laakiin qalabka qoraalka-u-beddelka codka (speech-to-text) weli lagama dejin platform-kan, markaa ma akhrin karo waxa aad dhahday. Fadlan su\'aashaada ku qor.'
          : lang === 'ar'
            ? 'استلمت رسالتك الصوتية! لكن تحويل الصوت إلى نص غير مُفعّل بعد على هذه المنصة، لذا لا يمكنني قراءة ما قلته. الرجاء كتابة سؤالك.'
            : "I received your voice message! Speech-to-text isn't configured on this platform yet, so I can't read what you said — please type your question instead.",
      timestamp: Date.now() + 1,
    };
    setMessages((prev) => [...prev, studentMsg, tutorMsg]);
  };

  // ── Voice: Live Voice Chat (UI shell — no realtime backend configured) ──
  const openLiveVoice = async () => {
    setMicMenuOpen(false);
    setVoiceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setLiveVoiceOpen(true);
    } catch {
      setVoiceError('Microphone access was denied or is unavailable.');
    }
  };

  const closeLiveVoice = () => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setLiveVoiceOpen(false);
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Format time ──
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // ── Loading / Error ──
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Loading AI Tutor...</p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || 'Course not found'}</p>
          <Link to="/student/courses" className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white hover:bg-primary-700">
            Back to Courses
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] flex">
      {/* ================================================================ */}
      {/* LEFT SIDEBAR — Course Context */}
      {/* ================================================================ */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="hidden lg:block w-[280px] flex-shrink-0 border-r border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden"
          >
            <div className="flex flex-col h-screen">
              {/* Sidebar Header */}
              <div className="p-4 border-b border-[var(--color-border-default)]">
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => navigate(`/student/courses/${courseId}/learn`)}
                    className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    ← Back to Course
                  </button>
                </div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">
                  {getTitle(course)}
                </h3>
                <div className="flex items-center gap-2 mt-1 mb-3">
                  <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]">
                    {categoryLabels[course.category] || course.category}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${levelColors[course.level] || ''}`}>
                    {levelLabels[course.level] || course.level}
                  </span>
                </div>

                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)]">
                    <span>Progress</span>
                    <span className="font-semibold">{progressPct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${progressPct >= 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                      style={{ width: `${Math.min(progressPct, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)]">
                    {completedCount}/{totalCount} items completed
                  </p>
                </div>

                {activeLessonTitle && (
                  <div className="mt-3 p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800">
                    <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mb-0.5">📖 Active Lesson Context</p>
                    <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{activeLessonTitle.chapterTitle}</p>
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 truncate">{activeLessonTitle.lessonTitle}</p>
                  </div>
                )}
              </div>

              {/* Chapters quick-toggle */}
              {content && content.chapters.length > 0 && (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] px-2 mb-1">
                    📚 Chapters
                  </p>
                  {content.chapters.map((ch, idx) => (
                    <div
                      key={ch._id || idx}
                      className="rounded-xl bg-[var(--color-surface-secondary)] px-3 py-2.5 cursor-pointer hover:bg-[var(--color-surface-tertiary)] transition-colors border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800"
                      onClick={() => {
                        const prompt = lang === 'so'
                          ? `Wax ka ii sheeg cutubka: "${ch.title}"`
                          : lang === 'ar'
                            ? `أخبرني عن الفصل: "${ch.title}"`
                            : `Tell me about the chapter: "${ch.title}"`;
                        handleQuickPrompt(prompt);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{ch.title}</span>
                      </div>
                      <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 ml-7">{ch.items.length} items</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer info */}
              <div className="p-3 border-t border-[var(--color-border-default)]">
                <p className="text-[10px] text-[var(--color-text-tertiary)] text-center">
                  AI Tutor • Context-aware • {getTitle(course)}
                </p>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* MAIN CHAT PANEL */}
      {/* ================================================================ */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)] flex-shrink-0">
          {/* Sidebar toggle (desktop) */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors flex-shrink-0"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Back (mobile) */}
          <button
            onClick={() => navigate(`/student/courses/${courseId}/learn`)}
            className="lg:hidden flex items-center gap-1 text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Course
          </button>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-lg flex-shrink-0">
              🤖
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--color-text-primary)] truncate">AI Tutor</h2>
              <p className="text-[10px] text-[var(--color-text-tertiary)] truncate">{getTitle(course)}</p>
            </div>
          </div>

          {/* New chat / clear */}
          <button
            onClick={() => {
              const welcomeText = lang === 'so' ? WELCOME_MESSAGE_SO : lang === 'ar' ? WELCOME_MESSAGE_AR : WELCOME_MESSAGE_EN;
              setMessages([{ id: 'welcome', role: 'tutor', content: welcomeText, timestamp: Date.now() }]);
            }}
            className="text-[10px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] px-2 py-1 rounded-lg hover:bg-[var(--color-surface-tertiary)] transition-colors flex-shrink-0"
          >
            ↻ New Chat
          </button>
        </div>

        {/* ── Messages Area ── */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 space-y-5 bg-[var(--color-surface-secondary)]">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex gap-3 ${msg.role === 'student' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
                msg.role === 'tutor'
                  ? 'bg-indigo-100 dark:bg-indigo-900/40'
                  : 'bg-primary-100 dark:bg-primary-900/40'
              }`}>
                {msg.role === 'tutor' ? '🤖' : '👤'}
              </div>

              {/* Bubble */}
              <div className={`max-w-[75%] lg:max-w-[60%] ${
                msg.role === 'student' ? 'items-end' : 'items-start'
              }`}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'tutor'
                    ? 'bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] shadow-sm rounded-tl-md'
                    : 'bg-primary-600 text-white shadow-md rounded-tr-md'
                }`}>
                  {msg.audioUrl ? (
                    <div className="flex items-center gap-2 min-w-[220px]">
                      <span className="text-lg">🎤</span>
                      <audio controls src={msg.audioUrl} className="h-9 max-w-[200px]" />
                    </div>
                  ) : msg.role === 'tutor' ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none
                        prose-p:mb-3 prose-p:leading-relaxed
                        prose-ul:mb-3 prose-ul:list-disc prose-ul:pl-5 prose-ul:space-y-1
                        prose-ol:mb-3 prose-ol:list-decimal prose-ol:pl-5 prose-ol:space-y-1
                        prose-li:mb-1 prose-li:text-sm prose-li:leading-relaxed
                        prose-strong:font-bold prose-strong:text-[var(--color-text-primary)]
                        prose-h1:text-lg prose-h1:font-bold prose-h1:mb-3
                        prose-h2:text-base prose-h2:font-bold prose-h2:mb-2 prose-h2:mt-4
                        prose-h3:text-sm prose-h3:font-semibold prose-h3:mb-2 prose-h3:mt-3
                        prose-code:bg-[var(--color-surface-tertiary)] prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs
                        [&_span.font-bold]:font-bold [&_span.text-blue-600]:text-blue-600 dark:[&_span.text-blue-400]:text-blue-400"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownWithHighlights(msg.content) }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                <p className={`text-[10px] text-[var(--color-text-tertiary)] mt-1 ${msg.role === 'student' ? 'text-right' : 'text-left'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </motion.div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* ── Quick Prompts + Input Zone ── */}
        <div className="flex-shrink-0 bg-[var(--color-surface-primary)] border-t border-[var(--color-border-default)] px-4 lg:px-8 py-4 space-y-3">
          {/* Quick-prompt pills */}
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                type="button"
                onClick={() => handleQuickPrompt(qp.label)}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{qp.emoji}</span>
                <span>{qp.label}</span>
              </button>
            ))}
          </div>

          {voiceError && (
            <p className="text-xs text-red-500">{voiceError}</p>
          )}

          {/* Input row */}
          <div className="flex items-end gap-3">
            {/* Mic button + dropdown */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setMicMenuOpen((o) => !o)}
                disabled={recording}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
                  recording
                    ? 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-600 cursor-not-allowed'
                    : 'border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:text-blue-600 hover:bg-[var(--color-surface-tertiary)]'
                }`}
                title="Voice input"
              >
                <Mic className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {micMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMicMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-12 left-0 z-20 w-56 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-lg overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={startRecording}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                      >
                        <Mic className="w-4 h-4 text-blue-600" />
                        Record Voice Note
                      </button>
                      <button
                        type="button"
                        onClick={openLiveVoice}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors border-t border-[var(--color-border-subtle)]"
                      >
                        <Phone className="w-4 h-4 text-emerald-600" />
                        Start Live Voice Chat
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* File attach icon (placeholder) */}
            <button
              type="button"
              className="flex-shrink-0 w-10 h-10 rounded-xl border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
              title="Attach file (coming soon)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            {recording ? (
              /* Recording state — replaces the textarea while active */
              <div className="flex-1 flex items-center gap-3 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20 px-4 py-3">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
                <div className="flex items-center gap-0.5 flex-1">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <span
                      key={i}
                      className="w-1 rounded-full bg-red-400/70 dark:bg-red-500/60 animate-pulse"
                      style={{
                        height: `${8 + ((i * 37) % 16)}px`,
                        animationDelay: `${(i % 5) * 0.12}s`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm font-mono font-semibold text-red-600 dark:text-red-400 flex-shrink-0">
                  {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={stopRecordingAndSend}
                  className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white hover:bg-red-700 transition-colors"
                  title="Stop and send"
                >
                  <Square className="w-3.5 h-3.5" fill="currentColor" />
                </button>
              </div>
            ) : (
              /* Textarea */
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  lang === 'so'
                    ? 'Weydii su\'aashaada...'
                    : lang === 'ar'
                      ? 'اطرح سؤالك...'
                      : 'Ask your question...'
                }
                rows={2}
                className="flex-1 resize-none rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-shadow"
                disabled={sending}
              />
            )}

            {/* Send button */}
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!draft.trim() || sending}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-600/20"
            >
              {sending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Live Voice Chat Overlay ── */}
      <AnimatePresence>
        {liveVoiceOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-3xl bg-[var(--color-surface-primary)] p-8 text-center space-y-5 shadow-2xl"
            >
              <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/30 animate-ping" />
                <span className="absolute inline-flex h-[85%] w-[85%] rounded-full bg-emerald-400/40 animate-ping" style={{ animationDelay: '0.3s' }} />
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg">
                  <Mic className="h-7 w-7" />
                </span>
              </div>

              <div>
                <p className="text-base font-bold text-[var(--color-text-primary)]">Live Voice Session Active...</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Listening for your voice</p>
              </div>

              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-left">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-semibold">Coming soon —</span> real-time voice conversation needs a realtime
                  voice service (e.g. the OpenAI Realtime API) to be configured on the server. Your microphone is
                  active for preview only; the tutor can't hear you yet.
                </p>
              </div>

              <button
                type="button"
                onClick={closeLiveVoice}
                className="w-full rounded-xl bg-[var(--color-surface-tertiary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] transition-colors"
              >
                End Session
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===========================================================================
// Mock AI response generator (replace with real API call later)
// ===========================================================================
function generateMockTutorResponse(
  userMessage: string,
  lang: string,
  courseTitle: string,
  lessonContext: { lessonTitle: string; chapterTitle: string } | null,
): string {
  const lower = userMessage.toLowerCase();

  // Context line injected at the top (real implementation: sent as system prompt)
  const contextLine = lessonContext
    ? `(Context: "${courseTitle}" — Chapter "${lessonContext.chapterTitle}", Lesson "${lessonContext.lessonTitle}")\n\n`
    : `(Context: "${courseTitle}")\n\n`;

  if (lower.includes('summarize') || lower.includes('soo koob') || lower.includes('لخص')) {
    return contextLine + (lang === 'so'
      ? 'Halkan waa soo koobista cutubka hadda la doortay:\n\n• Mowduuca guud ee cutubkan wuxuu diiradda saarayaa fikradaha aasaasiga ah ee ku saabsan mawduuca.\n• Waxay ka kooban tahay dhowr cashar oo muhiim ah oo loo qaabeeyey si heerar leh.\n• Fikradaha muhiimka ah waxaa ka mid ah aqoonta aasaasiga ah iyo fahamka guud ee mawduuca.\n\nMa dooneysaa inaan si qoto-dheer u sharaxo qayb gaar ah?'
      : lang === 'ar'
        ? 'هذا ملخص الفصل المحدد حاليًا:\n\n• يركز الموضوع العام لهذا الفصل على الأفكار الأساسية المتعلقة بالموضوع.\n• يتكون من عدة دروس مهمة منظمة بشكل تدريجي.\n• تشمل النقاط الرئيسية المعرفة الأساسية والفهم العام للموضوع.\n\nهل ترغب في شرح جزء محدد بمزيد من التفصيل؟'
        : 'Here is a summary of the currently selected chapter:\n\n• The overall theme of this chapter focuses on core concepts related to the subject.\n• It consists of several important lessons structured progressively.\n• Key takeaways include foundational knowledge and general understanding of the topic.\n\nWould you like me to elaborate on a specific section?');
  }

  if (lower.includes('practice question') || lower.includes('su\'aalo tababar') || lower.includes('سؤال تدريبي')) {
    return contextLine + (lang === 'so'
      ? 'Waa kuwan su\'aalo tababar oo ku saabsan cutubka:\n\n1. Waa maxay fikradda ugu muhiimsan ee cutubkan?\n2. Sidee bay fikradahani ula xiriiraan cutubyadii hore?\n3. Ku sharax erayada muhiimka ah ee cutubkan lagu soo bandhigay.\n\nKu dadaal inaad ka jawaabto iyada oo aan la eegin qoraallada, ka dibna hubi fahamkaaga!'
      : lang === 'ar'
        ? 'إليك بعض الأسئلة التدريبية حول الفصل:\n\n1. ما هي الفكرة الرئيسية في هذا الفصل؟\n2. كيف ترتبط هذه المفاهيم بالفصول السابقة؟\n3. اشرح المصطلحات الأساسية المقدمة في هذا الفصل.\n\nحاول الإجابة دون النظر إلى النصوص، ثم تحقق من فهمك!'
        : 'Here are some practice questions for this chapter:\n\n1. What is the main idea presented in this chapter?\n2. How do these concepts relate to previous chapters?\n3. Explain the key terminology introduced in this chapter.\n\nTry to answer without looking at the texts, then check your understanding!');
  }

  if (lower.includes('explain') || lower.includes('core concept') || lower.includes('sharax') || lower.includes('faham') || lower.includes('شرح') || lower.includes('مفهوم')) {
    return contextLine + (lang === 'so'
      ? 'Fikradaha aasaasiga ah ee cutubkan waxaa ka mid ah:\n\n• Fahamka aasaasiga ah ee mawduuca — tani waa aasaaska dhismaha.\n• Xiriirka ka dhexeeya fikradaha kala duwan — sida ay u wada shaqeeyaan.\n• Codsiyada dhabta ah ee adduunka — sida loo isticmaalo aqoontan.\n\nMa jeceshahay inaan si faahfaahsan u sharaxo mid ka mid ah kuwan?'
      : lang === 'ar'
        ? 'تشمل المفاهيم الأساسية في هذا الفصل:\n\n• الفهم الأساسي للموضوع — هذا هو أساس البناء.\n• العلاقات بين المفاهيم المختلفة — كيف تعمل معًا.\n• التطبيقات الواقعية — كيفية استخدام هذه المعرفة.\n\nهل ترغب في شرح أحد هذه المفاهيم بمزيد من التفصيل؟'
        : 'The core concepts covered in this chapter include:\n\n• Foundational understanding of the subject — this is the building block.\n• Relationships between different concepts — how they work together.\n• Real-world applications — how to apply this knowledge practically.\n\nWould you like me to elaborate on any of these in more detail?');
  }

  if (lower.includes('study plan') || lower.includes('qorshe') || lower.includes('خطة دراسية')) {
    return contextLine + (lang === 'so'
      ? 'Waa kuwan qorshe waxbarasho oo la soo jeediyey:\n\n📅 Maalin 1-2: Akhri oo fahan cutubka oo dhan.\n📝 Maalin 3: Qor qoraallo kooban oo ku saabsan fikradaha muhiimka ah.\n❓ Maalin 4: Ku celceli su\'aalaha tababarka.\n🔄 Maalin 5: Dib u eeg oo xooji meelaha daciifka ah.\n\nTani waxay kaa caawin doontaa inaad si joogto ah ugu socoto oo aad si fiican u fahanto maaddada!'
      : lang === 'ar'
        ? 'إليك خطة دراسية مقترحة:\n\n📅 اليوم ١-٢: قراءة وفهم الفصل بأكمله.\n📝 اليوم ٣: كتابة ملاحظات موجزة عن النقاط الرئيسية.\n❓ اليوم ٤: التدرب على الأسئلة التدريبية.\n🔄 اليوم ٥: مراجعة وتعزيز المناطق الضعيفة.\n\nسيساعدك هذا على التقدم بثبات وإتقان المادة!'
        : 'Here is a suggested study plan:\n\n📅 Day 1-2: Read and comprehend the entire chapter.\n📝 Day 3: Write concise notes on key points.\n❓ Day 4: Practice with review questions.\n🔄 Day 5: Review and reinforce weak areas.\n\nThis will help you progress steadily and master the material!');
  }

  if (lower.includes('test') || lower.includes('quiz') || lower.includes('tijaabi') || lower.includes('imtixaan') || lower.includes('اختبار')) {
    return contextLine + (lang === 'so'
      ? 'Hagaag! Aan ku tijaabino fahamkaaga:\n\n1. ✅/❌ Fikradda A waa aasaaska mawduucan.\n2. Ku qeex ereyga B erayadaada.\n3. Waa maxay farqiga u dhexeeya C iyo D?\n\nKu jawaab su\'aalahan, waxaanan ku siin doonaa jawaab celin!'
      : lang === 'ar'
        ? 'حسنًا! دعنا نختبر فهمك:\n\n1. ✅/❌ المفهوم أ هو أساس هذا الموضوع.\n2. عرّف المصطلح ب بكلماتك الخاصة.\n3. ما الفرق بين ج و د؟\n\nأجب على هذه الأسئلة وسأقدم لك ملاحظات!'
        : 'Alright! Let me test your understanding:\n\n1. ✅/❌ Concept A is the foundation of this topic.\n2. Define term B in your own words.\n3. What is the difference between C and D?\n\nAnswer these questions and I\'ll provide feedback!');
  }

  if (lower.includes('example') || lower.includes('tusaale') || lower.includes('مثال')) {
    return contextLine + (lang === 'so'
      ? 'Halkan waxaa ah tusaale dhab ah oo adduunka ah:\n\nKa fakar xaaladdan: \[tusaale la xiriira mawduuca\]. Tani waxay muujineysaa sida fikradaha loo isticmaalo nolol maalmeedka. Ma jeceshahay tusaale kale?'
      : lang === 'ar'
        ? 'إليك مثالاً من العالم الحقيقي:\n\nفكر في هذا السيناريو: \[مثال متعلق بالموضوع\]. هذا يوضح كيف يتم تطبيق المفاهيم في الحياة اليومية. هل ترغب في مثال آخر؟'
        : 'Here is a real-world example:\n\nConsider this scenario: \[example related to the topic\]. This demonstrates how the concepts are applied in everyday life. Would you like another example?');
  }

  // Default / fallback response
  return contextLine + (lang === 'so'
    ? 'Waan fahmay su\'aashaada. Ma dooneysaa inaan sharaxo, soo koobo, ama ka jawaabo su\'aalo ku saabsan cutubkan? Waxaan halkaan u joogaa inaan kaa caawiyo!'
    : lang === 'ar'
      ? 'لقد فهمت سؤالك. هل ترغب في شرح أو تلخيص أو أسئلة حول هذا الفصل؟ أنا هنا لمساعدتك!'
      : 'I understand your question. Would you like me to explain, summarize, or provide questions about this chapter? I\'m here to help!');
}

export default StudentAiTutor;