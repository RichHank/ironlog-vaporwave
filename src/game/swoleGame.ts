import { Achievement, Building, DungeonState, EquipmentItem, EquipmentSlot, GameResource, GameSettings, IdleProgress, PrestigeState, Skill, SkillName, WorkoutSession } from '../types';

export const SKILL_ORDER: SkillName[] = ['strength', 'endurance', 'dexterity', 'nutrition', 'knowledge', 'luck'];

const SKILL_META: Record<SkillName, Omit<Skill, 'level' | 'xp' | 'name'>> = {
  strength: { displayName: 'Strength', icon: '💪', description: '+damage, heavy workout coin scaling, crit force.' },
  endurance: { displayName: 'Endurance', icon: '🫀', description: '+max HP, lower idle death risk, longer delves.' },
  dexterity: { displayName: 'Dexterity', icon: '⚡', description: '+crit, trap dodge, faster idle clears.' },
  nutrition: { displayName: 'Nutrition', icon: '🥤', description: '+healing, recovery, shrine/rest value.' },
  knowledge: { displayName: 'Knowledge', icon: '🧠', description: '+doctrine damage, better scouting, smarter loot.' },
  luck: { displayName: 'Luck', icon: '🍀', description: '+coins, rare drops, extra weirdness.' },
};


export const EQUIPMENT_CATALOG: EquipmentItem[] = [
  { id: 'neon_wrist_wraps', name: 'Neon Wrist Wraps', slot: 'weapon', rarity: 'common', requiredLevel: 1, attack: 2, crit: 1, sprite: 'wrist_wraps', description: 'Entry-level violence for responsible progressive overload.' },
  { id: 'chalk_halo', name: 'Chalk Halo', slot: 'head', rarity: 'common', requiredLevel: 2, defense: 1, maxHp: 4, sprite: 'chalk_halo', description: 'A dusty crown for people who rerack.' },
  { id: 'purple_foam_cuirass', name: 'Purple Foam Cuirass', slot: 'chest', rarity: 'common', requiredLevel: 4, defense: 2, maxHp: 8, sprite: 'purple_foam', description: 'Soft armor. Hard delts.' },
  { id: 'tempo_metronome', name: 'Tempo Metronome', slot: 'accessory1', rarity: 'rare', requiredLevel: 6, crit: 3, luck: 1, sprite: 'tempo_metronome', description: 'Turns eccentric control into crit chance.' },
  { id: 'deadlift_bell', name: 'Deadlift Bell', slot: 'weapon', rarity: 'rare', requiredLevel: 8, requiredSkills: { strength: 8 }, attack: 5, defense: 1, sprite: 'deadlift_bell', description: 'Do not ring unless braced.' },
  { id: 'lat_wings', name: 'Lat Wings', slot: 'chest', rarity: 'rare', requiredLevel: 10, maxHp: 14, defense: 2, luck: 1, sprite: 'lat_wings', description: 'Grants flight, or at least aggressive posture.' },
  { id: 'basilisk_scale_leggings', name: 'Basilisk Scale Leggings', slot: 'legs', rarity: 'rare', requiredLevel: 12, defense: 4, maxHp: 10, sprite: 'basilisk_scale', description: 'Leg day insurance against looking directly at stairs.' },
  { id: 'rpe_oracle', name: 'RPE Oracle', slot: 'accessory2', rarity: 'epic', requiredLevel: 15, requiredSkills: { knowledge: 10 }, crit: 4, luck: 3, sprite: 'rpe_oracle', description: 'Whispers: “that was not a 7.”' },
  { id: 'leg_press_throne', name: 'Leg Press Throne', slot: 'legs', rarity: 'epic', requiredLevel: 18, requiredSkills: { endurance: 14 }, defense: 5, maxHp: 22, sprite: 'leg_press_throne', description: 'A royal chair for questionable range of motion.' },
  { id: 'swoldemort_nose', name: 'Swoldemort Nose', slot: 'head', rarity: 'mythic', requiredLevel: 22, requiredSkills: { knowledge: 18, luck: 12 }, attack: 3, crit: 6, luck: 5, sprite: 'swoldemort_nose', description: 'Smells weakness, deloads, and expired preworkout.' },
  { id: 'seraph_pin', name: 'Final Set Seraph Pin', slot: 'accessory1', rarity: 'mythic', requiredLevel: 28, requiredSkills: { strength: 20, endurance: 20 }, attack: 7, maxHp: 18, crit: 4, sprite: 'seraph_pin', description: 'For lifters who know one more rep is a theology.' },
  { id: 'glitch_token', name: 'Glitch Token', slot: 'accessory2', rarity: 'mythic', requiredLevel: 30, requiredSkills: { luck: 22 }, attack: 4, defense: 4, crit: 4, luck: 8, sprite: 'glitch_token', description: 'Reality fails a form check.' },
];

export const PRESTIGE_PERKS = [
  { id: 'xp_rate', name: 'Anabolic Memory', description: '+5% all skill XP per rank', max: 20, cost: 1 },
  { id: 'coin_find', name: 'Golden Chalk', description: '+7% coins per rank', max: 15, cost: 1 },
  { id: 'idle_safety', name: 'AFK Spotter', description: '-3% idle wipe risk per rank', max: 10, cost: 1 },
  { id: 'boss_damage', name: 'Doctrine Violence', description: '+6% boss/doctrine damage per rank', max: 12, cost: 1 },
];

export function defaultPrestige(): PrestigeState {
  return { totalPrestiges: 0, swolePoints: 0, lifetimeSwolePoints: 0, perks: {} };
}

function perkRank(state: DungeonState, id: string): number {
  return state.prestige?.perks?.[id] ?? 0;
}

export function equipmentBonuses(state: Pick<DungeonState, 'equipment' | 'equipmentLevels'>) {
  const equippedIds = Object.values(state.equipment ?? {}).filter(Boolean) as string[];
  return equippedIds.reduce((sum, id) => {
    const item = EQUIPMENT_CATALOG.find(i => i.id === id);
    if (!item) return sum;
    const lvl = state.equipmentLevels?.[id] ?? 1;
    const scale = 1 + (lvl - 1) * 0.22;
    sum.attack += Math.floor((item.attack ?? 0) * scale);
    sum.defense += Math.floor((item.defense ?? 0) * scale);
    sum.maxHp += Math.floor((item.maxHp ?? 0) * scale);
    sum.crit += Math.floor((item.crit ?? 0) * scale);
    sum.luck += Math.floor((item.luck ?? 0) * scale);
    return sum;
  }, { attack: 0, defense: 0, maxHp: 0, crit: 0, luck: 0 });
}

export function totalCombatBonuses(state: DungeonState) {
  const skill = combatBonuses(state.skills);
  const gear = equipmentBonuses(state);
  return {
    ...skill,
    attack: skill.attack + gear.attack,
    defense: skill.defense + gear.defense,
    maxHp: skill.maxHp + gear.maxHp,
    crit: skill.crit + gear.crit,
    coinBoost: skill.coinBoost + gear.luck / 140 + perkRank(state, 'coin_find') * 0.07,
    doctrineBoost: skill.doctrineBoost + perkRank(state, 'boss_damage') * 0.06,
    idleRiskReduction: skill.idleRiskReduction + perkRank(state, 'idle_safety') * 0.03,
  };
}

export function resourceAmount(state: DungeonState, id: string): number {
  return state.town.resources.find(r => r.id === id)?.amount ?? 0;
}

export function addResource(state: DungeonState, id: string, amount: number): DungeonState {
  return { ...state, town: { ...state.town, resources: state.town.resources.map(r => r.id === id ? { ...r, amount: Math.max(0, r.amount + amount) } : r) } };
}

export function canUseEquipment(state: DungeonState, item: EquipmentItem): boolean {
  if (skillTotal(state.skills) < item.requiredLevel) return false;
  return Object.entries(item.requiredSkills ?? {}).every(([skill, lvl]) => (state.skills[skill as SkillName]?.level ?? 1) >= (lvl ?? 1));
}

export function craftEquipment(state: DungeonState, itemId: string): DungeonState {
  const item = EQUIPMENT_CATALOG.find(i => i.id === itemId);
  if (!item || state.equipmentInventoryIds.includes(itemId)) return state;
  const rarityCost = item.rarity === 'mythic' ? 18 : item.rarity === 'epic' ? 12 : item.rarity === 'rare' ? 7 : 3;
  const coinCost = rarityCost * 22;
  if (state.player.coins < coinCost || resourceAmount(state, 'plates') < rarityCost || resourceAmount(state, 'chalk') < Math.ceil(rarityCost / 2)) return state;
  let next: DungeonState = { ...state, player: { ...state.player, coins: state.player.coins - coinCost }, equipmentInventoryIds: [...state.equipmentInventoryIds, itemId], equipmentLevels: { ...state.equipmentLevels, [itemId]: 1 } };
  next = addResource(addResource(next, 'plates', -rarityCost), 'chalk', -Math.ceil(rarityCost / 2));
  next.run.log = [`CRAFTED: ${item.name}`, ...next.run.log].slice(0, 9);
  return checkAchievements(next);
}

export function equipItem(state: DungeonState, itemId: string): DungeonState {
  const item = EQUIPMENT_CATALOG.find(i => i.id === itemId);
  if (!item || !state.equipmentInventoryIds.includes(itemId) || !canUseEquipment(state, item)) return state;
  return { ...state, equipment: { ...state.equipment, [item.slot]: itemId }, run: { ...state.run, log: [`EQUIPPED: ${item.name}`, ...state.run.log].slice(0, 9) } };
}

export function upgradeEquipment(state: DungeonState, itemId: string): DungeonState {
  if (!state.equipmentInventoryIds.includes(itemId)) return state;
  const lvl = state.equipmentLevels[itemId] ?? 1;
  if (lvl >= 10) return state;
  const cost = lvl * 3;
  if (resourceAmount(state, 'plates') < cost || state.player.coins < cost * 18) return state;
  let next: DungeonState = { ...state, player: { ...state.player, coins: state.player.coins - cost * 18 }, equipmentLevels: { ...state.equipmentLevels, [itemId]: lvl + 1 } };
  next = addResource(next, 'plates', -cost);
  next.run.log = [`GEAR UPGRADED: +${lvl + 1}`, ...next.run.log].slice(0, 9);
  return checkAchievements(next);
}

export function prestigePointsAvailable(state: DungeonState): number {
  const total = skillTotal(state.skills);
  const bossBonus = Math.floor(state.bossesDefeated / 3);
  const depthBonus = Math.floor(state.deepestRoom / 25);
  return Math.max(0, Math.floor((total - 72) / 18) + bossBonus + depthBonus);
}

export function buyPrestigePerk(state: DungeonState, perkId: string): DungeonState {
  const perk = PRESTIGE_PERKS.find(p => p.id === perkId);
  if (!perk) return state;
  const rank = state.prestige.perks[perkId] ?? 0;
  if (rank >= perk.max || state.prestige.swolePoints < perk.cost) return state;
  return { ...state, prestige: { ...state.prestige, swolePoints: state.prestige.swolePoints - perk.cost, perks: { ...state.prestige.perks, [perkId]: rank + 1 } }, run: { ...state.run, log: [`PRESTIGE PERK: ${perk.name} R${rank + 1}`, ...state.run.log].slice(0, 9) } };
}

export function performPrestige(state: DungeonState): DungeonState {
  const points = prestigePointsAvailable(state);
  if (points <= 0) return state;
  const now = Date.now();
  return checkAchievements({
    ...state,
    player: { hp: 50 + state.prestige.totalPrestiges * 4, maxHp: 50 + state.prestige.totalPrestiges * 4, attack: 8, defense: 2, level: 1, xp: 0, coins: Math.floor(state.player.coins * 0.15) + points * 40, crit: 6 },
    skills: defaultSkills(),
    relicIds: [],
    equipment: {},
    equipmentInventoryIds: [],
    equipmentLevels: {},
    run: { active: false, room: 0, roomType: 'fight', offeredRelicIds: [], log: [`ASCENDED FOR ${points} SWOLE POINTS`, 'SKILLS RESET; MEMORY REMAINS'] },
    idleProgress: null,
    totalRuns: 0,
    bossesDefeated: 0,
    deepestRoom: 0,
    prestige: { ...state.prestige, totalPrestiges: state.prestige.totalPrestiges + 1, swolePoints: state.prestige.swolePoints + points, lifetimeSwolePoints: state.prestige.lifetimeSwolePoints + points },
    updatedAt: now,
  });
}

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
    { id: 'workout_shrine', name: 'Workout Shrine', level: 1, description: 'Converts completed sessions into sacred loot rolls.', effect: '+1 loot roll every 3 levels', cost: { coins: 160, skills: { endurance: 6 } } },
    { id: 'trophy_room', name: 'Trophy Room', level: 1, description: 'Achievements stare at you until morale improves.', effect: '+5% prestige points per level', cost: { coins: 220, skills: { luck: 8 } } },
  ];
}

export function defaultResources(): GameResource[] {
  return [
    { id: 'chalk', name: 'Neon Chalk', amount: 0, icon: '☁️', description: 'Used for grip, glyphs, and legally questionable portals.' },
    { id: 'plates', name: 'Cursed Plates', amount: 0, icon: '🪩', description: 'Blacksmith upgrade currency.' },
    { id: 'protein', name: 'Protein Shards', amount: 0, icon: '🥤', description: 'Nutrition rituals and recovery buffs.' },
    { id: 'essence', name: 'Swole Essence', amount: 0, icon: '🔮', description: 'Rare prestige/crafting residue from bosses and long grinds.' },
  ];
}

export function defaultAchievements(): Achievement[] {
  const base: Achievement[] = [
    { id: 'first_run', name: 'First Descent', description: 'Start your first Swolecrypt run.', unlocked: false, reward: { coins: 20, xp: { luck: 20 } } },
    { id: 'skill_total_50', name: 'Apprentice Grinder', description: 'Reach total skill level 50.', unlocked: false, reward: { coins: 75, xp: { knowledge: 50 } } },
    { id: 'skill_total_100', name: 'Rune Rack Initiate', description: 'Reach total skill level 100.', unlocked: false, reward: { coins: 150, xp: { strength: 80, endurance: 80 } } },
    { id: 'skill_total_200', name: 'Halfway To Weird', description: 'Reach total skill level 200.', unlocked: false, reward: { coins: 300, xp: { luck: 150 } } },
    { id: 'first_boss', name: 'Doctrine Damage', description: 'Defeat your first boss.', unlocked: false, reward: { coins: 120, xp: { strength: 80, knowledge: 80 } } },
    { id: 'boss_5', name: 'Boss Tax Collector', description: 'Defeat 5 bosses.', unlocked: false, reward: { coins: 300, xp: { knowledge: 180 } } },
    { id: 'boss_12', name: 'Seraph Negotiator', description: 'Defeat 12 bosses.', unlocked: false, reward: { coins: 600, xp: { strength: 250, endurance: 250 } } },
    { id: 'deep_25', name: 'Cardio Catacombs', description: 'Reach room 25.', unlocked: false, reward: { coins: 150, xp: { endurance: 120 } } },
    { id: 'deep_50', name: 'The Pump Below', description: 'Reach room 50.', unlocked: false, reward: { coins: 350, xp: { dexterity: 220 } } },
    { id: 'deep_100', name: 'Hundred Room Stare', description: 'Reach room 100.', unlocked: false, reward: { coins: 900, xp: { luck: 400 } } },
    { id: 'idle_50', name: 'AFK But Jacked', description: 'Clear 50 rooms through idle delves.', unlocked: false, reward: { coins: 100, xp: { dexterity: 80, luck: 80 } } },
    { id: 'idle_250', name: 'Rest Timer Goblin', description: 'Clear 250 rooms through idle delves.', unlocked: false, reward: { coins: 450, xp: { endurance: 260 } } },
    { id: 'first_craft', name: 'Blacksmith Smell', description: 'Craft your first equipment piece.', unlocked: false, reward: { coins: 80, xp: { strength: 60 } } },
    { id: 'full_kit', name: 'Dripped For Doom', description: 'Equip all six gear slots.', unlocked: false, reward: { coins: 500, xp: { luck: 250 } } },
    { id: 'first_prestige', name: 'Ascended In Short Shorts', description: 'Prestige for the first time.', unlocked: false, reward: { coins: 250 } },
  ];
  const skillMilestones = SKILL_ORDER.flatMap(skill => [10, 25, 50, 75, 99].map(level => ({
    id: `${skill}_${level}`,
    name: `${SKILL_META[skill].displayName} ${level}`,
    description: `Reach ${SKILL_META[skill].displayName} level ${level}.`,
    unlocked: false,
    reward: { coins: level * 6, xp: { [skill]: level * 4 } as Partial<Record<SkillName, number>> },
  })));
  const grind = Array.from({ length: 15 }, (_, i) => {
    const n = i + 1;
    return { id: `crypt_grind_${n}`, name: `Crypt Grind ${n}`, description: `Reach room ${n * 10} or deeper.`, unlocked: false, reward: { coins: n * 35 } };
  });
  return [...base, ...skillMilestones, ...grind];
}

export function checkAchievements(state: DungeonState): DungeonState {
  const total = skillTotal(state.skills);
  const idleRooms = state.idleProgress?.roomsCleared ?? 0;
  const equippedSlots = Object.values(state.equipment ?? {}).filter(Boolean).length;
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
  if (total >= 100) unlock('skill_total_100');
  if (total >= 200) unlock('skill_total_200');
  for (const skill of SKILL_ORDER) for (const level of [10, 25, 50, 75, 99]) if ((state.skills[skill]?.level ?? 1) >= level) unlock(`${skill}_${level}`);
  if (state.bossesDefeated >= 1) unlock('first_boss');
  if (state.bossesDefeated >= 5) unlock('boss_5');
  if (state.bossesDefeated >= 12) unlock('boss_12');
  if (state.deepestRoom >= 25) unlock('deep_25');
  if (state.deepestRoom >= 50) unlock('deep_50');
  if (state.deepestRoom >= 100) unlock('deep_100');
  for (let n = 1; n <= 15; n++) if (state.deepestRoom >= n * 10) unlock(`crypt_grind_${n}`);
  if (idleRooms >= 50) unlock('idle_50');
  if (idleRooms >= 250) unlock('idle_250');
  if ((state.equipmentInventoryIds?.length ?? 0) >= 1) unlock('first_craft');
  if (equippedSlots >= 6) unlock('full_kit');
  if ((state.prestige?.totalPrestiges ?? 0) >= 1) unlock('first_prestige');
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
  const bonuses = totalCombatBonuses(state);
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
  const bonuses = totalCombatBonuses(state);
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
