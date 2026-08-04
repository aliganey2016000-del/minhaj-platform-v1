/**
 * Forum Page — Public discussions & private conversations.
 *
 * Reusable across Admin, Teacher, Student, and Parent portals.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  MessageSquare,
  Lock,
  Plus,
  ArrowLeft,
  Pin,
  Send,
  Trash2,
  Users,
  Inbox,
  Phone,
} from 'lucide-react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';
import { JitsiCallModal } from '../../../components/shared/jitsi-call-modal';
import { jitsiForumRoomName } from '../../../components/shared/jitsi-room';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserBrief {
  _id: string;
  email: string;
  role: string;
  preferredLanguage?: string;
}

interface LastMessage {
  _id: string;
  content: string;
  createdAt: string;
  senderId: UserBrief;
}

interface Thread {
  _id: string;
  type: 'public' | 'private';
  title: string;
  createdBy: UserBrief;
  participants: UserBrief[];
  isPinned: boolean;
  lastMessageAt: string;
  createdAt: string;
  lastMessage?: LastMessage;
  unreadCount: number;
  participantCount: number;
}

interface Message {
  _id: string;
  threadId: string;
  senderId: UserBrief;
  content: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', org_admin: 'Admin', teacher: 'Teacher', student: 'Student', parent: 'Parent',
};

const ROLE_BADGES: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  org_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  teacher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  student: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  parent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 172_800_000) return 'Yesterday';
  return d.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Small presentational components
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
        active
          ? 'bg-white text-primary-700 shadow-sm dark:bg-slate-700 dark:text-primary-300'
          : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/40 dark:hover:text-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 text-primary-400 dark:bg-primary-950/30 dark:text-primary-500">
        {icon}
      </div>
      <p className="mt-6 text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mt-1.5 max-w-xs text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      <button
        onClick={onCta}
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        {ctaLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForumPage() {
  const { user } = useAuth();
  const userId = user?.id || '';

  const [tab, setTab] = useState<'public' | 'private'>('public');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const [memberSearch, setMemberSearch] = useState('');
  const [members, setMembers] = useState<UserBrief[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<UserBrief[]>([]);

  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Fetch threads
  // -------------------------------------------------------------------------
  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/forum/threads', { params: { type: tab, limit: 50 } });
      setThreads(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load threads');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // -------------------------------------------------------------------------
  // Create thread
  // -------------------------------------------------------------------------
  const handleCreate = async () => {
    if (tab === 'public' && !newTitle.trim()) return;
    if (tab === 'private' && selectedParticipants.length === 0) return;
    setCreating(true);
    try {
      const payload: any = { type: tab };
      if (tab === 'public') payload.title = newTitle.trim();
      if (tab === 'private') payload.participants = selectedParticipants.map((p) => p._id);
      await api.post('/forum/threads', payload);
      setShowCreate(false);
      setNewTitle('');
      setSelectedParticipants([]);
      setMemberSearch('');
      fetchThreads();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create thread');
    } finally {
      setCreating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Search members
  // -------------------------------------------------------------------------
  const searchMembers = useCallback(async (query: string) => {
    if (!query.trim()) { setMembers([]); return; }
    try {
      const { data } = await api.get('/forum/members', { params: { search: query, limit: 20 } });
      setMembers((data.data || []).filter((m: UserBrief) => m._id !== userId));
    } catch { /* silently fail */ }
  }, [userId]);

  useEffect(() => {
    const t = setTimeout(() => searchMembers(memberSearch), 300);
    return () => clearTimeout(t);
  }, [memberSearch, searchMembers]);

  // -------------------------------------------------------------------------
  // Open thread
  // -------------------------------------------------------------------------
  const openThread = async (thread: Thread) => {
    setActiveThread(thread);
    setMsgLoading(true);
    setMessages([]);
    try {
      const { data } = await api.get(`/forum/threads/${thread._id}`);
      setMessages(data.data.messages || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load messages');
    } finally {
      setMsgLoading(false);
    }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeThread) return;
    setSending(true);
    try {
      const { data } = await api.post(`/forum/threads/${activeThread._id}/messages`, { content: newMessage.trim() });
      setMessages((prev) => [...prev, data.data]);
      setNewMessage('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // -------------------------------------------------------------------------
  // Delete thread / message
  // -------------------------------------------------------------------------
  const handleDeleteThread = async (threadId: string) => {
    if (!window.confirm('Delete this thread and all its messages?')) return;
    try {
      await api.delete(`/forum/threads/${threadId}`);
      if (activeThread?._id === threadId) setActiveThread(null);
      fetchThreads();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete thread');
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/forum/messages/${msgId}`);
      setMessages((prev) => prev.filter((m) => m._id !== msgId));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete message');
    }
  };

  // Poll for new messages
  useEffect(() => {
    if (!activeThread) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/forum/threads/${activeThread._id}`, { params: { limit: 200 } });
        setMessages(data.data.messages || []);
      } catch { /* ignore */ }
    }, 10_000);
    return () => clearInterval(interval);
  }, [activeThread]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-800 lg:px-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Forum</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tab === 'public'
              ? 'Browse and participate in open community discussions.'
              : 'Private, one-on-one and group conversations.'}
          </p>
        </div>
        {!activeThread && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
            {tab === 'public' ? 'New Topic' : 'New Conversation'}
          </button>
        )}
        {activeThread && (
          <button
            onClick={() => setActiveThread(null)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Back to Threads
          </button>
        )}
      </div>

      {/* Tab Bar — segmented pill control */}
      {!activeThread && (
        <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-800 lg:px-6">
          <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-900">
            <TabButton
              active={tab === 'public'}
              onClick={() => setTab('public')}
              icon={<MessageSquare className="h-4 w-4" strokeWidth={2} />}
              label="Public Forum"
            />
            <TabButton
              active={tab === 'private'}
              onClick={() => setTab('private')}
              icon={<Lock className="h-4 w-4" strokeWidth={2} />}
              label="Private Channels"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 lg:mx-6">
          {error}
          <button onClick={() => setError('')} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeThread ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-800 lg:px-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{activeThread.title || 'Private Conversation'}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeThread.type === 'public' ? `${activeThread.participantCount} participants` : `With ${activeThread.participants.filter((p) => p._id !== userId).map((p) => p.email).join(', ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCall(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    <Phone className="h-3.5 w-3.5" strokeWidth={2} />
                    Call
                  </button>
                  {activeThread.createdBy._id === userId && (
                    <button onClick={() => handleDeleteThread(activeThread._id)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 lg:px-6">
              {msgLoading ? (
                <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary-600 dark:border-slate-700" /></div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
                  <MessageSquare className="h-10 w-10" strokeWidth={1.5} />
                  <p className="mt-3 text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderId._id === userId;
                  return (
                    <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMine ? 'rounded-br-md bg-primary-600 text-white' : 'rounded-bl-md bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100'}`}>
                        {!isMine && (
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{msg.senderId.email}</span>
                            <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${ROLE_BADGES[msg.senderId.role] || 'bg-gray-100 text-gray-700'}`}>{ROLE_LABELS[msg.senderId.role] || msg.senderId.role}</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                        <div className={`mt-1 flex items-center gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <span className={`text-[10px] ${isMine ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>{formatTime(msg.createdAt)}</span>
                          {isMine && <button onClick={() => handleDeleteMessage(msg._id)} className="text-[10px] text-white/50 transition-colors hover:text-white/80">Delete</button>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSend} className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-800 lg:px-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-700 dark:bg-slate-900"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" strokeWidth={2} />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-200 border-t-primary-600 dark:border-slate-700" /></div>
            ) : threads.length === 0 ? (
              <EmptyState
                icon={tab === 'public' ? <MessageSquare className="h-9 w-9" strokeWidth={1.5} /> : <Inbox className="h-9 w-9" strokeWidth={1.5} />}
                title={tab === 'public' ? 'No public topics yet' : 'No private conversations yet'}
                subtitle={tab === 'public' ? 'Start a new discussion topic and get the conversation going.' : 'Start a private conversation with someone in your organization.'}
                ctaLabel="Start a Discussion"
                onCta={() => setShowCreate(true)}
              />
            ) : (
              <div className="flex flex-col gap-2.5 p-4 lg:p-6">
                {threads.map((thread) => (
                  <div
                    key={thread._id}
                    onClick={() => openThread(thread)}
                    className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-800"
                  >
                    <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/30 dark:text-primary-400">
                      {thread.type === 'public' ? <MessageSquare className="h-4 w-4" strokeWidth={2} /> : <Lock className="h-4 w-4" strokeWidth={2} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{thread.title || `Private with ${thread.participants.filter((p: any) => (p._id || p) !== userId).map((p: any) => p.email).join(', ')}`}</h3>
                        {thread.isPinned && <Pin className="h-3.5 w-3.5 flex-shrink-0 fill-gold-400 text-gold-500" strokeWidth={1.5} />}
                      </div>
                      {thread.lastMessage ? (
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400"><span className="font-medium">{thread.lastMessage.senderId.email}:</span> {thread.lastMessage.content}</p>
                      ) : (
                        <p className="mt-0.5 text-xs italic text-slate-400 dark:text-slate-500">No messages yet</p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{thread.lastMessage ? formatTime(thread.lastMessage.createdAt) : formatTime(thread.createdAt)}</span>
                      {thread.type === 'public' && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                          <Users className="h-3 w-3" strokeWidth={2} />
                          {thread.participantCount}
                        </span>
                      )}
                      {thread.type === 'private' && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{thread.participants.length} people</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Thread Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => { setShowCreate(false); setNewTitle(''); setSelectedParticipants([]); setMemberSearch(''); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
              {tab === 'public' ? 'New Public Topic' : 'New Private Conversation'}
            </h2>

            {tab === 'public' ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Topic Title</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What do you want to discuss?" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-700 dark:bg-slate-900" autoFocus />
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Select Participants</label>
                {selectedParticipants.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {selectedParticipants.map((p) => (
                      <span key={p._id} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
                        {p.email}
                        <button onClick={() => setSelectedParticipants((prev) => prev.filter((x) => x._id !== p._id))} className="ml-0.5 text-primary-400 hover:text-red-500">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search by email..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-700 dark:bg-slate-900" />
                {members.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    {members.filter((m) => !selectedParticipants.some((s) => s._id === m._id)).map((m) => (
                      <button key={m._id} onClick={() => setSelectedParticipants((prev) => [...prev, m])} className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700">
                        <span>{m.email}</span>
                        <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${ROLE_BADGES[m.role] || 'bg-gray-100 text-gray-700'}`}>{ROLE_LABELS[m.role] || m.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setShowCreate(false); setNewTitle(''); setSelectedParticipants([]); setMemberSearch(''); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</button>
              <button onClick={handleCreate} disabled={creating || (tab === 'public' && !newTitle.trim()) || (tab === 'private' && selectedParticipants.length === 0)} className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50">{creating ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Voice/Video Call — everyone who opens this thread and hits Call lands
          in the same Jitsi room, no link to share. No single "teacher" role
          here (peers in a conversation), so everyone joins as a moderator
          with audio on by default. */}
      {showCall && activeThread && (
        <JitsiCallModal
          roomName={jitsiForumRoomName(activeThread._id)}
          displayName={user?.email || 'You'}
          isModerator
          title={activeThread.title || 'Private Conversation'}
          onClose={() => setShowCall(false)}
        />
      )}
    </div>
  );
}

export default ForumPage;
