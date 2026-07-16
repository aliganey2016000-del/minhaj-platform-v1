/**
 * Room Allocation — Admin/Teacher
 * Manage physical exam rooms (halls) and auto-generate seat/desk assignments
 * for a chosen exam.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface ExamRoom { _id: string; name: string; building: string; capacity: number; }
interface ExamBrief { _id: string; title: string; examDate: string; course?: { _id: string; title: { en: string } }; }
interface StudentBrief { _id: string; studentId: string; profile?: { firstName: string; lastName: string }; }
interface SeatAllocation {
  _id: string;
  room: ExamRoom;
  deskNumber: string;
  student: StudentBrief;
}

function RoomModal({ room, onClose, onSaved }: { room?: ExamRoom; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!room;
  const [name, setName] = useState(room?.name || '');
  const [building, setBuilding] = useState(room?.building || '');
  const [capacity, setCapacity] = useState(room?.capacity || 30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = { name, building, capacity: Number(capacity) };
      if (isEdit) await api.patch(`/exam-rooms/${room._id}`, payload);
      else await api.post('/exam-rooms', payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Room' : '➕ Add Exam Room'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Room Name *</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hall A" required />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Building</label>
            <input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="e.g. Main Building" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Capacity *</label>
            <input type="number" min={1} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} required />
          </div>
          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Add Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ExamRoomsManage() {
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ExamRoom | undefined>(undefined);

  const [selectedExam, setSelectedExam] = useState('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<SeatAllocation[]>([]);
  const [generating, setGenerating] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [roomsRes, examsRes] = await Promise.all([
        api.get('/exam-rooms'),
        api.get('/exams'),
      ]);
      setRooms(roomsRes.data.data || []);
      setExams(examsRes.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadSeating = async (examId: string) => {
    setSelectedExam(examId);
    setAllocations([]);
    if (!examId) return;
    try {
      const { data } = await api.get(`/exams/${examId}/seating`);
      setAllocations(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load seating');
    }
  };

  const toggleRoomSelection = (id: string) => {
    setSelectedRoomIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const handleGenerate = async () => {
    if (!selectedExam || selectedRoomIds.length === 0) return;
    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post(`/exams/${selectedExam}/seating/generate`, { roomIds: selectedRoomIds });
      setAllocations(data.data || []);
      setMessage(`✅ ${data.message || 'Seating generated'}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate seating');
    } finally {
      setGenerating(false);
    }
  };

  const handleClear = async () => {
    if (!selectedExam || !window.confirm('Clear all seat allocations for this exam?')) return;
    try {
      await api.delete(`/exams/${selectedExam}/seating`);
      setAllocations([]);
      setMessage('Seating cleared');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to clear seating');
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!window.confirm('Delete this room?')) return;
    try {
      await api.delete(`/exam-rooms/${id}`);
      setRooms((prev) => prev.filter((r) => r._id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete room (it may have active seat allocations)');
    }
  };

  const selectedCapacity = rooms.filter((r) => selectedRoomIds.includes(r._id)).reduce((sum, r) => sum + r.capacity, 0);

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>;
  }

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🏛️ Room Allocation</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{rooms.length} room{rooms.length === 1 ? '' : 's'} configured</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">
            + Add Room
          </button>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {/* Rooms list */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Room</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Building</th>
                  <th className="text-center px-5 py-3 font-semibold">Capacity</th>
                  <th className="text-center px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rooms.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-16 text-[var(--color-text-tertiary)]">
                    <p className="text-lg mb-1">🏛️ No exam rooms yet</p>
                    <p className="text-sm">Click "+ Add Room" to create one.</p>
                  </td></tr>
                ) : rooms.map((room) => (
                  <tr key={room._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                    <td className="px-5 py-4 font-semibold">{room.name}</td>
                    <td className="px-5 py-4 hidden md:table-cell text-[var(--color-text-tertiary)]">{room.building || '—'}</td>
                    <td className="px-5 py-4 text-center font-mono">{room.capacity}</td>
                    <td className="px-5 py-4 text-center">
                      <button onClick={() => setEditingRoom(room)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30" title="Edit">✏️</button>
                      <button onClick={() => handleDeleteRoom(room._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Seat generator */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card space-y-4">
          <h2 className="text-lg font-bold">🪑 Generate Seating for an Exam</h2>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Select Exam</label>
            <select value={selectedExam} onChange={(e) => loadSeating(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
              <option value="">Choose an exam...</option>
              {exams.map((e) => (
                <option key={e._id} value={e._id}>{e.title} — {e.course?.title?.en} ({new Date(e.examDate).toLocaleDateString()})</option>
              ))}
            </select>
          </div>

          {selectedExam && (
            <>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Select Rooms to Use</label>
                <div className="flex flex-wrap gap-2">
                  {rooms.map((room) => (
                    <button
                      key={room._id}
                      type="button"
                      onClick={() => toggleRoomSelection(room._id)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                        selectedRoomIds.includes(room._id)
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
                      }`}
                    >
                      {room.name} ({room.capacity} seats)
                    </button>
                  ))}
                </div>
                {selectedRoomIds.length > 0 && (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-2">Total capacity selected: <strong>{selectedCapacity}</strong> seats</p>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={handleGenerate} disabled={generating || selectedRoomIds.length === 0} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm">
                  {generating ? 'Generating...' : '🎲 Generate Seat Assignments'}
                </button>
                {allocations.length > 0 && (
                  <button onClick={handleClear} className="rounded-xl border border-red-200 dark:border-red-900/50 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                    Clear Seating
                  </button>
                )}
              </div>

              {allocations.length > 0 && (
                <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden mt-2">
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)] sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold">Student</th>
                          <th className="text-center px-4 py-2 font-semibold">Room</th>
                          <th className="text-center px-4 py-2 font-semibold">Desk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocations.map((a) => (
                          <tr key={a._id} className="border-b border-[var(--color-border-subtle)]">
                            <td className="px-4 py-2">
                              <p className="font-medium">{a.student?.profile?.firstName} {a.student?.profile?.lastName}</p>
                              <p className="text-xs text-[var(--color-text-tertiary)]">{a.student?.studentId}</p>
                            </td>
                            <td className="px-4 py-2 text-center">{a.room?.name}</td>
                            <td className="px-4 py-2 text-center"><code className="text-xs bg-[var(--color-surface-tertiary)] rounded-md px-2 py-1">{a.deskNumber}</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showCreate && <RoomModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchAll(); }} />}
      {editingRoom && <RoomModal room={editingRoom} onClose={() => setEditingRoom(undefined)} onSaved={() => { setEditingRoom(undefined); fetchAll(); }} />}
    </div>
  );
}

export default ExamRoomsManage;
