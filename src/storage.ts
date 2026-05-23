import {
  WorkoutSession, ExerciseLog, WorkoutSet, Routine,
  PersonalRecord, BodyMeasurement, AppSettings, DungeonState, DungeonWorkoutBonus, SkillName,
} from './types';
import { est1RM } from './utils';
import { idbSet, idbRemove, idbGetJSON } from './idb-storage';
import { addSkillXp, checkAchievements, defaultAchievements, defaultGameSettings, defaultPrestige, defaultResources, defaultSkills, defaultTownBuildings, workoutSkillAwards } from './game/swoleGame';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ── Keys ──
const SESSION_KEY = 'il-current';
const HISTORY_KEY = 'il-history';
const ROUTINES_KEY = 'il-routines';
const PRS_KEY = 'il-prs';
const MEASUREMENTS_KEY = 'il-measurements';
const SETTINGS_KEY = 'il-settings';
const DUNGEON_KEY = 'il-dungeon';

// ── Generic helpers ──
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}

// Every writer mirrors to both stores: localStorage for synchronous reads on
// the next render, IDB for persistence across iOS's 7-day eviction. The IDB
// write is fire-and-forget — if it fails the localStorage copy still keeps
// the in-session experience consistent.
function writeJSON(key: string, value: unknown): void {
  const serialised = JSON.stringify(value);
  try { localStorage.setItem(key, serialised); } catch { /* quota */ }
  void idbSet(key, serialised).catch(err => console.error('[storage] IDB write failed:', key, err));
}

function removeKey(key: string): void {
  try { localStorage.removeItem(key); } catch {}
  void idbRemove(key).catch(err => console.error('[storage] IDB remove failed:', key, err));
}

// ── Session ──
export function loadSession(): WorkoutSession | null {
  return readJSON<WorkoutSession | null>(SESSION_KEY, null);
}

export function saveSession(session: WorkoutSession): void {
  writeJSON(SESSION_KEY, session);
}

export function clearSession(): void {
  removeKey(SESSION_KEY);
}

// ── History ──
export function loadHistory(): WorkoutSession[] {
  return readJSON<WorkoutSession[]>(HISTORY_KEY, []);
}

export function saveHistory(sessions: WorkoutSession[]): void {
  writeJSON(HISTORY_KEY, sessions);
}

export function addWorkout(session: WorkoutSession): WorkoutSession[] {
  const history = loadHistory();
  history.unshift(session);
  saveHistory(history);
  return history;
}

export function deleteWorkout(sessionId: string): WorkoutSession[] {
  const history = loadHistory().filter(s => s.id !== sessionId);
  saveHistory(history);
  return history;
}

export function updateHistoryWorkout(session: WorkoutSession): WorkoutSession[] {
  const history = loadHistory().map(s => s.id === session.id ? session : s);
  saveHistory(history);
  return history;
}

// ── Routines ──
export function loadRoutines(): Routine[] {
  return readJSON<Routine[]>(ROUTINES_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveRoutines(routines: Routine[]): void {
  writeJSON(ROUTINES_KEY, routines);
}

export function upsertRoutine(routine: Routine): Routine[] {
  const routines = loadRoutines();
  const idx = routines.findIndex(r => r.id === routine.id);
  if (idx >= 0) routines[idx] = routine;
  else routines.unshift(routine);
  saveRoutines(routines);
  return routines;
}

export function deleteRoutine(id: string): Routine[] {
  const routines = loadRoutines().filter(r => r.id !== id);
  saveRoutines(routines);
  return routines;
}

// ── Personal Records ──
export function loadPRs(): PersonalRecord[] {
  return readJSON<PersonalRecord[]>(PRS_KEY, []);
}

export function savePRs(prs: PersonalRecord[]): void {
  writeJSON(PRS_KEY, prs);
}

// PR ids are deterministic — exerciseKey + type — so identity stays stable
// across recalcs. Only `value` / `achievedAt` / `sessionId` change when a
// record is broken.
function prId(exerciseKey: string, type: PersonalRecord['type']): string {
  return `${exerciseKey}::${type}`;
}

type PRCandidate = {
  exerciseKey: string;
  exerciseName: string;
  weight: number;
  reps: number;
  completedAt: number;
  sessionId: string;
};

function collectCandidates(session: WorkoutSession): PRCandidate[] {
  const out: PRCandidate[] = [];
  for (const ex of session.exercises) {
    for (const set of ex.sets) {
      if (set.weight && set.weight > 0 && set.reps && set.reps > 0) {
        out.push({
          exerciseKey: ex.exerciseKey,
          exerciseName: ex.name,
          weight: set.weight,
          reps: set.reps,
          completedAt: set.completedAt,
          sessionId: session.id,
        });
      }
    }
  }
  return out;
}

function bestFromCandidates(candidates: PRCandidate[], unit: string): Map<string, PersonalRecord> {
  const best = new Map<string, PersonalRecord>();
  const consider = (rec: PersonalRecord) => {
    const existing = best.get(rec.id);
    if (!existing || rec.value > existing.value) best.set(rec.id, rec);
  };
  for (const c of candidates) {
    consider({
      id: prId(c.exerciseKey, 'max_weight'),
      exerciseKey: c.exerciseKey, exerciseName: c.exerciseName,
      type: 'max_weight', value: c.weight, unit,
      achievedAt: c.completedAt, sessionId: c.sessionId,
    });
    consider({
      id: prId(c.exerciseKey, 'max_reps'),
      exerciseKey: c.exerciseKey, exerciseName: c.exerciseName,
      type: 'max_reps', value: c.reps, unit: `at ${c.weight}${unit}`,
      achievedAt: c.completedAt, sessionId: c.sessionId,
    });
    consider({
      id: prId(c.exerciseKey, 'max_volume'),
      exerciseKey: c.exerciseKey, exerciseName: c.exerciseName,
      type: 'max_volume', value: c.weight * c.reps, unit,
      achievedAt: c.completedAt, sessionId: c.sessionId,
    });
    consider({
      id: prId(c.exerciseKey, 'est_1rm'),
      exerciseKey: c.exerciseKey, exerciseName: c.exerciseName,
      type: 'est_1rm', value: est1RM(c.weight, c.reps), unit,
      achievedAt: c.completedAt, sessionId: c.sessionId,
    });
  }
  return best;
}

// Full recalc — used on delete or in-place edit, where a previous PR may have
// disappeared and we have to re-walk every session to find the next-best.
export function recalcPRs(sessions: WorkoutSession[]): PersonalRecord[] {
  const unit = loadSettings().weightUnit;
  const all = sessions.flatMap(collectCandidates);
  const best = Array.from(bestFromCandidates(all, unit).values());
  savePRs(best);
  return best;
}

// Incremental — the common path after `addWorkout`. Compares only this
// session's candidates against the persisted bests and replaces them where
// beaten. O(sets-in-session) instead of O(total-sets-ever).
export function updatePRsAfterAdd(session: WorkoutSession): PersonalRecord[] {
  const unit = loadSettings().weightUnit;
  const current = loadPRs();
  const byId = new Map(current.map(p => [p.id, p]));
  const fromSession = bestFromCandidates(collectCandidates(session), unit);
  for (const [id, fresh] of fromSession) {
    const existing = byId.get(id);
    if (!existing || fresh.value > existing.value) byId.set(id, fresh);
  }
  const next = Array.from(byId.values());
  savePRs(next);
  return next;
}

export function getPRsForExercise(exerciseKey: string): PersonalRecord[] {
  return loadPRs().filter(p => p.exerciseKey === exerciseKey);
}

// ── Body Measurements ──
export function loadMeasurements(): BodyMeasurement[] {
  return readJSON<BodyMeasurement[]>(MEASUREMENTS_KEY, []).sort((a, b) => b.date - a.date);
}

export function saveMeasurements(measurements: BodyMeasurement[]): void {
  writeJSON(MEASUREMENTS_KEY, measurements);
}

export function addMeasurement(m: BodyMeasurement): BodyMeasurement[] {
  const all = loadMeasurements();
  all.unshift(m);
  saveMeasurements(all);
  return all;
}

// ── Settings ──
export function loadSettings(): AppSettings {
  return {
    weightUnit: 'lb',
    restTimerDuration: 90,
    soundEffectsVolume: 75,
    soundEffectsMuted: false,
    musicVolume: 30,
    fontScale: 100,
    gymDungeonEnabled: false,
    ...readJSON<Partial<AppSettings>>(SETTINGS_KEY, {}),
  };
}

export function saveSettings(s: AppSettings): void {
  writeJSON(SETTINGS_KEY, s);
}

// ── Swolecrypt Dungeon ──
export function defaultDungeonState(): DungeonState {
  const now = Date.now();
  return {
      player: { hp: 42, maxHp: 42, attack: 7, defense: 2, level: 1, xp: 0, coins: 15, crit: 6 },
      skills: defaultSkills(),
      gameSettings: defaultGameSettings(),
      equipment: {},
      equipmentInventoryIds: [],
      equipmentLevels: {},
      town: { buildings: defaultTownBuildings(), resources: defaultResources(), upgrades: [] },
      achievements: defaultAchievements(),
      prestige: defaultPrestige(),
      idleProgress: null,
      run: {
      active: false,
      room: 0,
      roomType: 'fight',
      offeredRelicIds: [],
      log: ['SWOLECRYPT BOOT SEQUENCE: HELL YEAH'],
    },
    relicIds: [],
    discoveredMonsterIds: [],
    discoveredRelicIds: [],
    unlockedTitles: ['Squire of Suspicious Pump'],
    recentDoctrineIds: [],
    totalRuns: 0,
    bossesDefeated: 0,
    deepestRoom: 0,
    createdAt: now,
    updatedAt: now,
  };
}


function mergeAchievements(saved: DungeonState['achievements'] | undefined, fallback: DungeonState['achievements']): DungeonState['achievements'] {
  if (!saved) return fallback;
  const byId = new Map(saved.map(a => [a.id, a]));
  return fallback.map(a => ({ ...a, ...byId.get(a.id), reward: a.reward }));
}

export function loadDungeonState(): DungeonState {
  const fallback = defaultDungeonState();
  const saved = readJSON<Partial<DungeonState> | null>(DUNGEON_KEY, null);
  if (!saved) return fallback;
    return {
      ...fallback,
      ...saved,
      player: { ...fallback.player, ...saved.player },
      skills: { ...fallback.skills, ...saved.skills },
      gameSettings: { ...fallback.gameSettings, ...saved.gameSettings },
      equipment: { ...fallback.equipment, ...saved.equipment },
      equipmentInventoryIds: saved.equipmentInventoryIds ?? [],
      equipmentLevels: { ...fallback.equipmentLevels, ...saved.equipmentLevels },
      town: {
        ...fallback.town,
        ...saved.town,
        buildings: saved.town?.buildings ?? fallback.town.buildings,
        resources: saved.town?.resources ?? fallback.town.resources,
        upgrades: saved.town?.upgrades ?? [],
      },
      achievements: mergeAchievements(saved.achievements, fallback.achievements),
      prestige: { ...fallback.prestige, ...saved.prestige, perks: { ...fallback.prestige.perks, ...saved.prestige?.perks } },
      idleProgress: saved.idleProgress ?? null,
      run: { ...fallback.run, ...saved.run },
    relicIds: saved.relicIds ?? [],
    discoveredMonsterIds: saved.discoveredMonsterIds ?? [],
    discoveredRelicIds: saved.discoveredRelicIds ?? [],
    unlockedTitles: saved.unlockedTitles ?? fallback.unlockedTitles,
    recentDoctrineIds: saved.recentDoctrineIds ?? [],
    updatedAt: saved.updatedAt ?? Date.now(),
  };
}

export function saveDungeonState(state: DungeonState): void {
  writeJSON(DUNGEON_KEY, { ...state, updatedAt: Date.now() });
}

export function resetDungeonState(): DungeonState {
  const fresh = defaultDungeonState();
  saveDungeonState(fresh);
  return fresh;
}

export function grantDungeonWorkoutBonus(session: WorkoutSession): DungeonWorkoutBonus | null {
  if (!loadSettings().gymDungeonEnabled) return null;
  const sets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const volume = session.exercises.reduce((sum, ex) =>
    sum + ex.sets.reduce((inner, set) => inner + (set.weight ?? 0) * (set.reps ?? 0), 0), 0
  );
  const bonus: DungeonWorkoutBonus = {
    coins: Math.max(15, Math.min(160, sets * 5 + Math.floor(volume / 650))),
    xp: Math.max(8, Math.min(75, sets * 4)),
    buffAttack: sets >= 8 ? 2 : 1,
    skillXp: workoutSkillAwards(session),
    lootRolls: Math.floor(sets / 5) + (volume > 5000 ? 2 : 0),
    label: `${sets} SET OFFERING`,
  };
  const state = loadDungeonState();
  const skillResult = state.gameSettings.autoClaimWorkoutBonus ? addSkillXp(state.skills, bonus.skillXp ?? {}) : null;
  if (skillResult) {
    state.skills = skillResult.skills;
    state.player.coins += bonus.coins;
    state.player.attack += bonus.buffAttack;
    state.player.xp += bonus.xp;
  }
  const mergedSkillXp = (a: DungeonWorkoutBonus['skillXp'] = {}, b: DungeonWorkoutBonus['skillXp'] = {}) => {
    const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])) as SkillName[];
    return Object.fromEntries(keys.map(k => [k, (a[k] ?? 0) + (b[k] ?? 0)])) as Partial<Record<SkillName, number>>;
  };
  state.pendingWorkoutBonus = state.gameSettings.autoClaimWorkoutBonus ? undefined : state.pendingWorkoutBonus
    ? {
          coins: state.pendingWorkoutBonus.coins + bonus.coins,
          xp: state.pendingWorkoutBonus.xp + bonus.xp,
          buffAttack: Math.max(state.pendingWorkoutBonus.buffAttack, bonus.buffAttack),
          skillXp: mergedSkillXp(state.pendingWorkoutBonus.skillXp, bonus.skillXp),
          lootRolls: (state.pendingWorkoutBonus.lootRolls ?? 0) + (bonus.lootRolls ?? 0),
          label: 'STACKED PUMP OFFERING',
        }
      : (state.gameSettings.autoClaimWorkoutBonus ? undefined : bonus);
  state.run.log = [`WORKOUT BONUS ${state.gameSettings.autoClaimWorkoutBonus ? 'AUTO-CLAIMED' : 'READY'}: +${bonus.coins} COINS / +${bonus.xp} XP`, ...state.run.log].slice(0, 8);
  saveDungeonState(checkAchievements(state));
  return bonus;
}

// ── Export / Import ──
export function exportAllJSON(): string {
  return JSON.stringify({
    history: loadHistory(),
    routines: loadRoutines(),
    prs: loadPRs(),
    measurements: loadMeasurements(),
    dungeon: loadDungeonState(),
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Defang spreadsheet formulas before quote-wrapping; previous early return
  // skipped quote-wrapping for cells that started with =/+/-/@ AND contained
  // commas or newlines, producing invalid CSV.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportHistoryCSV(): string {
  const sessions = loadHistory();
  const rows = [['Date', 'Exercise', 'Set#', 'Weight', 'Reps', 'RPE', 'Type', 'Note', 'Session']];

  for (const session of sessions) {
    const date = new Date(session.startedAt).toLocaleDateString();
    for (const ex of session.exercises) {
      for (let i = 0; i < ex.sets.length; i++) {
        const set = ex.sets[i];
        rows.push([
          date, ex.name, String(i + 1),
          String(set.weight ?? 'BW'), String(set.reps ?? ''), String(set.rpe ?? ''),
          set.type, set.note ?? ex.notes ?? '',
          session.name ?? session.id,
        ]);
      }
    }
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

export function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function clearAllData(): void {
  [SESSION_KEY, HISTORY_KEY, ROUTINES_KEY, PRS_KEY, MEASUREMENTS_KEY, DUNGEON_KEY].forEach(removeKey);
}

// One-shot hydration from IDB. Returns whatever IDB has for each app key so
// callers can adopt it as React state on mount — necessary because cold-start
// reads from localStorage will be empty after iOS evicts it, even though IDB
// still has the data.
export async function hydrateFromIDB(): Promise<{
  session: WorkoutSession | null;
  history: WorkoutSession[];
  routines: Routine[];
  prs: PersonalRecord[];
  measurements: BodyMeasurement[];
  settings: AppSettings;
  dungeon: DungeonState;
}> {
  const [session, history, routines, prs, measurements, settings, dungeon] = await Promise.all([
    idbGetJSON<WorkoutSession | null>(SESSION_KEY, null),
    idbGetJSON<WorkoutSession[]>(HISTORY_KEY, []),
    idbGetJSON<Routine[]>(ROUTINES_KEY, []),
    idbGetJSON<PersonalRecord[]>(PRS_KEY, []),
    idbGetJSON<BodyMeasurement[]>(MEASUREMENTS_KEY, []),
    idbGetJSON<AppSettings>(SETTINGS_KEY, { weightUnit: 'lb', restTimerDuration: 90, soundEffectsVolume: 75, soundEffectsMuted: false, musicVolume: 30, fontScale: 100, gymDungeonEnabled: false }),
    idbGetJSON<DungeonState>(DUNGEON_KEY, defaultDungeonState()),
  ]);
  return { session, history, routines, prs, measurements, settings, dungeon };
}
