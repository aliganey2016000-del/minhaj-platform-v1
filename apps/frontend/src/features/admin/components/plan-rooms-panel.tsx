import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  MoreVertical,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import api from '../../../lib/axios';
import { AcademicYearSelect } from '../../shared/components/academic-year-select';

export type PlanAllocation = {
  classId: string;
  quota: number;
};

export type PlanRoomRow = {
  roomId: string;
  allocations: PlanAllocation[];
};

export type RoomPlanItem = {
  classId: string;
  roomIds: string[];
  quotas: Array<{ roomId: string; count: number }>;
};

export type AutoDefaults = {
  academicYear: string;
  examType: string;
  classIds: string[];
  roomIds: string[];
  roomPlan: RoomPlanItem[];
  studentRoomOverrides: Array<{ studentId: string; roomId: string }>;
  capacityOverrideRoomIds: string[];
};

export type RoomPlanPriorityMode = 'balanced_security' | 'maximum_mixing' | 'maximum_room_usage';

export type RoomPlanSettings = {
  maxClassPortion: number;
  minSplitPortion: number;
  preferredGradesPerRoom: number;
  minimumGradesPerRoom: number;
  maxSameGradeSharePercent: number;
  preferredGradeDistance: number;
  targetRoomOccupancyPercent: number;
  occupancyBalanceTolerance: number;
  smallClassThreshold: number;
  keepSmallClassesTogether: boolean;
  splitBalanceEqual: boolean;
  spreadSameClassAcrossRooms: boolean;
  useMinimumRooms: boolean;
  minimumStudentsPerUsedRoom: number;
  reserveSeatsPerRoom: number;
  studentsPerInvigilator: number;
  maxInvigilatorsPerRoom: number;
  avoidSameClassSectionsTogether: boolean;
  avoidRepeatGradeMix: boolean;
  autoRepairInvalidPlan: boolean;
  priorityMode: RoomPlanPriorityMode;
};

type SchoolRef = { _id?: string; name?: string } | string;

type ClassItem = {
  _id: string;
  title: string;
  section?: string;
  department?: { _id: string; name: string } | string;
  status?: string;
  gradeLevel?: number;
  school?: SchoolRef;
};

type Room = {
  _id: string;
  name: string;
  building?: string;
  capacity: number;
  school?: SchoolRef;
};

type Props = {
  classes: ClassItem[];
  rooms: Room[];
  studentCounts: Record<string, number>;
  year: string;
  type: string;
  planRows: PlanRoomRow[];
  schoolId?: string;
  hideExamSelectors?: boolean;
  draftKey?: string;
  setYear: (value: string) => void;
  setType: (value: '' | 'mid' | 'final') => void;
  setPlanRows: (value: PlanRoomRow[]) => void;
  onGenerate: (defaults: AutoDefaults) => void | Promise<void>;
};

const DEFAULT_SETTINGS: RoomPlanSettings = {
  maxClassPortion: 50,
  minSplitPortion: 15,
  preferredGradesPerRoom: 3,
  minimumGradesPerRoom: 2,
  maxSameGradeSharePercent: 45,
  preferredGradeDistance: 2,
  targetRoomOccupancyPercent: 90,
  occupancyBalanceTolerance: 5,
  smallClassThreshold: 15,
  keepSmallClassesTogether: true,
  splitBalanceEqual: true,
  spreadSameClassAcrossRooms: true,
  useMinimumRooms: true,
  minimumStudentsPerUsedRoom: 20,
  reserveSeatsPerRoom: 2,
  studentsPerInvigilator: 30,
  maxInvigilatorsPerRoom: 2,
  avoidSameClassSectionsTogether: true,
  avoidRepeatGradeMix: true,
  autoRepairInvalidPlan: true,
  priorityMode: 'balanced_security',
};

const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

const classNameOf = (c: ClassItem) => [c.title, c.section].filter(Boolean).join(' ');
const departmentNameOf = (c: ClassItem) => typeof c.department === 'string' ? c.department : c.department?.name || '';
const schoolIdOf = (value?: SchoolRef) => typeof value === 'string' ? value : value?._id || '';

const numericGrade = (c: ClassItem) => {
  if (Number.isFinite(Number(c.gradeLevel))) return Number(c.gradeLevel);
  const match = String(c.title || '').match(/\d+/);
  return match ? Number(match[0]) : null;
};

const gradeKeyOf = (c: ClassItem) => {
  const grade = numericGrade(c);
  return grade !== null ? 'grade-' + grade : String(c.title || c._id).trim().toLowerCase();
};

const gradeLabelOf = (c: ClassItem) => {
  const grade = numericGrade(c);
  return grade !== null ? 'Grade ' + grade : c.title;
};

const equalSplit = (total: number, parts: number) => {
  const safeParts = Math.max(1, Math.min(parts, Math.max(1, total)));
  const base = Math.floor(total / safeParts);
  const extra = total % safeParts;
  return Array.from({ length: safeParts }, (_, index) => base + (index < extra ? 1 : 0));
};

export function PlanRoomsPanel({
  classes,
  rooms,
  studentCounts,
  year,
  type,
  planRows,
  schoolId,
  hideExamSelectors = false,
  draftKey,
  setYear,
  setType,
  setPlanRows,
  onGenerate,
}: Props) {
  const [localError, setLocalError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<RoomPlanSettings>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<RoomPlanSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const [capacityOverrideRoomIds, setCapacityOverrideRoomIds] = useState<string[]>([]);
  const [classExtraDrafts, setClassExtraDrafts] = useState<Record<string, number>>({});
  const [expandedClassRooms, setExpandedClassRooms] = useState<Record<string, boolean>>({});
  const [resolutionTab, setResolutionTab] = useState<'plan' | 'room' | 'class'>('plan');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmingPlan, setConfirmingPlan] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const restoredDraftKey = useRef('');

  const activeClasses = useMemo(
    () => classes
      .filter(c => c.status === 'active' && (studentCounts[c._id] || 0) > 0)
      .slice()
      .sort((a, b) => {
        const ga = numericGrade(a);
        const gb = numericGrade(b);
        if (ga !== null && gb !== null && ga !== gb) return ga - gb;
        return classNameOf(a).localeCompare(classNameOf(b), undefined, { numeric: true });
      }),
    [classes, studentCounts],
  );

  const sortedRooms = useMemo(
    () => rooms
      .slice()
      .sort((a, b) => (a.building || '').localeCompare(b.building || '') || a.name.localeCompare(b.name, undefined, { numeric: true })),
    [rooms],
  );

  const resolvedSchoolId = useMemo(() =>
    schoolId
    || schoolIdOf(sortedRooms.find(room => schoolIdOf(room.school))?.school)
    || schoolIdOf(activeClasses.find(cls => schoolIdOf(cls.school))?.school)
    || '',
  [schoolId, sortedRooms, activeClasses]);

  const draftStorageKey = useMemo(
    () => 'sahal:room-plan-draft:' + (
      draftKey || [resolvedSchoolId || 'current', year || 'year', type || 'exam'].join(':')
    ),
    [draftKey, resolvedSchoolId, year, type],
  );

  useEffect(() => {
    if (!sortedRooms.length || !activeClasses.length || restoredDraftKey.current === draftStorageKey) return;

    setDraftReady(false);
    const validRoomIds = new Set(sortedRooms.map(room => room._id));
    const validClassIds = new Set(activeClasses.map(cls => cls._id));

    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        const savedRows: PlanRoomRow[] = Array.isArray(saved?.planRows) ? saved.planRows : [];
        const restoredRows = sortedRooms.map(room => {
          const row = savedRows.find(item => item?.roomId === room._id);
          return {
            roomId: room._id,
            allocations: Array.isArray(row?.allocations)
              ? row.allocations
                  .filter((allocation: PlanAllocation) => validClassIds.has(allocation.classId) && Number(allocation.quota) > 0)
                  .map((allocation: PlanAllocation) => ({
                    classId: allocation.classId,
                    quota: Math.max(0, Number(allocation.quota) || 0),
                  }))
              : [],
          };
        });

        if (restoredRows.some(row => row.allocations.length > 0)) setPlanRows(restoredRows);

        setCapacityOverrideRoomIds(
          Array.isArray(saved?.capacityOverrideRoomIds)
            ? saved.capacityOverrideRoomIds.filter((roomId: string) => validRoomIds.has(roomId))
            : [],
        );
        setClassExtraDrafts(
          saved?.classExtraDrafts && typeof saved.classExtraDrafts === 'object'
            ? Object.fromEntries(
                Object.entries(saved.classExtraDrafts)
                  .filter(([key, value]) => {
                    const [classId, roomId] = key.split('::');
                    return validClassIds.has(classId) && validRoomIds.has(roomId) && Number(value) >= 0;
                  })
                  .map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
              )
            : {},
        );

        if (restoredRows.some(row => row.allocations.length > 0)) {
          setSettingsMessage('Unsaved Room Plan draft restored from this device.');
        }
      }
    } catch {
      // Continue with a fresh plan if browser draft data is unreadable.
    } finally {
      restoredDraftKey.current = draftStorageKey;
      setDraftReady(true);
    }
  }, [draftStorageKey, sortedRooms, activeClasses, setPlanRows]);

  useEffect(() => {
    if (!draftReady || restoredDraftKey.current !== draftStorageKey) return;

    const hasPlan = planRows.some(row => row.allocations.some(allocation => Number(allocation.quota) > 0));
    const hasManualResolution = capacityOverrideRoomIds.length > 0
      || Object.values(classExtraDrafts).some(value => Number(value) > 0);

    try {
      if (!hasPlan && !hasManualResolution) {
        window.localStorage.removeItem(draftStorageKey);
      } else {
        window.localStorage.setItem(draftStorageKey, JSON.stringify({
          planRows,
          capacityOverrideRoomIds,
          classExtraDrafts,
          savedAt: new Date().toISOString(),
        }));
      }
    } catch {
      // Draft persistence is best-effort only.
    }
  }, [draftReady, draftStorageKey, planRows, capacityOverrideRoomIds, classExtraDrafts]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSettingsLoading(true);
      setSettingsMessage('');
      try {
        const response = await api.get('/exam-rooms/plan-settings', {
          params: resolvedSchoolId ? { school: resolvedSchoolId } : undefined,
        });
        if (!cancelled) {
          const loadedSettings = { ...DEFAULT_SETTINGS, ...(response.data?.data?.settings || {}) };
          setSettings(loadedSettings);
          setSavedSettings(loadedSettings);
          setNumberDrafts({});
          setSettingsDirty(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSettings(DEFAULT_SETTINGS);
          setSavedSettings(DEFAULT_SETTINGS);
          setSettingsMessage(err.response?.data?.message || 'Using recommended Room Plan defaults.');
        }
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [resolvedSchoolId]);

  const classById = useMemo(() => new Map(activeClasses.map(c => [c._id, c])), [activeClasses]);
  const roomById = useMemo(() => new Map(sortedRooms.map(r => [r._id, r])), [sortedRooms]);
  const rowOf = (roomId: string) => planRows.find(row => row.roomId === roomId) || { roomId, allocations: [] };

  const effectiveCapacity = (room: Room) => {
    const physical = Math.max(0, Math.trunc(Number(room.capacity) || 0));
    if (!physical) return 0;
    const afterReserve = Math.max(1, physical - Math.min(settings.reserveSeatsPerRoom, Math.max(0, physical - 1)));
    const invigilatorCapacity = Math.max(1, settings.studentsPerInvigilator * settings.maxInvigilatorsPerRoom);
    return Math.max(1, Math.min(afterReserve, invigilatorCapacity));
  };

  const totalRoomCapacity = sortedRooms.reduce((sum, room) => sum + (Number(room.capacity) || 0), 0);
  const totalOperationalCapacity = sortedRooms.reduce((sum, room) => sum + effectiveCapacity(room), 0);
  const activeStudentTotal = activeClasses.reduce((sum, cls) => sum + (studentCounts[cls._id] || 0), 0);

  const recommendedSettings = useMemo<RoomPlanSettings>(() => {
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(max, Math.round(value)));
    const roomCount = Math.max(1, sortedRooms.length);
    const totalPhysical = sortedRooms.reduce((sum, room) => sum + Math.max(0, Number(room.capacity) || 0), 0);
    const averagePhysical = totalPhysical / roomCount;
    const targetStudentsPerRoom = activeStudentTotal > 0
      ? Math.ceil(activeStudentTotal / roomCount)
      : Math.max(1, Math.round(averagePhysical * 0.75));
    const preferredGrades = activeClasses.length >= 3 ? 3 : 2;
    const recommendedPortion = clamp(
      targetStudentsPerRoom / Math.max(1, preferredGrades),
      15,
      50,
    );
    const recommendedMinSplit = clamp(recommendedPortion * 0.55, 5, recommendedPortion);
    const recommendedOccupancy = averagePhysical > 0
      ? clamp((targetStudentsPerRoom / averagePhysical) * 100, 50, 95)
      : 90;
    const recommendedStudentsPerInvigilator = averagePhysical > 0
      ? clamp(averagePhysical / 2, 1, 100)
      : DEFAULT_SETTINGS.studentsPerInvigilator;

    return {
      ...DEFAULT_SETTINGS,
      maxClassPortion: recommendedPortion,
      minSplitPortion: recommendedMinSplit,
      preferredGradesPerRoom: preferredGrades,
      minimumGradesPerRoom: activeClasses.length >= 2 ? 2 : 1,
      maxSameGradeSharePercent: preferredGrades === 3 ? 45 : 55,
      preferredGradeDistance: 2,
      targetRoomOccupancyPercent: recommendedOccupancy,
      occupancyBalanceTolerance: 3,
      smallClassThreshold: Math.min(recommendedPortion, Math.max(8, recommendedMinSplit)),
      keepSmallClassesTogether: true,
      splitBalanceEqual: true,
      spreadSameClassAcrossRooms: true,
      useMinimumRooms: false,
      minimumStudentsPerUsedRoom: clamp(targetStudentsPerRoom * 0.5, 1, 100),
      reserveSeatsPerRoom: averagePhysical >= 20 ? 2 : 0,
      studentsPerInvigilator: recommendedStudentsPerInvigilator,
      maxInvigilatorsPerRoom: 2,
      avoidSameClassSectionsTogether: true,
      avoidRepeatGradeMix: true,
      autoRepairInvalidPlan: true,
      priorityMode: 'balanced_security',
    };
  }, [sortedRooms, activeClasses.length, activeStudentTotal]);

  const recommendedTargetPerRoom = sortedRooms.length
    ? Math.ceil(activeStudentTotal / sortedRooms.length)
    : 0;

  const applyRecommendedSettings = () => {
    setSettings(recommendedSettings);
    setNumberDrafts({});
    setSettingsDirty(true);
    setLocalError('');
    setSettingsMessage('');
  };

  const assignedByClass = useMemo(() => {
    const totals: Record<string, number> = {};
    planRows.forEach(row => row.allocations.forEach(allocation => {
      totals[allocation.classId] = (totals[allocation.classId] || 0) + Math.max(0, Number(allocation.quota) || 0);
    }));
    return totals;
  }, [planRows]);

  const assignedTotal = Object.values(assignedByClass).reduce((sum, value) => sum + value, 0);
  const usedRoomCount = planRows.filter(row => row.allocations.some(a => Number(a.quota) > 0)).length;
  const usedOperationalCapacity = planRows.reduce((sum, row) => {
    const room = roomById.get(row.roomId);
    return room && row.allocations.some(a => Number(a.quota) > 0) ? sum + effectiveCapacity(room) : sum;
  }, 0);

  const closeSettingsModal = () => {
    if (settingsSaving) return;
    setSettings(savedSettings);
    setNumberDrafts({});
    setSettingsDirty(false);
    setLocalError('');
    setSettingsOpen(false);
  };

  const updateSettings = <K extends keyof RoomPlanSettings>(key: K, value: RoomPlanSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value } as RoomPlanSettings;
      if (key === 'preferredGradesPerRoom') {
        next.minimumGradesPerRoom = Math.min(next.minimumGradesPerRoom, Number(value));
      }
      if (key === 'minimumGradesPerRoom') {
        next.minimumGradesPerRoom = Math.min(Number(value), next.preferredGradesPerRoom);
      }
      if (key === 'maxClassPortion') {
        next.minSplitPortion = Math.min(next.minSplitPortion, Number(value));
        next.smallClassThreshold = Math.min(next.smallClassThreshold, Number(value));
      }
      return next;
    });
    setSettingsDirty(true);
    setSettingsMessage('');
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsMessage('');
    setLocalError('');
    try {
      const body: any = { settings };
      if (resolvedSchoolId) body.school = resolvedSchoolId;
      const response = await api.patch('/exam-rooms/plan-settings', body);
      const saved = { ...DEFAULT_SETTINGS, ...(response.data?.data?.settings || settings) };
      setSettings(saved);
      setSavedSettings(saved);
      setNumberDrafts({});
      setSettingsDirty(false);
      setSettingsOpen(false);
      setSettingsMessage('Room Plan Settings saved successfully.');
    } catch (err: any) {
      setLocalError(err.response?.data?.message || 'Could not save Room Plan settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const buildRoomTargets = (usedRooms: Room[], totalStudents: number) => {
    const targets = new Map<string, number>(usedRooms.map(room => [room._id, 0]));
    for (let placed = 0; placed < totalStudents; placed += 1) {
      const candidate = usedRooms
        .filter(room => (targets.get(room._id) || 0) < effectiveCapacity(room))
        .sort((a, b) => {
          const aTarget = targets.get(a._id) || 0;
          const bTarget = targets.get(b._id) || 0;
          const aCap = Math.max(1, effectiveCapacity(a));
          const bCap = Math.max(1, effectiveCapacity(b));
          return aTarget - bTarget || (aTarget / aCap) - (bTarget / bCap) || bCap - aCap;
        })[0];
      if (!candidate) break;
      targets.set(candidate._id, (targets.get(candidate._id) || 0) + 1);
    }
    return targets;
  };

  const roomUsed = (roomId: string, rows: PlanRoomRow[] = planRows) =>
    (rows.find(row => row.roomId === roomId)?.allocations || [])
      .reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quota) || 0), 0);

  const generateSmartPlan = async () => {
    setLocalError('');
    setCapacityOverrideRoomIds([]);
    setClassExtraDrafts({});
    if (settingsDirty) {
      setLocalError('Save Room Plan Settings before generating so Review and Confirm use the same rules.');
      return;
    }
    if (!sortedRooms.length) {
      setLocalError('Add at least one Room before generating the plan.');
      return;
    }
    if (!activeClasses.length) {
      setLocalError('No active students were found in the active classes.');
      return;
    }
    if (totalRoomCapacity < activeStudentTotal) {
      setSettingsMessage(
        'Physical room capacity is short by ' + (activeStudentTotal - totalRoomCapacity)
        + ' seat(s). The smart plan will keep the safe allocation and let you resolve the remaining students by Class with an Admin-approved Room override.'
      );
    }
    if (totalOperationalCapacity < activeStudentTotal) {
      setSettingsMessage(
        'Operational capacity is below the student total. The smart plan will keep the safe allocation and show the remaining students for manual Room selection and approved overrides.'
      );
    }

    const roomsByCapacity = sortedRooms.slice().sort((a, b) =>
      effectiveCapacity(b) - effectiveCapacity(a)
      || a.name.localeCompare(b.name, undefined, { numeric: true })
    );

    const usedRooms: Room[] = [];
    let selectedCapacity = 0;
    for (const room of roomsByCapacity) {
      usedRooms.push(room);
      selectedCapacity += effectiveCapacity(room);
      if (selectedCapacity >= activeStudentTotal) break;
    }

    if (!settings.useMinimumRooms) {
      let targetCapacity = usedRooms.reduce((sum, room) =>
        sum + Math.max(1, Math.floor(effectiveCapacity(room) * settings.targetRoomOccupancyPercent / 100)), 0);
      for (const room of roomsByCapacity) {
        if (usedRooms.some(item => item._id === room._id)) continue;
        const projectedAverage = activeStudentTotal / (usedRooms.length + 1);
        if (targetCapacity >= activeStudentTotal || projectedAverage < settings.minimumStudentsPerUsedRoom) break;
        usedRooms.push(room);
        targetCapacity += Math.max(1, Math.floor(effectiveCapacity(room) * settings.targetRoomOccupancyPercent / 100));
      }
    }

    const targets = buildRoomTargets(usedRooms, activeStudentTotal);
    const averageTarget = activeStudentTotal / Math.max(1, usedRooms.length);
    const targetRoomHint = Math.max(
      settings.minSplitPortion * settings.minimumGradesPerRoom,
      Math.round(averageTarget),
    );

    type Portion = {
      id: string;
      classId: string;
      gradeKey: string;
      gradeNumber: number | null;
      count: number;
    };

    const portions: Portion[] = [];
    activeClasses.forEach(cls => {
      const total = studentCounts[cls._id] || 0;
      if (!total) return;

      let parts = 1;
      if (!(settings.keepSmallClassesTogether && total <= settings.smallClassThreshold) && total > settings.maxClassPortion) {
        let desiredMax = settings.maxClassPortion;
        if (settings.priorityMode === 'maximum_mixing') {
          desiredMax = Math.min(
            desiredMax,
            Math.max(settings.minSplitPortion, Math.floor(targetRoomHint / settings.preferredGradesPerRoom)),
          );
        } else if (settings.priorityMode === 'balanced_security') {
          desiredMax = Math.min(
            desiredMax,
            Math.max(
              settings.minSplitPortion,
              Math.floor(targetRoomHint * settings.maxSameGradeSharePercent / 100),
            ),
          );
        }

        parts = Math.max(1, Math.ceil(total / Math.max(1, desiredMax)));
        while (parts > 1 && Math.floor(total / parts) < settings.minSplitPortion) parts -= 1;
      }

      let splitCounts = equalSplit(total, parts);
      if (!settings.splitBalanceEqual && parts > 1) {
        const maxPart = Math.max(settings.minSplitPortion, Math.ceil(total / parts));
        splitCounts = [];
        let remaining = total;
        while (remaining > 0) {
          const count = Math.min(maxPart, remaining);
          splitCounts.push(count);
          remaining -= count;
        }
        if (splitCounts.length > 1 && splitCounts[splitCounts.length - 1] < settings.minSplitPortion) {
          const shortage = settings.minSplitPortion - splitCounts[splitCounts.length - 1];
          const donorIndex = splitCounts.length - 2;
          if (splitCounts[donorIndex] - shortage >= settings.minSplitPortion) {
            splitCounts[donorIndex] -= shortage;
            splitCounts[splitCounts.length - 1] += shortage;
          } else {
            splitCounts = equalSplit(total, parts);
          }
        }
      }

      splitCounts.forEach((count, index) => {
        portions.push({
          id: cls._id + '-' + index,
          classId: cls._id,
          gradeKey: gradeKeyOf(cls),
          gradeNumber: numericGrade(cls),
          count,
        });
      });
    });

    portions.sort((a, b) => b.count - a.count || (a.gradeNumber ?? 999) - (b.gradeNumber ?? 999) || a.id.localeCompare(b.id));

    const generatedRows: PlanRoomRow[] = sortedRooms.map(room => ({ roomId: room._id, allocations: [] }));
    const loadByRoom = new Map<string, number>(sortedRooms.map(room => [room._id, 0]));
    const mixSignatures = new Map<string, number>();
    let fallbackRoomsActivated = 0;
    let relaxedMixPlacements = 0;

    const addQuota = (roomId: string, classId: string, amount: number) => {
      const row = generatedRows.find(item => item.roomId === roomId)!;
      const existing = row.allocations.find(item => item.classId === classId);
      if (existing) existing.quota += amount;
      else row.allocations.push({ classId, quota: amount });
      loadByRoom.set(roomId, (loadByRoom.get(roomId) || 0) + amount);
    };

    const roomGradeCounts = (roomId: string) => {
      const row = generatedRows.find(item => item.roomId === roomId)!;
      const map = new Map<string, number>();
      row.allocations.forEach(allocation => {
        const cls = classById.get(allocation.classId);
        if (!cls || allocation.quota <= 0) return;
        const grade = gradeKeyOf(cls);
        map.set(grade, (map.get(grade) || 0) + allocation.quota);
      });
      return map;
    };

    const roomHasClass = (roomId: string, classId: string) =>
      generatedRows.find(item => item.roomId === roomId)?.allocations.some(item => item.classId === classId && item.quota > 0) || false;

    const gradeDistanceScore = (portion: Portion, grades: Map<string, number>) => {
      if (portion.gradeNumber === null || !grades.size) return 0;
      const existingNumbers = Array.from(grades.keys())
        .map(key => Number(key.replace('grade-', '')))
        .filter(Number.isFinite);
      if (!existingNumbers.length) return 0;
      return Math.min(...existingNumbers.map(value => Math.abs(value - Number(portion.gradeNumber))));
    };

    const queue = portions.slice();
    const unresolvedByClass = new Map<string, number>();
    let guard = 0;
    while (queue.length && guard < 5000) {
      guard += 1;
      const portion = queue.shift()!;
      const buildCandidates = (allowExtraGradeMix: boolean) => {
        const eligibleRooms = usedRooms
          .filter(room => {
            const row = generatedRows.find(item => item.roomId === room._id)!;
            const grades = roomGradeCounts(room._id);
            const existingClassCount = row.allocations.find(item => item.classId === portion.classId)?.quota || 0;
            if ((loadByRoom.get(room._id) || 0) + portion.count > effectiveCapacity(room)) return false;
            if (existingClassCount + portion.count > settings.maxClassPortion) return false;
            if (!allowExtraGradeMix && !grades.has(portion.gradeKey) && grades.size >= settings.preferredGradesPerRoom) return false;
            return true;
          });

        const freshRoomsForClass = settings.spreadSameClassAcrossRooms
          ? eligibleRooms.filter(room => !roomHasClass(room._id, portion.classId))
          : [];
        const candidatePool = freshRoomsForClass.length ? freshRoomsForClass : eligibleRooms;

        return candidatePool
          .map(room => {
            const load = loadByRoom.get(room._id) || 0;
            const target = targets.get(room._id) || 0;
            const grades = roomGradeCounts(room._id);
            const gradeAlready = grades.has(portion.gradeKey);
            const distinct = grades.size;
            const projectedLoad = load + portion.count;
            const projectedGradeCount = (grades.get(portion.gradeKey) || 0) + portion.count;
            const projectedShare = projectedLoad > 0 ? projectedGradeCount / projectedLoad * 100 : 0;
            const distance = gradeDistanceScore(portion, grades);
            let score = Math.abs(projectedLoad - target) * 5;

            if (projectedLoad > target) score += (projectedLoad - target) * 12;
            if (!gradeAlready && distinct < settings.preferredGradesPerRoom) score -= 90;
            if (!gradeAlready && distinct >= settings.preferredGradesPerRoom) score += allowExtraGradeMix ? 45 : 1000;
            if (gradeAlready && distinct < settings.minimumGradesPerRoom) score += 120;
            if (settings.avoidSameClassSectionsTogether && roomHasClass(room._id, portion.classId)) score += 180;
            if (settings.avoidSameClassSectionsTogether && gradeAlready && !roomHasClass(room._id, portion.classId)) score += 140;
            if (projectedShare > settings.maxSameGradeSharePercent) {
              score += (projectedShare - settings.maxSameGradeSharePercent) * (settings.priorityMode === 'maximum_mixing' ? 5 : 2);
            }
            if (!gradeAlready && distance >= settings.preferredGradeDistance) score -= Math.min(40, distance * 8);
            if (settings.priorityMode === 'maximum_room_usage') score -= load * 0.5;
            if (settings.priorityMode === 'maximum_mixing' && !gradeAlready) score -= 40;

            if (settings.avoidRepeatGradeMix && !gradeAlready) {
              const projectedSignature = Array.from(new Set([...grades.keys(), portion.gradeKey])).sort().join('|');
              const repeated = generatedRows.filter(other => {
                if (other.roomId === room._id) return false;
                const otherGrades = Array.from(roomGradeCounts(other.roomId).keys()).sort().join('|');
                return otherGrades && otherGrades === projectedSignature;
              }).length;
              score += repeated * 35;
            }

            return { room, score };
          })
          .sort((a, b) => a.score - b.score || a.room.name.localeCompare(b.room.name, undefined, { numeric: true }));
      };

      let candidates = buildCandidates(false);

      if (candidates.length) {
        addQuota(candidates[0].room._id, portion.classId, portion.count);
        continue;
      }

      // Before weakening any mix preference, activate another allowed Room.
      const nextUnusedRoom = roomsByCapacity.find(room =>
        !usedRooms.some(activeRoom => activeRoom._id === room._id)
      );
      if (nextUnusedRoom) {
        usedRooms.push(nextUnusedRoom);
        fallbackRoomsActivated += 1;

        const refreshedTargets = buildRoomTargets(usedRooms, activeStudentTotal);
        targets.clear();
        refreshedTargets.forEach((value, roomId) => targets.set(roomId, value));

        queue.unshift(portion);
        continue;
      }

      // Preferred Grades / Room is a preference, not a reason to leave
      // students unassigned when active Rooms still have safe capacity.
      candidates = buildCandidates(true);
      if (candidates.length) {
        addQuota(candidates[0].room._id, portion.classId, portion.count);
        relaxedMixPlacements += 1;
        continue;
      }

      if (portion.count >= settings.minSplitPortion * 2) {
        const split = equalSplit(portion.count, 2);
        queue.unshift(
          { ...portion, id: portion.id + '-b', count: split[1] },
          { ...portion, id: portion.id + '-a', count: split[0] },
        );
        continue;
      }

      unresolvedByClass.set(
        portion.classId,
        (unresolvedByClass.get(portion.classId) || 0) + portion.count,
      );
    }

    if (queue.length) {
      queue.forEach(portion => {
        unresolvedByClass.set(
          portion.classId,
          (unresolvedByClass.get(portion.classId) || 0) + portion.count,
        );
      });
      queue.splice(0, queue.length);
    }

    if (settings.autoRepairInvalidPlan) {
      const gradeSetOf = (row: PlanRoomRow) => new Set(
        row.allocations
          .filter(item => item.quota > 0)
          .map(item => {
            const cls = classById.get(item.classId);
            return cls ? gradeKeyOf(cls) : '';
          })
          .filter(Boolean)
      );

      for (const targetRow of generatedRows) {
        const targetLoad = loadByRoom.get(targetRow.roomId) || 0;
        const targetGrades = gradeSetOf(targetRow);
        if (!targetLoad || targetGrades.size >= settings.minimumGradesPerRoom) continue;

        const targetAllocation = targetRow.allocations.find(item => item.quota > 0);
        const targetClass = targetAllocation ? classById.get(targetAllocation.classId) : null;
        if (!targetAllocation || !targetClass) continue;
        const targetGrade = gradeKeyOf(targetClass);

        for (const donorRow of generatedRows) {
          if (donorRow.roomId === targetRow.roomId || !(loadByRoom.get(donorRow.roomId) || 0)) continue;
          const donorGrades = gradeSetOf(donorRow);
          if (donorGrades.size < settings.minimumGradesPerRoom) continue;

          const donorAllocation = donorRow.allocations.find(item => {
            if (item.quota <= 1) return false;
            const cls = classById.get(item.classId);
            return cls ? gradeKeyOf(cls) !== targetGrade : false;
          });
          if (!donorAllocation) continue;

          const swapCount = Math.max(
            1,
            Math.min(
              settings.minSplitPortion,
              donorAllocation.quota - 1,
              targetAllocation.quota,
            ),
          );
          if (swapCount <= 0) continue;

          donorAllocation.quota -= swapCount;
          targetAllocation.quota -= swapCount;
          const donorGetsTarget = donorRow.allocations.find(item => item.classId === targetAllocation.classId);
          if (donorGetsTarget) donorGetsTarget.quota += swapCount;
          else donorRow.allocations.push({ classId: targetAllocation.classId, quota: swapCount });

          const targetGetsDonor = targetRow.allocations.find(item => item.classId === donorAllocation.classId);
          if (targetGetsDonor) targetGetsDonor.quota += swapCount;
          else targetRow.allocations.push({ classId: donorAllocation.classId, quota: swapCount });
          break;
        }
      }
    }

    generatedRows.forEach(row => {
      row.allocations = row.allocations.filter(item => item.quota > 0);
      const grades = Array.from(new Set(row.allocations.map(item => {
        const cls = classById.get(item.classId);
        return cls ? gradeKeyOf(cls) : '';
      }).filter(Boolean))).sort();
      if (grades.length) {
        const signature = grades.join('|');
        mixSignatures.set(signature, (mixSignatures.get(signature) || 0) + 1);
      }
    });

    setPlanRows(generatedRows);
    setResolutionTab('plan');
    setActionsOpen(false);

    const unresolvedTotal = Array.from(unresolvedByClass.values()).reduce((sum, count) => sum + count, 0);
    if (unresolvedTotal > 0) {
      setSettingsMessage(
        'All available Rooms were considered. ' + unresolvedTotal
        + ' student(s) still remain and need Class/Room Resolution.'
      );
    } else if (fallbackRoomsActivated > 0 || relaxedMixPlacements > 0) {
      const details = [
        fallbackRoomsActivated > 0 ? fallbackRoomsActivated + ' additional Room(s) opened' : '',
        relaxedMixPlacements > 0 ? relaxedMixPlacements + ' placement(s) used a wider grade mix' : '',
      ].filter(Boolean).join(' · ');
      setSettingsMessage(
        'Smart plan completed with all students assigned. ' + details + '.'
      );
    } else {
      const repeatedMixes = Array.from(mixSignatures.values()).filter(count => count > 1).length;
      if (settings.avoidRepeatGradeMix && repeatedMixes > 0) {
        setSettingsMessage('Plan generated. Repeated grade combinations were minimized where capacity allowed.');
      } else {
        setSettingsMessage('Smart mixed-grade plan generated from the saved Room Plan settings.');
      }
    }
  };

  const validatePlan = () => {
    if (!year || !type) return 'Select Academic Year and Exam Type first.';
    for (const row of planRows) {
      const room = roomById.get(row.roomId);
      if (!room) continue;
      const used = row.allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quota) || 0), 0);
      const operationalCapacity = effectiveCapacity(room);
      const physicalCapacity = Math.max(0, Number(room.capacity) || 0);
      if (used > physicalCapacity && !capacityOverrideRoomIds.includes(room._id)) {
        return room.name + ' is over physical capacity by ' + (used - physicalCapacity) + ' and needs an Admin override.';
      }
      if (used > operationalCapacity && !capacityOverrideRoomIds.includes(room._id)) {
        return room.name + ' is over operational capacity by ' + (used - operationalCapacity) + ' and needs an approved override.';
      }

      const positive = row.allocations.filter(a => Number(a.quota) > 0);
      const duplicateClasses = new Set<string>();
      for (const allocation of positive) {
        if (!classById.has(allocation.classId)) return 'A room contains an invalid or inactive class.';
        if (duplicateClasses.has(allocation.classId)) return 'The same class cannot appear twice in one room.';
        duplicateClasses.add(allocation.classId);
      }

      // Grade-mix counts are smart-planning preferences, not hard save blockers.
      // A complete capacity-safe plan may end with a fallback room that has fewer
      // or more grades than preferred.
    }

    for (const cls of activeClasses) {
      const expected = studentCounts[cls._id] || 0;
      const assigned = assignedByClass[cls._id] || 0;
      if (assigned !== expected) {
        const difference = expected - assigned;
        return classNameOf(cls) + (difference > 0
          ? ' still has ' + difference + ' unassigned student(s).'
          : ' is over-assigned by ' + Math.abs(difference) + ' student(s).');
      }
    }

    return '';
  };

  const confirmPlan = async () => {
    const validationError = validatePlan();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    if (!year || !type) {
      setLocalError('Academic Year and Exam Type are required before confirming the Room Plan.');
      return;
    }

    const classMap = new Map<string, RoomPlanItem>();
    planRows.forEach(row => {
      row.allocations
        .filter(allocation => Number(allocation.quota) > 0)
        .forEach(allocation => {
          const existing = classMap.get(allocation.classId) || {
            classId: allocation.classId,
            roomIds: [],
            quotas: [],
          };
          if (!existing.roomIds.includes(row.roomId)) existing.roomIds.push(row.roomId);
          existing.quotas.push({ roomId: row.roomId, count: Math.max(0, Number(allocation.quota) || 0) });
          classMap.set(allocation.classId, existing);
        });
    });

    const roomPlan = Array.from(classMap.values());
    const roomIds = Array.from(new Set(roomPlan.flatMap(item => item.roomIds)));
    const classIds = roomPlan.map(item => item.classId);

    setConfirmingPlan(true);
    setLocalError('');
    try {
      await onGenerate({
        academicYear: year,
        examType: type,
        classIds,
        roomIds,
        roomPlan,
        studentRoomOverrides: [],
        capacityOverrideRoomIds,
      });
    } catch (err: any) {
      setLocalError(
        err?.response?.data?.message
        || err?.message
        || 'Could not confirm and save the Room Plan.'
      );
    } finally {
      setConfirmingPlan(false);
    }
  };

  const classSummary = activeClasses.map(cls => {
    const expected = studentCounts[cls._id] || 0;
    const assigned = assignedByClass[cls._id] || 0;
    return { cls, expected, assigned, remaining: expected - assigned };
  });

  const unresolvedClassSummary = classSummary.filter(item =>
    item.remaining > 0
    || Object.entries(classExtraDrafts).some(([key, value]) =>
      key.startsWith(item.cls._id + '::') && Number(value) > 0
    )
  );
  const hasGeneratedPlan = planRows.some(row => row.allocations.some(allocation => Number(allocation.quota) > 0));
  const classResolutionRows = unresolvedClassSummary.length > 0 ? unresolvedClassSummary : classSummary;
  const roomResolutionRows = sortedRooms.filter(room => roomUsed(room._id) > 0);

  const updateClassExtra = (classId: string, roomId: string, requested: number) => {
    const key = classId + '::' + roomId;
    const previous = Math.max(0, Number(classExtraDrafts[key]) || 0);
    const expected = studentCounts[classId] || 0;
    const currentlyAssigned = assignedByClass[classId] || 0;
    const remaining = Math.max(0, expected - currentlyAssigned);
    const next = Math.max(0, Math.min(Math.trunc(Number(requested) || 0), previous + remaining));
    const delta = next - previous;

    if (!delta) {
      setClassExtraDrafts(prev => ({ ...prev, [key]: next }));
      return;
    }

    const nextRows = sortedRooms.map(room => {
      const row = rowOf(room._id);
      if (room._id !== roomId) return row;

      const existing = row.allocations.find(allocation => allocation.classId === classId);
      if (existing) {
        const nextQuota = Math.max(0, existing.quota + delta);
        return {
          roomId,
          allocations: row.allocations
            .map(allocation => allocation.classId === classId ? { ...allocation, quota: nextQuota } : allocation)
            .filter(allocation => allocation.quota > 0),
        };
      }

      return delta > 0
        ? { roomId, allocations: [...row.allocations, { classId, quota: delta }] }
        : row;
    });

    const room = roomById.get(roomId);
    const projectedLoad = roomUsed(roomId, nextRows);
    if (room) {
      const operational = effectiveCapacity(room);
      if (projectedLoad > operational) {
        setCapacityOverrideRoomIds(prev => prev.includes(roomId) ? prev : [...prev, roomId]);
      } else {
        setCapacityOverrideRoomIds(prev => prev.filter(id => id !== roomId));
      }
    }

    setPlanRows(nextRows);
    setClassExtraDrafts(prev => ({ ...prev, [key]: next }));
    setLocalError('');
    setSettingsMessage('');
  };

  const currentPlanError = Boolean(validatePlan());

  const NumberSetting = ({
    label,
    settingKey,
    min,
    max,
    suffix,
  }:{
    label:string;
    settingKey:keyof RoomPlanSettings;
    min:number;
    max:number;
    suffix?:string;
  }) => {
    const key = String(settingKey);
    const draftValue = numberDrafts[key];
    const displayedValue = draftValue !== undefined
      ? draftValue
      : String(Number(settings[settingKey]));

    const commit = (raw: string) => {
      const parsed = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(parsed)) {
        const next = Math.max(min, Math.min(max, Math.trunc(parsed)));
        updateSettings(settingKey as any, next as any);
      }
      setNumberDrafts(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };

    return (
      <label className="space-y-1.5">
        <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{label}</span>
        <div className="relative">
          <input
            type="number"
            min={min}
            max={max}
            value={displayedValue}
            onChange={e => {
              const raw = e.target.value;
              setNumberDrafts(prev => ({ ...prev, [key]: raw }));
              if (raw.trim() === '') return;
              const parsed = Number(raw);
              if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
                updateSettings(settingKey as any, Math.trunc(parsed) as any);
              }
            }}
            onBlur={e => commit(e.target.value)}
            className={input + (suffix ? ' pr-12' : '')}
          />
          {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-tertiary)]">{suffix}</span>}
        </div>
      </label>
    );
  };

  const ToggleSetting = ({
    label,
    description,
    settingKey,
  }:{
    label:string;
    description:string;
    settingKey:keyof RoomPlanSettings;
  }) => (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-[var(--color-text-tertiary)]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={Boolean(settings[settingKey])}
        onChange={e => updateSettings(settingKey as any, e.target.checked as any)}
        className="mt-1 h-4 w-4"
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <div className={hideExamSelectors ? '' : 'grid gap-4 xl:grid-cols-[1fr_360px]'}>
        {!hideExamSelectors && (
          <div className={card + ' p-4 sm:p-5'}>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-semibold">Academic Year</span>
                <AcademicYearSelect value={year} onChange={setYear} required />
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold">Exam Type</span>
                <select className={input} value={type} onChange={e => setType(e.target.value as '' | 'mid' | 'final')}>
                  <option value="">Select exam type...</option>
                  <option value="mid">Mid Exam</option>
                  <option value="final">Final</option>
                </select>
              </label>
            </div>
          </div>
        )}

        <div className={card + ' border-primary-100 bg-primary-50/40 p-4 sm:p-5 dark:border-primary-900/40 dark:bg-primary-950/10' + (hideExamSelectors ? ' max-w-md' : '')}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-100 p-2.5 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Available Rooms</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <span className="text-3xl font-bold">{sortedRooms.length}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{totalOperationalCapacity} operational seats</span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{totalRoomCapacity} physical seats · {activeStudentTotal} active students.</p>
            </div>
          </div>
        </div>
      </div>

      {localError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          <AlertTriangle size={17} />
          <span>{localError}</span>
        </div>
      )}

      {settingsMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          <CheckCircle2 size={17}/>
          <span>{settingsMessage}</span>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-5" onMouseDown={e=>{if(e.target===e.currentTarget)closeSettingsModal()}}>
          <div role="dialog" aria-modal="true" aria-labelledby="room-plan-settings-title" className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <div className="flex items-center gap-2"><Settings2 size={18}/><h2 id="room-plan-settings-title" className="text-lg font-bold">Room Plan Settings</h2></div>
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Organization-level rules used every time Smart Mixed Plan is generated.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={applyRecommendedSettings} className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-bold text-primary-700 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-300">
                  <Zap size={15}/>Fill Recommended
                </button>
                <button type="button" onClick={()=>{setSettings(DEFAULT_SETTINGS);setNumberDrafts({});setSettingsDirty(true);setSettingsMessage('')}} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold">
                  <RotateCcw size={15}/>Reset Defaults
                </button>
                <button type="button" disabled={settingsSaving} onClick={()=>void saveSettings()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  <Save size={15}/>{settingsSaving?'Saving...':'Save Settings'}
                </button>
                <button type="button" disabled={settingsSaving} onClick={closeSettingsModal} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50" aria-label="Close Room Plan Settings">
                  <X size={17}/>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto">
              <div className="space-y-6 p-4 sm:p-5">
            <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-950/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-primary-800 dark:text-primary-200">Recommended from current data</p>
                  <p className="mt-1 text-sm text-primary-700/90 dark:text-primary-300/90">
                    {activeStudentTotal} active students · {sortedRooms.length} active Rooms · about {recommendedTargetPerRoom} students per Room.
                  </p>
                </div>
                <button type="button" onClick={applyRecommendedSettings} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white">
                  <Zap size={16}/>Use Recommended
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                Recommendation favors balanced use of all Active Rooms, equal class splits, and spreading the same class across different Rooms before reusing one.
              </p>
            </div>

            <div>
              <h3 className="font-bold">Basic Smart Rules</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <NumberSetting label="Max Class Portion" settingKey="maxClassPortion" min={15} max={200} />
                <NumberSetting label="Min Split Portion" settingKey="minSplitPortion" min={1} max={100} />
                <NumberSetting label="Preferred Grades / Room" settingKey="preferredGradesPerRoom" min={2} max={3} />
                <NumberSetting label="Minimum Grades / Room" settingKey="minimumGradesPerRoom" min={1} max={3} />
                <NumberSetting label="Max Same-Grade Share" settingKey="maxSameGradeSharePercent" min={25} max={100} suffix="%" />
                <NumberSetting label="Preferred Grade Distance" settingKey="preferredGradeDistance" min={0} max={12} />
                <NumberSetting label="Target Room Occupancy" settingKey="targetRoomOccupancyPercent" min={50} max={100} suffix="%" />
                <NumberSetting label="Balance Tolerance" settingKey="occupancyBalanceTolerance" min={0} max={50} />
              </div>
            </div>

            <div>
              <h3 className="font-bold">Invigilation & Capacity</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <NumberSetting label="Students / Invigilator" settingKey="studentsPerInvigilator" min={1} max={100} />
                <NumberSetting label="Max Invigilators / Room" settingKey="maxInvigilatorsPerRoom" min={1} max={10} />
                <NumberSetting label="Reserve Seats / Room" settingKey="reserveSeatsPerRoom" min={0} max={50} />
                <NumberSetting label="Minimum Students / Used Room" settingKey="minimumStudentsPerUsedRoom" min={1} max={100} />
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                Operational room capacity = the smaller of physical seats after reserve and Students / Invigilator × Max Invigilators.
              </p>
            </div>

            <div>
              <h3 className="font-bold">Advanced Smart Behaviour</h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <ToggleSetting label="Keep Small Classes Together" description={'Classes up to ' + settings.smallClassThreshold + ' students are not split.'} settingKey="keepSmallClassesTogether" />
                <ToggleSetting label="Equal Class Splits" description="When a class must split, portions stay as equal as possible." settingKey="splitBalanceEqual" />
                <ToggleSetting label="Spread Same Class Across Rooms" description="Give each class portion a different suitable Room before putting another portion of that class in the same Room." settingKey="spreadSameClassAcrossRooms" />
                <ToggleSetting label="Use Minimum Rooms" description="Use the fewest rooms that safely hold all students. Turn this off for stronger all-Room balancing." settingKey="useMinimumRooms" />
                <ToggleSetting label="Avoid Same-Class Sections Together" description="Prefer different grades/sections in the same room." settingKey="avoidSameClassSectionsTogether" />
                <ToggleSetting label="Avoid Repeated Grade Mix" description="Try not to repeat the same grade combination across many rooms." settingKey="avoidRepeatGradeMix" />
                <ToggleSetting label="Auto Repair Invalid Mix" description="Try to repair single-grade rooms automatically before review." settingKey="autoRepairInvalidPlan" />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <NumberSetting label="Small Class Threshold" settingKey="smallClassThreshold" min={1} max={50} />
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">Priority Mode</span>
                  <select className={input} value={settings.priorityMode} onChange={e=>updateSettings('priorityMode',e.target.value as RoomPlanPriorityMode)}>
                    <option value="balanced_security">Recommended · Balanced Exam Security</option>
                    <option value="maximum_mixing">Maximum Mixing</option>
                    <option value="maximum_room_usage">Maximum Room Usage</option>
                  </select>
                </label>
              </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      <div className={card + ' overflow-hidden'}>
        <div className="relative flex items-center justify-between gap-3 border-b p-4 sm:p-5">
          <h2 className="text-lg font-bold">Smart Mixed-Grade Room Plan</h2>

          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen(open => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
              aria-label="Room Plan actions"
              aria-expanded={actionsOpen}
            >
              <MoreVertical size={19} />
            </button>

            {actionsOpen && (
              <div className="absolute right-0 top-12 z-30 w-64 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setSettings(savedSettings);
                    setNumberDrafts({});
                    setSettingsDirty(false);
                    setSettingsMessage('');
                    setSettingsOpen(true);
                    setActionsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-[var(--color-surface-secondary)]"
                >
                  <Settings2 size={16} />
                  {settingsLoading ? 'Loading Settings...' : 'Room Plan Settings'}
                </button>
                <button
                  type="button"
                  onClick={() => void generateSmartPlan()}
                  disabled={settingsLoading || settingsDirty}
                  title={settingsDirty ? 'Save Room Plan Settings first' : ''}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-[var(--color-surface-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Zap size={16} />
                  Generate Smart Mixed Plan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    void confirmPlan();
                  }}
                  disabled={!hasGeneratedPlan || confirmingPlan}
                  title={currentPlanError ? 'Tap to see the remaining validation issue.' : 'Confirm, save, and open Room Allocation.'}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-emerald-950/20"
                >
                  <CheckCircle2 size={16} />
                  {confirmingPlan ? 'Saving Plan...' : 'Confirm Plan'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 border-b bg-[var(--color-surface-secondary)]/50 p-2">
          <button
            type="button"
            disabled={!hasGeneratedPlan}
            onClick={() => setResolutionTab('plan')}
            className={
              'rounded-xl px-2 py-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm ' +
              (resolutionTab === 'plan' && hasGeneratedPlan
                ? 'bg-[var(--color-surface-primary)] text-primary-700 shadow-sm dark:text-primary-300'
                : 'text-[var(--color-text-secondary)]')
            }
          >
            Room Plan
          </button>
          <button
            type="button"
            disabled={!hasGeneratedPlan}
            onClick={() => setResolutionTab('room')}
            className={
              'rounded-xl px-2 py-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm ' +
              (resolutionTab === 'room' && hasGeneratedPlan
                ? 'bg-[var(--color-surface-primary)] text-primary-700 shadow-sm dark:text-primary-300'
                : 'text-[var(--color-text-secondary)]')
            }
          >
            Room Resolution
          </button>
          <button
            type="button"
            disabled={!hasGeneratedPlan}
            onClick={() => setResolutionTab('class')}
            className={
              'rounded-xl px-2 py-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm ' +
              (resolutionTab === 'class' && hasGeneratedPlan
                ? 'bg-[var(--color-surface-primary)] text-primary-700 shadow-sm dark:text-primary-300'
                : 'text-[var(--color-text-secondary)]')
            }
          >
            Class Resolution
          </button>
        </div>

        {!hasGeneratedPlan ? (
          <div className="p-10 text-center sm:p-12">
            <Zap className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" />
            <p className="mt-3 font-bold">Generate the Smart Mixed Plan first</p>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
              Use the three-dot menu above, then review the result by Class or by Room.
            </p>
          </div>
        ) : resolutionTab === 'plan' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-[var(--color-surface-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left">Room</th>
                  <th className="px-4 py-3 text-left">Capacity</th>
                  <th className="px-4 py-3 text-left">Assigned Seats</th>
                  <th className="px-4 py-3 text-left">Seat Balance</th>
                </tr>
              </thead>
              <tbody>
                {sortedRooms.map(room => {
                  const capacity = Math.max(0, Number(room.capacity) || 0);
                  const assigned = roomUsed(room._id);
                  const balance = capacity - assigned;
                  const overridden = capacityOverrideRoomIds.includes(room._id);

                  return (
                    <tr key={room._id} className="border-t">
                      <td className="px-4 py-4">
                        <p className="font-bold">{room.name}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{room.building || 'Main'}</p>
                      </td>
                      <td className="px-4 py-4 text-lg font-bold">{capacity}</td>
                      <td className="px-4 py-4 text-lg font-bold">{assigned}</td>
                      <td className="px-4 py-4">
                        {balance > 0 ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                            {balance} Free
                          </span>
                        ) : balance === 0 ? (
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            Full
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">
                            +{Math.abs(balance)} Extra{overridden ? ' · Approved' : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : resolutionTab === 'class' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[var(--color-surface-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left">Class</th>
                  <th className="px-4 py-3 text-left">Assigned / Total</th>
                  <th className="px-4 py-3 text-left">Room Allocation</th>
                  <th className="px-4 py-3 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {classResolutionRows.map(item => (
                  <tr key={item.cls._id} className="border-t align-top">
                    <td className="px-4 py-4">
                      <p className="font-bold">{classNameOf(item.cls)}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{gradeLabelOf(item.cls)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-lg font-bold">{item.assigned}/{item.expected}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="min-w-[620px] overflow-hidden rounded-xl border">
                        <div className="grid grid-cols-[1.1fr_120px_160px_120px] bg-[var(--color-surface-secondary)] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                          <span>Room</span>
                          <span>Assigned</span>
                          <span>Free Seats</span>
                          <span>Add Extra</span>
                        </div>
                        {sortedRooms
                          .filter(room => {
                            if (expandedClassRooms[item.cls._id]) return true;
                            const row = rowOf(room._id);
                            const classAssigned = row.allocations.find(allocation => allocation.classId === item.cls._id)?.quota || 0;
                            const key = item.cls._id + '::' + room._id;
                            const extra = Math.max(0, Number(classExtraDrafts[key]) || 0);
                            return classAssigned > 0 || extra > 0;
                          })
                          .map(room => {
                            const row = rowOf(room._id);
                            const classAssigned = row.allocations.find(allocation => allocation.classId === item.cls._id)?.quota || 0;
                            const totalLoad = roomUsed(room._id);
                            const capacity = Math.max(0, Number(room.capacity) || 0);
                            const free = capacity - totalLoad;
                            const key = item.cls._id + '::' + room._id;
                            const extra = Math.max(0, Number(classExtraDrafts[key]) || 0);
                            const overridden = capacityOverrideRoomIds.includes(room._id);

                            return (
                              <div key={key} className="grid grid-cols-[1.1fr_120px_160px_120px] items-center gap-2 border-t px-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{room.name}</p>
                                  {overridden && (
                                    <p className="mt-0.5 text-[10px] font-bold text-amber-600">
                                      Admin Override{totalLoad > capacity ? ' +' + (totalLoad - capacity) : ''}
                                    </p>
                                  )}
                                </div>
                                <span className="font-bold">{classAssigned}</span>
                                <span className={'font-bold ' + (free < 0 ? 'text-red-600' : free === 0 ? 'text-amber-600' : 'text-emerald-600')}>
                                  {free} ({totalLoad}/{capacity})
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  max={extra + Math.max(0, item.remaining)}
                                  value={extra}
                                  onChange={event => updateClassExtra(item.cls._id, room._id, Number(event.target.value))}
                                  className="w-full rounded-lg border bg-[var(--color-surface-primary)] px-2.5 py-2 text-center font-bold"
                                  aria-label={'Add extra ' + classNameOf(item.cls) + ' students to ' + room.name}
                                />
                              </div>
                            );
                          })}
                        {(() => {
                          const assignedRoomCount = sortedRooms.filter(room => {
                            const row = rowOf(room._id);
                            const classAssigned = row.allocations.find(allocation => allocation.classId === item.cls._id)?.quota || 0;
                            const key = item.cls._id + '::' + room._id;
                            const extra = Math.max(0, Number(classExtraDrafts[key]) || 0);
                            return classAssigned > 0 || extra > 0;
                          }).length;
                          const hiddenRoomCount = Math.max(0, sortedRooms.length - assignedRoomCount);
                          if (hiddenRoomCount === 0) return null;

                          return (
                            <div className="border-t px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => setExpandedClassRooms(prev => ({
                                  ...prev,
                                  [item.cls._id]: !prev[item.cls._id],
                                }))}
                                className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs font-bold text-primary-700 hover:bg-[var(--color-surface-secondary)] dark:text-primary-300"
                              >
                                {expandedClassRooms[item.cls._id]
                                  ? 'Show Assigned Rooms Only'
                                  : 'Show More Rooms (' + hiddenRoomCount + ')'}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={'inline-flex rounded-full px-3 py-1 text-sm font-bold ' + (item.remaining === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800')}>
                        {item.remaining === 0 ? 'Resolved' : item.remaining}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[var(--color-surface-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left">Room</th>
                  <th className="px-4 py-3 text-left">Assigned / Total</th>
                  <th className="px-4 py-3 text-left">Class Allocation</th>
                  <th className="px-4 py-3 text-left">Free Seats</th>
                </tr>
              </thead>
              <tbody>
                {roomResolutionRows.map(room => {
                  const row = rowOf(room._id);
                  const allocations = row.allocations.filter(allocation => Number(allocation.quota) > 0);
                  const used = roomUsed(room._id);
                  const capacity = Math.max(0, Number(room.capacity) || 0);
                  const free = capacity - used;
                  const overridden = capacityOverrideRoomIds.includes(room._id);

                  return (
                    <tr key={room._id} className="border-t align-top">
                      <td className="px-4 py-4">
                        <p className="font-bold">{room.name}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{room.building || 'Main'}</p>
                        {overridden && (
                          <p className="mt-1 text-[10px] font-bold text-amber-600">
                            Admin Override{used > capacity ? ' +' + (used - capacity) : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-lg font-bold">
                        {used}/{capacity}
                      </td>
                      <td className="px-4 py-4">
                        <div className="min-w-[620px] overflow-hidden rounded-xl border">
                          <div className="grid grid-cols-[1.2fr_130px_130px_120px] bg-[var(--color-surface-secondary)] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                            <span>Class</span>
                            <span>Assigned / Total</span>
                            <span>Unassigned</span>
                            <span>Add Extra</span>
                          </div>
                          {allocations.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-[var(--color-text-tertiary)]">
                              No class allocation in this Room.
                            </div>
                          ) : allocations.map(allocation => {
                            const cls = classById.get(allocation.classId);
                            if (!cls) return null;
                            const total = studentCounts[allocation.classId] || 0;
                            const globallyAssigned = assignedByClass[allocation.classId] || 0;
                            const unassigned = Math.max(0, total - globallyAssigned);
                            const key = allocation.classId + '::' + room._id;
                            const extra = Math.max(0, Number(classExtraDrafts[key]) || 0);

                            return (
                              <div key={key} className="grid grid-cols-[1.2fr_130px_130px_120px] items-center gap-2 border-t px-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{classNameOf(cls)}</p>
                                  <p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">{gradeLabelOf(cls)}</p>
                                </div>
                                <span className="font-bold">{allocation.quota}/{total}</span>
                                <span className={'font-bold ' + (unassigned > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                                  {unassigned}
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  max={extra + unassigned}
                                  value={extra}
                                  onChange={event => updateClassExtra(allocation.classId, room._id, Number(event.target.value))}
                                  className="w-full rounded-lg border bg-[var(--color-surface-primary)] px-2.5 py-2 text-center font-bold"
                                  aria-label={'Add extra ' + classNameOf(cls) + ' students to ' + room.name}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className={'px-4 py-4 text-lg font-bold ' + (free < 0 ? 'text-red-600' : free === 0 ? 'text-amber-600' : 'text-emerald-600')}>
                        {free} ({used}/{capacity})
                      </td>
                    </tr>
                  );
                })}
                {roomResolutionRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">
                      No Room allocations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className={card + ' p-4 sm:p-5'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">Grade / Class Check</h3>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Every active student must be included exactly once in the plan.</p>
            </div>
            <Users size={18} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {classSummary.map(item => (
              <div key={item.cls._id} className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{classNameOf(item.cls)}</p>
                  <span className={'text-xs font-bold ' + (item.remaining === 0 ? 'text-emerald-600' : item.remaining > 0 ? 'text-amber-600' : 'text-red-600')}>
                    {item.assigned}/{item.expected}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  {item.remaining === 0 ? 'Complete' : item.remaining > 0 ? item.remaining + ' remaining' : Math.abs(item.remaining) + ' over-assigned'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className={card + ' p-4 sm:p-5'}>
          <h3 className="font-bold">Plan Summary</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Active Students</span><b>{activeStudentTotal}</b></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Assigned in Plan</span><b>{assignedTotal}</b></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Rooms Used</span><b>{usedRoomCount}</b></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Operational Capacity</span><b>{usedOperationalCapacity}</b></div>
            <div className="flex justify-between gap-3 border-t pt-3">
              <span className="text-[var(--color-text-tertiary)]">Unassigned</span>
              <b className={activeStudentTotal - assignedTotal === 0 ? 'text-emerald-600' : 'text-amber-600'}>{activeStudentTotal - assignedTotal}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-primary-200 bg-primary-50/50 p-3 text-xs text-primary-800 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-200">
        <ShieldCheck size={16} className="mt-0.5 shrink-0"/>
        <span>
          Smart planning now uses class split limits, invigilator capacity, reserve seats, room balance, grade distance and 2–3 grade mixing before presenting the editable Review.
        </span>
      </div>

      {activeClasses.some(cls => departmentNameOf(cls)) && (
        <p className="text-xs text-[var(--color-text-tertiary)]">Department labels remain visible in Class Management; room mixing here is based on Grade number, not Primary/Secondary department.</p>
      )}
    </div>
  );
}

export default PlanRoomsPanel;
