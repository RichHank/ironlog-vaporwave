export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface WorkoutSet {
  id: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  type: SetType;
  note?: string;
  completedAt: number;
}

export interface ExerciseLog {
  id: string;
  exerciseKey: string;
  name: string;
  sets: WorkoutSet[];
  notes?: string;
  supersetGroupId?: string;
}

export interface WorkoutSession {
  id: string;
  name?: string;
  startedAt: number;
  completedAt: number;
  duration?: number;
  exercises: ExerciseLog[];
  notes?: string;
  templateId?: string;
  stravaActivityId?: number;
}

export interface PlannedSet {
  id: string;
  weight: number | null;
  reps: number | null;
  type: SetType;
  restSeconds?: number;
}

export interface RoutineExercise {
  id: string;
  exerciseKey: string;
  name: string;
  notes?: string;
  plannedSets: PlannedSet[];
}

export interface Routine {
  id: string;
  name: string;
  notes?: string;
  exercises: RoutineExercise[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

export interface PersonalRecord {
  id: string;
  exerciseKey: string;
  exerciseName: string;
  type: 'max_weight' | 'max_reps' | 'max_volume' | 'est_1rm';
  value: number;
  unit: string;
  achievedAt: number;
  sessionId: string;
}

export interface BodyMeasurement {
  id: string;
  date: number;
  weight?: number;
  note?: string;
}

export type WeightUnit = 'lb' | 'kg';

export interface AppSettings {
  weightUnit: WeightUnit;
  restTimerDuration: number;
  soundEffectsVolume: number;   // 0-100, default 75
  soundEffectsMuted: boolean;
  musicVolume: number;          // 0-100, default 30
  fontScale: number;            // percentage: 87.5 | 100 | 112.5 | 125, default 100
  gymDungeonEnabled: boolean;    // hidden Swolecrypt roguelite
}

export type DungeonRoomType = 'fight' | 'loot' | 'shrine' | 'trap' | 'merchant' | 'rest' | 'glitch' | 'boss';

export interface DungeonEnemy {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  coins: number;
  sprite: string;
  palette: string;
  taunt: string;
}

export interface DungeonRelic {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'charm' | 'curse' | 'snack' | 'glitch';
  description: string;
  attack?: number;
  defense?: number;
  maxHp?: number;
  crit?: number;
  coins?: number;
  heal?: number;
  sprite: string;
}

export interface DungeonPlayer {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  level: number;
  xp: number;
  coins: number;
  crit: number;
}

export interface DungeonRun {
  active: boolean;
  room: number;
  roomType: DungeonRoomType;
  enemyId?: string;
  bossId?: string;
  offeredRelicIds: string[];
  log: string[];
}

export interface DungeonWorkoutBonus {
  coins: number;
  xp: number;
  buffAttack: number;
  label: string;
  skillXp?: Partial<Record<SkillName, number>>;
  lootRolls?: number;
}

export type SkillName = 'strength' | 'endurance' | 'dexterity' | 'nutrition' | 'knowledge' | 'luck';

export interface Skill {
  name: SkillName;
  level: number;
  xp: number;
  displayName: string;
  description: string;
  icon: string;
}

export interface GameSettings {
  idleModeEnabled: boolean;
  idleModeIntensity: 'relaxed' | 'balanced' | 'intense';
  autoClaimWorkoutBonus: boolean;
  showDungeonDuringRest: boolean;
  idleFocus: SkillName;
}

export type EquipmentSlot = 'head' | 'chest' | 'legs' | 'weapon' | 'accessory1' | 'accessory2';

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: 'common' | 'rare' | 'epic' | 'mythic';
  requiredLevel: number;
  requiredSkills?: Partial<Record<SkillName, number>>;
  attack?: number;
  defense?: number;
  maxHp?: number;
  crit?: number;
  luck?: number;
  sprite: string;
  description: string;
  setId?: string;
}

export interface GameResource {
  id: string;
  name: string;
  amount: number;
  icon: string;
  description: string;
}

export interface Building {
  id: string;
  name: string;
  level: number;
  description: string;
  effect: string;
  cost: { coins: number; skills?: Partial<Record<SkillName, number>> };
}

export interface TownState {
  buildings: Building[];
  resources: GameResource[];
  upgrades: string[];
}

export interface PrestigeState {
  totalPrestiges: number;
  swolePoints: number;
  lifetimeSwolePoints: number;
  perks: Record<string, number>;
}

export interface IdleProgress {
  startTime: number;
  lastTickAt: number;
  roomsCleared: number;
  roomCarry?: number;
  coinsEarned: number;
  xpEarned: Partial<Record<SkillName, number>>;
  roomsPerMinute: number;
  riskLevel: number;
  log: string[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: number;
  reward?: { coins?: number; xp?: Partial<Record<SkillName, number>> };
}

export interface DungeonState {
  player: DungeonPlayer;
  run: DungeonRun;
  skills: Record<SkillName, Skill>;
  gameSettings: GameSettings;
  equipment: Partial<Record<EquipmentSlot, string>>;
  equipmentInventoryIds: string[];
  equipmentLevels: Record<string, number>;
  town: TownState;
  achievements: Achievement[];
  prestige: PrestigeState;
  idleProgress?: IdleProgress | null;
  relicIds: string[];
  discoveredMonsterIds: string[];
  discoveredRelicIds: string[];
  unlockedTitles: string[];
  recentDoctrineIds?: string[];
  pendingWorkoutBonus?: DungeonWorkoutBonus;
  totalRuns: number;
  bossesDefeated: number;
  deepestRoom: number;
  createdAt: number;
  updatedAt: number;
}
