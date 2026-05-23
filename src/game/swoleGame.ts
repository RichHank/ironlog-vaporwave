import { Achievement, Building, DungeonState, GameResource, GameSettings, IdleProgress, Skill, SkillName, WorkoutSession } from '../types';

export const SKILL_ORDER: SkillName[] = ['strength', 'endurance', 'dexterity', 'nutrition', 'knowledge', 'luck'];

const SKILL_META: Record<SkillName, Omit<Skill, 'level' | 'xp' | 'name'>> = {
  strength: { displayName: 'Strength', icon: '💪', description: '+damage, heavy workout coin scaling, crit force.' },
  endurance: { displayName: 'Endurance', icon: '🫀', description: '+max HP, lower idle death risk, longer delves.' },
  dexterity: { displayName: 'Dexterity', icon: '⚡', description: '+crit, trap dodge, faster idle clears.' },
  nutrition: { displayName: 'Nutrition', icon: '🥤', description: '+healing, recovery, shrine/rest value.' },
  knowledge: { displayName: 'Knowledge', icon: '🧠', description: '+doctrine damage, better scouting, smarter loot.' },
  luck: { displayName: 'Luck', icon: '🍀', description: '+coins, rare drops, extra weirdness.' },
};

export function xpForLevel(level: number): number {
  return Math.max(75, level * 75);
}

export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}

export function defaultSkills(): Record<SkillName, Skill> {
  return Object.fromEntries(SKILL_ORDER.map(name => [name, { name, level: 1, xp: 0, ...SKILL_META[name] }])) as Record<SkillName, Skill>;
}

export function addSkillXp(skills: Record<SkillName, Skill>, awards: Partial<Record<SkillName, number>>): { skills: Record<SkillName, Skill>; leveled: SkillName[] } {
  const next = { ...skills };
  const leveled: SkillName[] = [];
  for (const name of SKILL_ORDER) {
    const amount = Math.floor(awards[name] ?? 0);
    if (amount <= 0) continue;
    let skill = { ...(next[name] ?? { name, level: 1, xp: 0, ...SKILL_META[name] }) };
    skill.xp += amount;
    while (skill.level < 99 && skill.xp >= xpForLevel(skill.level)) {
      skill.xp -= xpForLevel(skill.level);
      skill.level += 1;
      leveled.push(name);
    }
    next[name] = skill;
  }
  return { skills: next, leveled };
}

export function skillTotal(skills: Record<SkillName, Skill>): number {
  return SKILL_ORDER.reduce((sum, s) => sum + (skills[s]?.level ?? 1), 0);
}

export function combatBonuses(skills: Record<SkillName, Skill>) {
  const strength = skills.strength?.level ?? 1;
  const endurance = skills.endurance?.level ?? 1;
  const dexterity = skills.dexterity?.level ?? 1;
  const nutrition = skills.nutrition?.level ?? 1;
  const knowledge = skills.knowledge?.level ?? 1;
  const luck = skills.luck?.level ?? 1;
  return {
    attack: Math.floor(strength / 4),
    maxHp: Math.floor(endurance * 1.45),
    defense: Math.floor(endurance / 10),
    crit: Math.floor(dexterity / 3) + Math.floor(luck / 8),
    healBonus: 1 + nutrition / 140,
    doctrineBoost: 1 + knowledge / 90,
    coinBoost: 1 + luck / 120,
    idleSpeed: 1 + (dexterity + strength) / 180,
    idleRiskReduction: endurance / 180 + dexterity / 260,
  };
}

export function defaultGameSettings(): GameSettings {
  return { idleModeEnabled: true, idleModeIntensity: 'balanced', autoClaimWorkoutBonus: false, showDungeonDuringRest: true, idleFocus: 'strength' };
}

export function defaultTownBuildings(): Building[] {
  return [
    { id: 'training_hall', name: 'Training Hall', level: 1, description: 'OSRS-ish skill shrine with terrible lighting.', effect: '+2% skill XP per level', cost: { coins: 80 } },
    { id: 'blacksmith', name: 'Blacksmith', level: 1, description: 'Turns cursed plates into equipment upgrades.', effect: '+1 equipment tier per level', cost: { coins: 120, skills: { strength: 5 } } },
    { id: 'tavern', name: 'Macro Rat Tavern', level: 1, description: 'Idle adventurers metabolize waffles here.', effect: '+8% idle coins per level', cost: { coins: 100, skills: { nutrition: 4 } } },
    { id: 'library', name: 'Doctrine Library', level: 1, description: 'Peer-reviewed boss slaying.', effect: '+10% doctrine damage per level', cost: { coins: 140, skills: { knowledge: 6 } } },
  ];
}

export function defaultResources(): GameResource[] {
  return [
    { id: 'chalk', name: 'Neon Chalk', amount: 0, icon: '☁️', description: 'Used for grip, glyphs, and legally questionable portals.' },
    { id: 'plates', name: 'Cursed Plates', amount: 0, icon: '🪩', description: 'Blacksmith upgrade currency.' },
    { id: 'protein', name: 'Protein Shards', amount: 0, icon: '🥤', description: 'Nutrition rituals and recovery buffs.' },
  ];
}

export function defaultAchievements(): Achievement[] {
  return [
    { id: 'first_run', name: 'First Descent', description: 'Start your first Swolecrypt run.', unlocked: false, reward: { coins: 20, xp: { luck: 20 } } },
    { id: 'skill_total_50', name: 'Apprentice Grinder', description: 'Reach total skill level 50.', unlocked: false, reward: { coins: 75, xp: { knowledge: 50 } } },
    { id: 'first_boss', name: 'Doctrine Damage', description: 'Defeat your first boss.', unlocked: false, reward: { coins: 120, xp: { strength: 80, knowledge: 80 } } },
    { id: 'deep_25', name: 'Cardio Catacombs', description: 'Reach room 25.', unlocked: false, reward: { coins: 150, xp: { endurance: 120 } } },
    { id: 'idle_50', name: 'AFK But Jacked', description: 'Clear 50 rooms through idle delves.', unlocked: false, reward: { coins: 100, xp: { dexterity: 80, luck: 80 } } },
  ];
}

export function checkAchievements(state: DungeonState): DungeonState {
  const total = skillTotal(state.skills);
  const idleRooms = state.idleProgress?.roomsCleared ?? 0;
  const unlocked = new Set(state.achievements.filter(a => a.unlocked).map(a => a.id));
  const unlock = (id: string) => {
    if (unlocked.has(id)) return;
    const achievement = state.achievements.find(a => a.id === id);
    if (!achievement) return;
    achievement.unlocked = true;
    achievement.unlockedAt = Date.now();
    if (achievement.reward?.coins) state.player.coins += achievement.reward.coins;
    if (achievement.reward?.xp) state.skills = addSkillXp(state.skills, achievement.reward.xp).skills;
    state.run.log = [`ACHIEVEMENT: ${achievement.name}`, ...state.run.log].slice(0, 9);
  };
  state.achievements = state.achievements.map(a => ({ ...a }));
  if (state.totalRuns >= 1) unlock('first_run');
  if (total >= 50) unlock('skill_total_50');
  if (state.bossesDefeated >= 1) unlock('first_boss');
  if (state.deepestRoom >= 25) unlock('deep_25');
  if (idleRooms >= 50) unlock('idle_50');
  return state;
}

export function workoutSkillAwards(session: WorkoutSession): Partial<Record<SkillName, number>> {
  const sets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const volume = session.exercises.reduce((sum, ex) => sum + ex.sets.reduce((inner, set) => inner + (set.weight ?? 0) * (set.reps ?? 0), 0), 0);
  const variety = new Set(session.exercises.map(e => e.exerciseKey)).size;
  const bodyweightish = session.exercises.some(e => /body|push|pull|dip|plank|sit|chin/i.test(`${e.exerciseKey} ${e.name}`));
  return {
    strength: Math.floor(sets * 8 + volume / 220),
    endurance: Math.floor(sets * 5 + Math.min(80, session.exercises.length * 8)),
    dexterity: Math.floor(variety * 9 + sets / 2),
    nutrition: bodyweightish ? 26 : 10,
    knowledge: Math.floor(variety * 7),
    luck: 5 + Math.floor((sets + variety) % 13),
  };
}

export function beginIdleProgress(state: DungeonState): IdleProgress {
  const bonuses = combatBonuses(state.skills);
  const intensity = state.gameSettings.idleModeIntensity;
  const intensityMult = intensity === 'relaxed' ? 0.72 : intensity === 'intense' ? 1.35 : 1;
  const roomsPerMinute = Math.max(0.35, (0.75 + skillTotal(state.skills) / 180) * bonuses.idleSpeed * intensityMult);
  const riskLevel = Math.max(0.015, (intensity === 'intense' ? 0.19 : intensity === 'relaxed' ? 0.07 : 0.12) - bonuses.idleRiskReduction);
  return { startTime: Date.now(), lastTickAt: Date.now(), roomsCleared: 0, coinsEarned: 0, xpEarned: {}, roomsPerMinute, riskLevel, log: ['IDLE DELVE ARMED'] };
}

export function applyIdleMinutes(state: DungeonState, minutes: number): DungeonState {
  if (!state.gameSettings.idleModeEnabled || minutes <= 0) return state;
  const progress = state.idleProgress ?? beginIdleProgress(state);
  const rooms = Math.max(1, Math.floor(progress.roomsPerMinute * minutes));
  const bonuses = combatBonuses(state.skills);
  const coins = Math.floor(rooms * (5 + state.deepestRoom / 10) * bonuses.coinBoost);
  const focus = state.gameSettings.idleFocus;
  const xp: Partial<Record<SkillName, number>> = {
    [focus]: rooms * 12,
    endurance: rooms * 3,
    luck: Math.max(1, Math.floor(rooms * 1.5)),
  };
  const died = Math.random() < Math.min(0.65, progress.riskLevel * minutes * 0.22);
  const { skills, leveled } = addSkillXp(state.skills, xp);
  const next: DungeonState = {
    ...state,
    skills,
    player: { ...state.player, coins: state.player.coins + coins, hp: died ? state.player.maxHp : state.player.hp },
    run: died ? { ...state.run, active: false, room: 0, enemyId: undefined, bossId: undefined, log: [`IDLE DELVE WIPED AFTER ${rooms} ROOMS`, ...state.run.log].slice(0, 9) } : state.run,
    deepestRoom: Math.max(state.deepestRoom, state.run.room + rooms),
    idleProgress: {
      ...progress,
      lastTickAt: Date.now(),
      roomsCleared: progress.roomsCleared + rooms,
      coinsEarned: progress.coinsEarned + coins,
      xpEarned: { ...progress.xpEarned, [focus]: (progress.xpEarned[focus] ?? 0) + (xp[focus] ?? 0) },
      log: [`+${rooms} rooms / +${coins} coins${died ? ' / WIPE' : ''}`, ...progress.log].slice(0, 6),
    },
  };
  next.run.log = [`IDLE DELVE: +${rooms} ROOMS +${coins} COINS${leveled.length ? ` / ${leveled.length} LVL UP` : ''}`, ...next.run.log].slice(0, 9);
  return checkAchievements(next);
}
