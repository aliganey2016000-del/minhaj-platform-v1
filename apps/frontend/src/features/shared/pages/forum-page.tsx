/**
 * Forum Page — Public (Madal Guud) & Private (Wada-hadal Gaar ah) Threads
 *
 * Reusable across Admin, Teacher, Student, and Parent portals.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

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
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3 lg:px-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Forum</h1>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {tab === 'public' ? 'Public discussions (Madal Guud)' : 'Private conversations (Wada-hadal Gaar ah)'}
          </p>
        </div>
        {!activeThread && (
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
            + {tab === 'public' ? 'New Topic' : 'New Conversation'}
          </button>
        )}
        {activeThread && (
          <button onClick={() => setActiveThread(null)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">
            ← Back to Threads
          </button>
        )}
      </div>

      {/* Tab Bar */}
      {!activeThread && (
        <div className="flex border-b border-[var(--color-border-subtle)] px-4 lg:px-6">
          <button onClick={() => setTab('public')} className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'public' ? 'border-primary-600 text-primary-700 dark:text-primary-400' : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}`}>
            🏛️ Madal Guud (Public)
          </button>
          <button onClick={() => setTab('private')} className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'private' ? 'border-primary-600 text-primary-700 dark:text-primary-400' : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}`}>
            🔒 Wada-hadal Gaar ah (Private)
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 lg:mx-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button onClick={() => setError('')} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeThread ? (
          <div className="flex flex-col h-full">
            <div className="border-b border-[var(--color-border-subtle)] px-4 py-3 lg:px-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{activeThread.title || 'Private Conversation'}</h2>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {activeThread.type === 'public' ? `${activeThread.participantCount} participants` : `With ${activeThread.participants.filter((p) => p._id !== userId).map((p) => p.email).join(', ')}`}
                  </p>
                </div>
                {activeThread.createdBy._id === userId && (
                  <button onClick={() => handleDeleteThread(activeThread._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">Delete</button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6 space-y-3">
              {msgLoading ? (
                <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-tertiary)]"><span className="text-4xl mb-3">💬</span><p className="text-sm">No messages yet. Start the conversation!</p></div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderId._id === userId;
                  return (
                    <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMine ? 'bg-primary-600 text-white rounded-br-md' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)] rounded-bl-md'}`}>
                        {!isMine && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-[var(--color-text-primary)]">{msg.senderId.email}</span>
                            <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${ROLE_BADGES[msg.senderId.role] || 'bg-gray-100 text-gray-700'}`}>{ROLE_LABELS[msg.senderId.role] || msg.senderId.role}</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <div className={`flex items-center gap-2 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <span className={`text-[10px] ${isMine ? 'text-white/60' : 'text-[var(--color-text-tertiary)]'}`}>{formatTime(msg.createdAt)}</span>
                          {isMine && <button onClick={() => handleDeleteMessage(msg._id)} className="text-[10px] text-white/50 hover:text-white/80 transition-colors">Delete</button>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSend} className="border-t border-[var(--color-border-subtle)] px-4 py-3 lg:px-6">
              <div className="flex gap-2">
                <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your message..." className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40" disabled={sending} />
                <button type="submit" disabled={sending || !newMessage.trim()} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">{sending ? '...' : 'Send'}</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="overflow-y-auto h-full">
            {loading ? (
              <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-tertiary)]">
                <span className="text-5xl mb-4">{tab === 'public' ? '🏛️' : '🔒'}</span>
                <p className="text-lg font-medium text-[var(--color-text-primary)] mb-1">{tab === 'public' ? 'No public topics yet' : 'No private conversations yet'}</p>
                <p className="text-sm">{tab === 'public' ? 'Start a new discussion topic!' : 'Start a private conversation with someone!'}</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {threads.map((thread) => (
                  <div key={thread._id} onClick={() => openThread(thread)} className="flex items-start gap-3 px-4 py-3 lg:px-6 hover:bg-[var(--color-surface-secondary)] cursor-pointer transition-colors">
                    <span className="mt-0.5 text-xl flex-shrink-0">{thread.type === 'public' ? '🏛️' : '🔒'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{thread.title || `Private with ${thread.participants.filter((p: any) => (p._id || p) !== userId).map((p: any) => p.email).join(', ')}`}</h3>
                        {thread.isPinned && <span className="text-xs text-gold-500">📌</span>}
                      </div>
                      {thread.lastMessage ? (
                        <p className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5"><span className="font-medium">{thread.lastMessage.senderId.email}:</span> {thread.lastMessage.content}</p>
                      ) : (
                        <p className="text-xs text-[var(--color-text-tertiary)] italic mt-0.5">No messages yet</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">{thread.lastMessage ? formatTime(thread.lastMessage.createdAt) : formatTime(thread.createdAt)}</span>
                      {thread.type === 'public' && <span className="text-[10px] text-[var(--color-text-tertiary)]">{thread.participantCount} members</span>}
                      {thread.type === 'private' && <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]">{thread.participants.length} people</span>}
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
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">
              {tab === 'public' ? 'New Public Topic' : 'New Private Conversation'}
            </h2>

            {tab === 'public' ? (
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">Topic Title</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What do you want to discuss?" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40" autoFocus />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">Select Participants</label>
                {selectedParticipants.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedParticipants.map((p) => (
                      <span key={p._id} className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-950/30 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
                        {p.email}
                        <button onClick={() => setSelectedParticipants((prev) => prev.filter((x) => x._id !== p._id))} className="ml-0.5 text-primary-400 hover:text-red-500">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search by email..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
                {members.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-[var(--color-border-subtle)]">
                    {members.filter((m) => !selectedParticipants.some((s) => s._id === m._id)).map((m) => (
                      <button key={m._id} onClick={() => setSelectedParticipants((prev) => [...prev, m])} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-secondary)] transition-colors">
                        <span>{m.email}</span>
                        <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${ROLE_BADGES[m.role] || 'bg-gray-100 text-gray-700'}`}>{ROLE_LABELS[m.role] || m.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowCreate(false); setNewTitle(''); setSelectedParticipants([]); setMemberSearch(''); }} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={creating || (tab === 'public' && !newTitle.trim()) || (tab === 'private' && selectedParticipants.length === 0)} className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">{creating ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ForumPage;