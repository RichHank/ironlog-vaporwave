import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOSSES, DUNGEON_TITLES, MONSTERS, RELICS, ROOM_EVENTS, pickBySeed } from '../dungeonContent';
import { DUNGEON_FX, DUNGEON_TRACK_LABELS, dungeonAsset } from '../dungeonAssets';
import { DoctrineQuestion, doctrineForSeed } from '../dungeonDoctrine';
import { getDungeonAudio } from '../dungeonAudio';
import type { DungeonMusicMode } from '../dungeonAudio';
import { getVaporSynth } from '../vaporSynth';
import { DungeonEnemy, DungeonRelic, DungeonRoomType, DungeonState, EquipmentSlot } from '../types';
import type { SkillName } from '../types';
import { loadDungeonState, resetDungeonState, saveDungeonState } from '../storage';
import { EQUIPMENT_CATALOG, PRESTIGE_PERKS, SKILL_ORDER, addSkillXp, applyIdleMinutes, beginIdleProgress, buyPrestigePerk, canUseEquipment, checkAchievements, craftEquipment, equipItem, performPrestige, prestigePointsAvailable, skillTotal, totalCombatBonuses, upgradeEquipment, xpForLevel } from '../game/swoleGame';

const EQUIPMENT_SLOT_ORDER: EquipmentSlot[] = ['head', 'chest', 'legs', 'weapon', 'accessory1', 'accessory2'];

type Props = {
  onClose: () => void;
  onShowToast: (msg: string) => void;
};

const paletteMap: Record<string, { a: string; b: string; c: string }> = {
  pink: { a: '#ff2aa3', b: '#00f5ff', c: '#f0e6ff' },
  cyan: { a: '#00f5ff', b: '#b44dff', c: '#f0e6ff' },
  violet: { a: '#b44dff', b: '#ff2aa3', c: '#00f5ff' },
  green: { a: '#05ffa1', b: '#00f5ff', c: '#fede5d' },
  orange: { a: '#ff8b39', b: '#ff2aa3', c: '#fede5d' },
  yellow: { a: '#fede5d', b: '#ff8b39', c: '#ff2aa3' },
  red: { a: '#fe4450', b: '#ff2aa3', c: '#fede5d' },
};

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function roomTypeFor(room: number): DungeonRoomType {
  if (room > 0 && room % 5 === 0) return 'boss';
  return pickBySeed<DungeonRoomType>(['fight', 'fight', 'loot', 'shrine', 'trap', 'merchant', 'rest', 'glitch'], room * 17 + 9);
}

function enemyFor(room: number, boss = false): DungeonEnemy {
  return boss ? pickBySeed(BOSSES, room * 19) : pickBySeed(MONSTERS, room * 31 + 7);
}

function relicOffers(room: number): string[] {
  return [0, 1, 2].map(i => pickBySeed(RELICS, room * 43 + i * 11).id);
}

function appendLog(state: DungeonState, line: string): DungeonState {
  return { ...state, run: { ...state.run, log: [line, ...state.run.log].slice(0, 9) } };
}

function enemyMaxHp(enemy: DungeonEnemy, room: number, boss = false): number {
  return boss
    ? Math.floor(enemy.hp * 3.2 + room * 18 + Math.pow(Math.max(1, room / 5), 2) * 10)
    : Math.floor(enemy.hp + room * 4 + Math.pow(room, 1.18));
}

function enemyAttackPower(enemy: DungeonEnemy, room: number, boss = false): number {
  return boss
    ? Math.floor(enemy.attack * 1.8 + room * 1.4)
    : Math.floor(enemy.attack + room * 0.55);
}

function applyRelic(player: DungeonState['player'], relic: DungeonRelic): DungeonState['player'] {
  const maxHp = Math.max(10, player.maxHp + (relic.maxHp ?? 0));
  const healed = relic.heal === 999 ? maxHp : player.hp + (relic.heal ?? 0);
  return {
    ...player,
    maxHp,
    hp: Math.max(1, Math.min(maxHp, healed)),
    attack: Math.max(1, player.attack + (relic.attack ?? 0)),
    defense: Math.max(0, player.defense + (relic.defense ?? 0)),
    crit: Math.max(0, player.crit + (relic.crit ?? 0)),
    coins: Math.max(0, player.coins + (relic.coins ?? 0)),
  };
}

function grantXp(player: DungeonState['player'], xp: number): { player: DungeonState['player']; leveled: boolean } {
  let next = { ...player, xp: player.xp + xp };
  let leveled = false;
  while (next.xp >= next.level * 32) {
    next = {
      ...next,
      xp: next.xp - next.level * 32,
      level: next.level + 1,
      maxHp: next.maxHp + 7,
      hp: next.maxHp + 7,
      attack: next.attack + 2,
      defense: next.defense + (next.level % 2 === 0 ? 1 : 0),
      crit: next.crit + 1,
    };
    leveled = true;
  }
  return { player: next, leveled };
}

function enterRoom(state: DungeonState, room: number): DungeonState {
  const type = roomTypeFor(room);
  const boss = type === 'boss';
  const enemy = type === 'fight' || boss ? enemyFor(room, boss) : undefined;
  const offers = type === 'loot' || type === 'merchant' || type === 'glitch' ? relicOffers(room) : [];
  return {
    ...state,
    run: {
      ...state.run,
      active: true,
      room,
      roomType: type,
      enemyId: !boss ? enemy?.id : undefined,
      bossId: boss ? enemy?.id : undefined,
      offeredRelicIds: offers,
      log: [`ROOM ${room}: ${type.toUpperCase()} SIGNAL ACQUIRED`, ...state.run.log].slice(0, 9),
    },
    deepestRoom: Math.max(state.deepestRoom, room),
  };
}

function assetKindForEnemy(enemy: DungeonEnemy): 'monsters' | 'bosses' {
  return BOSSES.some(b => b.id === enemy.id) ? 'bosses' : 'monsters';
}

function PixelSprite({ enemy, relic, pulse = false }: { enemy?: DungeonEnemy; relic?: DungeonRelic; pulse?: boolean }) {
  const palette = paletteMap[enemy?.palette ?? 'cyan'];
  const src = enemy
    ? dungeonAsset(assetKindForEnemy(enemy), enemy.id)
    : relic
      ? dungeonAsset('relics', relic.id)
      : dungeonAsset('fx', 'portal-open');
  const label = enemy?.name ?? relic?.name ?? 'Swolecrypt portal';
  return (
    <div className={`dungeon-sprite ${pulse ? 'dungeon-sprite-hit' : ''}`} style={{ ['--sprite-a' as string]: palette.a, ['--sprite-b' as string]: palette.b }}>
      <img src={src} alt={label} className="dungeon-pixel-art h-32 w-32" draggable={false} />
    </div>
  );
}

function MiniAsset({ kind, id, label }: { kind: 'monsters' | 'bosses' | 'relics' | 'rooms' | 'fx'; id: string; label: string }) {
  return <img src={dungeonAsset(kind, id)} alt={label} className="dungeon-mini-asset" draggable={false} loading="lazy" />;
}

export default function DungeonCrawlerGame({ onClose, onShowToast }: Props) {
  const [state, setState] = useState<DungeonState>(() => loadDungeonState());
  const [pulse, setPulse] = useState(false);
  const [panel, setPanel] = useState<'town' | 'run' | 'skills' | 'idle' | 'equipment' | 'craft' | 'prestige' | 'relics' | 'achievements'>('town');
  const [fx, setFx] = useState<keyof typeof DUNGEON_FX | null>(null);
  const [doctrine, setDoctrine] = useState<DoctrineQuestion | null>(null);
  const [doctrineSolved, setDoctrineSolved] = useState(false);
  const bonuses = useMemo(() => totalCombatBonuses(state), [state]);

  useEffect(() => {
    saveDungeonState(state);
  }, [state]);

  useEffect(() => {
    getVaporSynth().setDucked(true);
    const audio = getDungeonAudio();
    const mode = !state.run.active ? 'crawl' : state.run.roomType === 'boss' ? 'boss' : state.run.roomType === 'fight' ? 'battle' : state.run.roomType === 'merchant' ? 'shop' : 'crawl';
    audio.start(mode);
    audio.setMode(mode);
    return () => {
      audio.stop();
      getVaporSynth().setDucked(false);
    };
  }, []);

  useEffect(() => {
    const audio = getDungeonAudio();
    const mode = !state.run.active ? 'crawl' : state.run.roomType === 'boss' ? 'boss' : state.run.roomType === 'fight' ? 'battle' : state.run.roomType === 'merchant' ? 'shop' : 'crawl';
    audio.setMode(mode);
    void audio.unlock(mode);
  }, [state.run.active, state.run.roomType]);

  const currentEnemy = useMemo(() => {
    const id = state.run.bossId ?? state.run.enemyId;
    return [...MONSTERS, ...BOSSES].find(e => e.id === id) ?? null;
  }, [state.run.bossId, state.run.enemyId]);

  const roomEvent = useMemo(() => {
    const events = ROOM_EVENTS.filter(e => e.type === state.run.roomType);
    return pickBySeed(events.length ? events : ROOM_EVENTS, state.run.room * 23 + state.player.level);
  }, [state.run.room, state.run.roomType, state.player.level]);

  const trackMode: DungeonMusicMode = !state.run.active ? 'crawl' : state.run.roomType === 'boss' ? 'boss' : state.run.roomType === 'fight' ? 'battle' : state.run.roomType === 'merchant' ? 'shop' : 'crawl';

  const relics = useMemo(() =>
    state.relicIds.map(id => RELICS.find(r => r.id === id)).filter((r): r is DungeonRelic => !!r)
  , [state.relicIds]);

  const offers = useMemo(() =>
    state.run.offeredRelicIds.map(id => RELICS.find(r => r.id === id)).filter((r): r is DungeonRelic => !!r)
  , [state.run.offeredRelicIds]);

  const flashFx = (kind: keyof typeof DUNGEON_FX) => {
    setFx(kind);
    window.setTimeout(() => setFx(null), 520);
  };

  const wakeDungeon = (mode: DungeonMusicMode = trackMode) => {
    void getDungeonAudio().unlock(mode);
  };

  useEffect(() => {
    if (state.run.active && state.run.roomType === 'boss' && currentEnemy) {
      const question = doctrineForSeed(
        state.run.room * 101 + currentEnemy.name.length + state.totalRuns * 37 + (state.recentDoctrineIds?.length ?? 0) * 13,
        state.recentDoctrineIds ?? []
      );
      setDoctrine(question);
      setState(prev => prev.recentDoctrineIds?.[0] === question.id
        ? prev
        : { ...prev, recentDoctrineIds: [question.id, ...(prev.recentDoctrineIds ?? []).filter(id => id !== question.id)].slice(0, 54) });
      setDoctrineSolved(false);
    } else {
      setDoctrine(null);
      setDoctrineSolved(false);
    }
  }, [state.run.active, state.run.room, state.run.roomType, currentEnemy?.id]);

  const startRun = () => {
    const audio = getDungeonAudio();
    void audio.unlock('crawl');
    audio.sfx('boss');
    flashFx('boss');
    setPanel('run');
    setState(prev => checkAchievements(enterRoom({
      ...prev,
      player: { ...prev.player, maxHp: 42 + bonuses.maxHp, hp: 42 + bonuses.maxHp, attack: Math.max(prev.player.attack, 7 + bonuses.attack), defense: Math.max(prev.player.defense, 2 + bonuses.defense), crit: Math.max(prev.player.crit, 6 + bonuses.crit) },
      totalRuns: prev.totalRuns + 1,
      run: { ...prev.run, active: true, log: ['RUN STARTED: DO NOT TRUST THE LOCKER ROOM'] },
    }, 1)));
  };

  const nextRoom = () => {
    wakeDungeon();
    setState(prev => enterRoom(prev, prev.run.room + 1));
  };

  const attack = () => {
    if (!currentEnemy) return;
    if (state.run.roomType === 'boss' && !doctrineSolved) {
      flashFx('boss');
      getDungeonAudio().sfx('boss');
      onShowToast('Boss ward active: answer the doctrine check first');
      return;
    }
    const audio = getDungeonAudio();
    void audio.unlock(state.run.roomType === 'boss' ? 'boss' : 'battle');
    audio.sfx('hit');
    flashFx('hit');
    setPulse(true);
    window.setTimeout(() => setPulse(false), 220);
    setState(prev => {
      const isBoss = prev.run.roomType === 'boss';
      const enemyMax = enemyMaxHp(currentEnemy, prev.run.room, isBoss);
      const enemyRemaining = Number(prev.run.log.find(l => l.startsWith('ENEMY_HP:'))?.split(':')[1] ?? enemyMax);
      const didCrit = Math.random() * 100 < prev.player.crit;
      const bossGuard = isBoss ? 0.62 : 1;
      const skillB = totalCombatBonuses(prev);
      const playerDamage = Math.max(1, Math.floor((prev.player.attack + skillB.attack + Math.floor(prev.player.level / 2) - currentEnemy.defense + (didCrit ? prev.player.attack + Math.floor(skillB.crit / 2) : 0)) * bossGuard));
      const enemyNext = enemyRemaining - playerDamage;
      let next = appendLog(prev, `${didCrit ? 'CRIT! ' : ''}${currentEnemy.name} TAKES ${playerDamage}`);
      next.run.log = next.run.log.filter(l => !l.startsWith('ENEMY_HP:'));
      if (enemyNext <= 0) {
        const coinReward = Math.floor((currentEnemy.coins + Math.floor(prev.run.room / 2)) * skillB.coinBoost);
        const { player, leveled } = grantXp({
          ...next.player,
          coins: next.player.coins + coinReward,
        }, currentEnemy.xp + prev.run.room);
        const title = pickBySeed(DUNGEON_TITLES, prev.run.room * 13 + currentEnemy.name.length);
        next = {
          ...next,
          player,
          bossesDefeated: prev.run.roomType === 'boss' ? prev.bossesDefeated + 1 : prev.bossesDefeated,
          discoveredMonsterIds: uniq([...next.discoveredMonsterIds, currentEnemy.id]),
          unlockedTitles: uniq([...next.unlockedTitles, title]),
          run: {
            ...next.run,
            enemyId: undefined,
            bossId: undefined,
            offeredRelicIds: relicOffers(prev.run.room + 1),
            log: [
              `${currentEnemy.name} DEFEATED. +${coinReward} COINS`,
              leveled ? `LEVEL UP: LVL ${player.level}` : `TITLE UNLOCKED: ${title}`,
              ...next.run.log,
            ].slice(0, 9),
          },
        };
        flashFx(prev.run.roomType === 'boss' ? 'level' : 'loot');
        getDungeonAudio().sfx(prev.run.roomType === 'boss' ? 'level' : 'loot');
        return next;
      }
      const enemyDamage = Math.max(1, enemyAttackPower(currentEnemy, prev.run.room, isBoss) - prev.player.defense - skillB.defense);
      const blocked = enemyDamage === 0;
      const hp = prev.player.hp - enemyDamage;
      if (hp <= 0) {
        flashFx('death');
        getDungeonAudio().sfx('death');
        return {
          ...next,
          player: { ...next.player, hp: next.player.maxHp },
          run: {
            active: false,
            room: 0,
            roomType: 'fight',
            offeredRelicIds: [],
            log: [`DEATH BY ${currentEnemy.name}. UNLOCKS PRESERVED.`, ...next.run.log].slice(0, 9),
          },
        };
      }
      if (blocked) {
        flashFx('block');
        getDungeonAudio().sfx('block');
      }
      return {
        ...next,
        player: { ...next.player, hp },
        run: {
          ...next.run,
          log: [`ENEMY_HP:${enemyNext}`, blocked ? 'BLOCKED THE CURSE' : `${currentEnemy.name} HITS FOR ${enemyDamage}`, ...next.run.log].slice(0, 9),
        },
      };
    });
  };

  const chooseRelic = (relic: DungeonRelic, cost = 0) => {
    if (state.player.coins < cost) {
      const audio = getDungeonAudio();
      void audio.unlock(trackMode);
      audio.sfx('curse');
      onShowToast('Not enough crypt coins');
      return;
    }
    const fxKind = relic.kind === 'curse' || relic.kind === 'glitch' ? 'curse' : 'loot';
    const audio = getDungeonAudio();
    void audio.unlock(trackMode);
    audio.sfx(fxKind);
    flashFx(fxKind);
    setState(prev => {
      const applied = applyRelic(prev.player, relic);
      return appendLog({
        ...prev,
        player: { ...applied, coins: applied.coins - cost },
        relicIds: uniq([...prev.relicIds, relic.id]),
        discoveredRelicIds: uniq([...prev.discoveredRelicIds, relic.id]),
        run: { ...prev.run, offeredRelicIds: [] },
      }, `${relic.name} ACQUIRED${cost ? ` FOR ${cost} COINS` : ''}`);
    });
    setDoctrineSolved(false);
    if (state.run.roomType === 'boss' && currentEnemy) {
      const question = doctrineForSeed(state.run.room * 101 + enemyHp + currentEnemy.attack + Date.now(), state.recentDoctrineIds ?? []);
      setDoctrine(question);
      setState(prev => ({ ...prev, recentDoctrineIds: [question.id, ...(prev.recentDoctrineIds ?? []).filter(id => id !== question.id)].slice(0, 54) }));
    }
  };

  const answerDoctrine = (index: number) => {
    if (!currentEnemy || !doctrine) return;
    const audio = getDungeonAudio();
    void audio.unlock('boss');
    const correct = index === doctrine.answer;
    setDoctrineSolved(correct);
    flashFx(correct ? 'level' : 'curse');
    audio.sfx(correct ? 'level' : 'curse');
    setState(prev => {
      const isBoss = prev.run.roomType === 'boss';
      if (!isBoss) return prev;
      const enemyMax = enemyMaxHp(currentEnemy, prev.run.room, true);
      const enemyRemaining = Number(prev.run.log.find(l => l.startsWith('ENEMY_HP:'))?.split(':')[1] ?? enemyMax);
      const nextLog = prev.run.log.filter(l => !l.startsWith('ENEMY_HP:'));
      if (correct) {
        const doctrineDamage = Math.max(8, Math.floor(enemyMax * 0.13) + prev.player.level * 2);
        return {
          ...prev,
          player: {
            ...prev.player,
            hp: Math.min(prev.player.maxHp, prev.player.hp + 6),
            crit: prev.player.crit + 1,
          },
          run: {
            ...prev.run,
            log: [
              `ENEMY_HP:${Math.max(1, enemyRemaining - doctrineDamage)}`,
              `DOCTRINE CORRECT: ${doctrine.lesson}`,
              `BOSS WARD CRACKS FOR ${doctrineDamage}`,
              ...nextLog,
            ].slice(0, 9),
          },
        };
      }
      const damage = Math.max(6, enemyAttackPower(currentEnemy, prev.run.room, true) + 8 - prev.player.defense);
      const hp = prev.player.hp - damage;
      if (hp <= 0) {
        return {
          ...prev,
          player: { ...prev.player, hp: prev.player.maxHp },
          run: {
            active: false,
            room: 0,
            roomType: 'fight',
            offeredRelicIds: [],
            log: [`DOCTRINE FAILED. ${currentEnemy.name} ERASED THE RUN.`, doctrine.lesson, ...nextLog].slice(0, 9),
          },
        };
      }
      return {
        ...prev,
        player: { ...prev.player, hp },
        run: {
          ...prev.run,
          log: [
            `ENEMY_HP:${enemyRemaining}`,
            `DOCTRINE WRONG: ${doctrine.lesson}`,
            `${currentEnemy.name} PUNISHES BAD PROGRAMMING FOR ${damage}`,
            ...nextLog,
          ].slice(0, 9),
        },
      };
    });
  };

  const resolveRoom = () => {
    const audio = getDungeonAudio();
    void audio.unlock(trackMode);
    setState(prev => {
      if (prev.run.log.includes('ROOM_RESOLVED')) return prev;
      if (prev.run.roomType === 'trap') {
        audio.sfx('curse');
        flashFx('curse');
        const damage = Math.max(3, Math.floor(prev.run.room * 1.7));
        const hp = Math.max(1, prev.player.hp - damage);
        return appendLog({ ...prev, player: { ...prev.player, hp }, run: { ...prev.run, log: ['ROOM_RESOLVED', ...prev.run.log] } }, `TRAP BITES FOR ${damage} HP`);
      }
      if (prev.run.roomType === 'shrine') {
        audio.sfx('shrine');
        flashFx('heal');
        return appendLog({ ...prev, player: { ...prev.player, attack: prev.player.attack + 1, crit: prev.player.crit + 1, hp: Math.max(1, prev.player.hp - 4) }, run: { ...prev.run, log: ['ROOM_RESOLVED', ...prev.run.log] } }, 'SHRINE GRANTS POWER, STEALS COMFORT');
      }
      if (prev.run.roomType === 'rest') {
        audio.sfx('heal');
        flashFx('heal');
        return appendLog({ ...prev, player: { ...prev.player, hp: Math.min(prev.player.maxHp, prev.player.hp + 22) }, run: { ...prev.run, log: ['ROOM_RESOLVED', ...prev.run.log] } }, 'REST SITE APPLIES HAUNTED FOAM ROLLER');
      }
      if (prev.run.roomType === 'glitch') {
        audio.sfx('coin');
        flashFx('coin');
        return appendLog({ ...prev, player: { ...prev.player, coins: prev.player.coins + 18, crit: prev.player.crit + 1 }, run: { ...prev.run, log: ['ROOM_RESOLVED', ...prev.run.log] } }, 'GLITCH ROOM DUPES 18 COINS');
      }
      return prev;
    });
  };

  const claimBonus = () => {
    if (!state.pendingWorkoutBonus) return;
    const audio = getDungeonAudio();
    void audio.unlock(trackMode);
    audio.sfx('level');
    flashFx('level');
    setState(prev => {
      if (!prev.pendingWorkoutBonus) return prev;
      const skillResult = addSkillXp(prev.skills, prev.pendingWorkoutBonus.skillXp ?? {});
      const lootRolls = prev.pendingWorkoutBonus.lootRolls ?? 0;
      const resources = prev.town.resources.map(resource => (
        resource.id === 'chalk' ? { ...resource, amount: resource.amount + lootRolls * 2 } :
        resource.id === 'plates' ? { ...resource, amount: resource.amount + Math.floor(lootRolls / 2) } :
        resource.id === 'protein' ? { ...resource, amount: resource.amount + lootRolls } :
        resource.id === 'essence' ? { ...resource, amount: resource.amount + Math.floor(lootRolls / 3) } :
        resource
      ));
      const { player, leveled } = grantXp({
        ...prev.player,
        coins: prev.player.coins + prev.pendingWorkoutBonus.coins,
        attack: prev.player.attack + prev.pendingWorkoutBonus.buffAttack,
      }, prev.pendingWorkoutBonus.xp);
      return checkAchievements(appendLog({
        ...prev,
        skills: skillResult.skills,
        town: { ...prev.town, resources },
        player,
        pendingWorkoutBonus: undefined,
      }, `${prev.pendingWorkoutBonus.label} CLAIMED${leveled || skillResult.leveled.length ? ' + LEVEL UP' : ''}`));
    });
  };

  const runIdleDelve = (minutes = 2) => {
    const audio = getDungeonAudio();
    void audio.unlock('crawl');
    audio.sfx('coin');
    flashFx('coin');
    setState(prev => applyIdleMinutes({
      ...prev,
      idleProgress: prev.idleProgress ?? beginIdleProgress(prev),
    }, minutes));
    setPanel('idle');
  };

  const setIdleFocus = (focus: SkillName) => {
    setState(prev => ({ ...prev, gameSettings: { ...prev.gameSettings, idleFocus: focus } }));
  };

  const updateGameSetting = <K extends keyof DungeonState['gameSettings']>(key: K, value: DungeonState['gameSettings'][K]) => {
    setState(prev => ({ ...prev, gameSettings: { ...prev.gameSettings, [key]: value } }));
  };

  const upgradeBuilding = (id: string) => {
    setState(prev => {
      const building = prev.town.buildings.find(b => b.id === id);
      if (!building) return prev;
      const cost = Math.floor(building.cost.coins * Math.pow(1.85, building.level - 1));
      if (prev.player.coins < cost) {
        onShowToast('Not enough crypt coins');
        getDungeonAudio().sfx('curse');
        return prev;
      }
      getDungeonAudio().sfx('level');
      return appendLog({
        ...prev,
        player: { ...prev.player, coins: prev.player.coins - cost },
        town: {
          ...prev.town,
          buildings: prev.town.buildings.map(b => b.id === id ? { ...b, level: b.level + 1 } : b),
        },
      }, `${building.name.toUpperCase()} UPGRADED TO LVL ${building.level + 1}`);
    });
  };

  const craftGear = (id: string) => {
    setState(prev => {
      const next = craftEquipment(prev, id);
      if (next === prev) onShowToast('Need more coins/resources or already crafted');
      else getDungeonAudio().sfx('loot');
      return next;
    });
  };

  const equipGear = (id: string) => {
    setState(prev => {
      const item = EQUIPMENT_CATALOG.find(i => i.id === id);
      const next = equipItem(prev, id);
      if (next === prev) onShowToast(item ? 'Skill requirement not met yet' : 'Cannot equip');
      else getDungeonAudio().sfx('block');
      return next;
    });
  };

  const upgradeGear = (id: string) => {
    setState(prev => {
      const next = upgradeEquipment(prev, id);
      if (next === prev) onShowToast('Need cursed plates/coins or max level');
      else getDungeonAudio().sfx('level');
      return next;
    });
  };

  const prestigeNow = () => {
    if (!window.confirm('Prestige resets Swolecrypt skills, current run, relics, and gear for permanent Swole Points. Workout data is untouched. Ascend?')) return;
    setState(prev => {
      const next = performPrestige(prev);
      if (next === prev) onShowToast('Not enough total levels/depth/bosses for prestige yet');
      else getDungeonAudio().sfx('level');
      return next;
    });
  };

  const buyPerk = (id: string) => {
    setState(prev => {
      const next = buyPrestigePerk(prev, id);
      if (next === prev) onShowToast('Need Swole Points or perk is maxed');
      else getDungeonAudio().sfx('shrine');
      return next;
    });
  };

  const hardReset = () => {
    if (!window.confirm('Erase Swolecrypt progress? Workout data is untouched.')) return;
    const audio = getDungeonAudio();
    void audio.unlock(trackMode);
    audio.sfx('death');
    flashFx('death');
    setState(resetDungeonState());
    onShowToast('Swolecrypt reset');
  };

  const enemyHp = currentEnemy
    ? Number(state.run.log.find(l => l.startsWith('ENEMY_HP:'))?.split(':')[1] ?? enemyMaxHp(currentEnemy, state.run.room, state.run.roomType === 'boss'))
    : 0;

  return createPortal((
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#030208] text-vapor-cyan animate-fade-in">
      <div className="dungeon-bg" />
      <div className="safe-area-top relative z-10 border-b border-vapor-pink/50 bg-black/80 px-3 pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] text-vapor-muted tracking-[0.25em]">IRONLOG SIDE QUEST</p>
            <h2 className="text-2xl font-black text-vapor-pink text-glow-pink">SWOLECRYPT // NEON DUNGEON</h2>
          </div>
          <button onClick={onClose} className="btn-secondary min-h-touch px-3 py-1.5 text-xs">Close</button>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[11px]">
          <div className="dungeon-stat">HP<br/><span>{state.player.hp}/{state.player.maxHp}</span></div>
          <div className="dungeon-stat">ATK<br/><span>{state.player.attack}</span></div>
          <div className="dungeon-stat">DEF<br/><span>{state.player.defense}</span></div>
          <div className="dungeon-stat">LVL<br/><span>{state.player.level}</span></div>
          <div className="dungeon-stat">COIN<br/><span>{state.player.coins}</span></div>
        </div>
        <div className="dungeon-track mt-2">
          <span>♪ {DUNGEON_TRACK_LABELS[trackMode]}</span>
          <i /><i /><i /><i /><i />
        </div>
      </div>

      <div className="scrollbar-hide relative z-10 flex-1 overflow-y-auto px-3 py-4">
        {state.pendingWorkoutBonus && (
          <button onClick={claimBonus} className="mb-3 w-full rounded-sm border border-vapor-green bg-vapor-green/10 p-3 text-left text-vapor-green shadow-neon-green">
            CLAIM WORKOUT OFFERING: +{state.pendingWorkoutBonus.coins} COINS / +{state.pendingWorkoutBonus.xp} XP / +{state.pendingWorkoutBonus.buffAttack} ATK
          </button>
        )}

        <div className="dungeon-card p-4">
          {fx && <img src={DUNGEON_FX[fx]} alt="" className="dungeon-fx-burst" draggable={false} />}
          {!state.run.active ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex justify-center"><PixelSprite enemy={BOSSES[0]} /></div>
              <p className="text-xs text-vapor-muted">THE LOCKER ROOM FLOOR SPLITS OPEN. A DUNGEON MADE OF EGO, CHALK, AND BAD MUSIC DEMANDS A LIFTER.</p>
              <button onClick={startRun} className="btn-primary mt-4 w-full py-3 text-base">Descend Into Swolecrypt</button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-vapor-muted tracking-[0.2em]">ROOM {state.run.room} // {state.run.roomType}</p>
                  <h3 className="text-xl font-black text-vapor-pink">{currentEnemy?.name ?? roomEvent.title}</h3>
                  <p className="mt-1 text-xs text-vapor-muted">{currentEnemy?.taunt ?? roomEvent.text}</p>
                </div>
                <MiniAsset kind="rooms" id={roomEvent.id} label={roomEvent.title} />
              </div>

              <div className="dungeon-stage my-4">
                <img src={dungeonAsset('rooms', roomEvent.id)} alt="" className="dungeon-room-backdrop" draggable={false} />
                <div className="relative z-10 flex justify-center">
                  {currentEnemy ? <PixelSprite enemy={currentEnemy} pulse={pulse} /> : <MiniAsset kind="rooms" id={roomEvent.id} label={roomEvent.title} />}
                </div>
              </div>

              {currentEnemy ? (
                <>
                  <div className="mb-3 h-3 rounded border border-vapor-red/70 bg-black">
                    <div className="h-full bg-gradient-to-r from-vapor-red to-vapor-pink" style={{ width: `${Math.max(0, Math.min(100, enemyHp / enemyMaxHp(currentEnemy, state.run.room, state.run.roomType === 'boss') * 100))}%` }} />
                  </div>
                  {state.run.roomType === 'boss' && doctrine && !doctrineSolved ? (
                    <div className="rounded border border-vapor-yellow bg-vapor-yellow/10 p-3">
                      <p className="text-[11px] font-bold tracking-[0.22em] text-vapor-yellow">PHD LIFTING DOCTRINE CHECK</p>
                      <p className="mt-2 text-sm text-vapor-text">{doctrine.prompt}</p>
                      <div className="mt-3 grid gap-2">
                        {doctrine.options.map((option, index) => (
                          <button key={option} onClick={() => answerDoctrine(index)} className="dungeon-loot text-left">
                            <span className="text-vapor-yellow">{String.fromCharCode(65 + index)}</span>
                            <span><b>{option}</b></span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button onClick={attack} className="btn-primary w-full py-3 text-base">{state.run.roomType === 'boss' ? 'Exploit Boss Opening' : 'Throw Haunted Dumbbell'}</button>
                  )}
                </>
              ) : offers.length > 0 ? (
                <div className="grid gap-2">
                  {offers.map(relic => {
                    const cost = state.run.roomType === 'merchant' ? 22 + state.run.room * 2 : 0;
                    return (
                      <button key={relic.id} onClick={() => chooseRelic(relic, cost)} className="dungeon-loot text-left">
                        <MiniAsset kind="relics" id={relic.id} label={relic.name} />
                        <span><b>{relic.name}</b>{cost ? ` // ${cost} COINS` : ''}<br/><small>{relic.description}</small></span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button onClick={resolveRoom} className="btn-primary w-full py-3 text-base">
                  {state.run.roomType === 'rest' ? 'Recover In Haunted Stretch Zone' : state.run.roomType === 'trap' ? 'Trigger Bad Idea' : 'Commune With Neon Weirdness'}
                </button>
              )}

              {!currentEnemy && (
                <button onClick={nextRoom} className="btn-secondary mt-3 w-full py-3 text-base">Next Room</button>
              )}
            </>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1">
          {(['town', 'run', 'skills', 'idle', 'equipment', 'craft', 'prestige', 'relics', 'achievements'] as const).map(p => (
            <button key={p} onClick={() => setPanel(p)} className={`rounded-sm border px-2 py-2 text-xs ${panel === p ? 'border-vapor-cyan text-vapor-cyan bg-vapor-cyan/10' : 'border-vapor-pink/50 text-vapor-muted'}`}>{p}</button>
          ))}
        </div>

        <div className="dungeon-card mt-3 p-3">
          {panel === 'town' && (
            <div className="space-y-3">
              <div className="rounded border border-vapor-pink/50 bg-vapor-pink/10 p-3">
                <p className="text-[11px] tracking-[0.22em] text-vapor-muted">SWOLECRYPT LOBBY</p>
                <p className="text-lg font-black text-vapor-pink">NEON TAVERN // TOTAL LVL {skillTotal(state.skills)}</p>
                <p className="text-xs text-vapor-muted">Coins build the town. Workouts feed skills. Rest timers run idle delves.</p>
              </div>
              <div className="grid gap-2">
                {state.town.buildings.map(b => {
                  const cost = Math.floor(b.cost.coins * Math.pow(1.85, b.level - 1));
                  return (
                    <button key={b.id} onClick={() => upgradeBuilding(b.id)} className="dungeon-loot text-left">
                      <span className="text-2xl">{b.id === 'training_hall' ? '🏛️' : b.id === 'blacksmith' ? '⚒️' : b.id === 'library' ? '📚' : b.id === 'workout_shrine' ? '🛐' : b.id === 'trophy_room' ? '🏆' : '🐀'}</span>
                      <span><b>{b.name} LVL {b.level}</b> // {cost} COINS<br/><small>{b.effect}. {b.description}</small></span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {state.town.resources.map(r => <div key={r.id} className="dungeon-stat">{r.icon} {r.name}<br/><span>{r.amount}</span></div>)}
              </div>
            </div>
          )}
          {panel === 'run' && (
            <div className="space-y-1 text-xs text-vapor-muted">
              {state.run.log.filter(l => !l.startsWith('ENEMY_HP:') && l !== 'ROOM_RESOLVED').map((line, i) => <p key={i}>▸ {line}</p>)}
              <p className="pt-2 text-vapor-cyan">DEEPEST ROOM {state.deepestRoom} // BOSSES {state.bossesDefeated} // RUNS {state.totalRuns}</p>
            </div>
          )}
          {panel === 'skills' && (
            <div className="grid gap-2">
              {SKILL_ORDER.map(name => {
                const skill = state.skills[name];
                const need = xpForLevel(skill.level);
                return (
                  <div key={name} className="rounded border border-vapor-cyan/40 bg-vapor-cyan/5 p-2">
                    <div className="flex justify-between text-xs"><b className="text-vapor-pink">{skill.icon} {skill.displayName} LVL {skill.level}</b><span>{skill.xp}/{need} XP</span></div>
                    <div className="mt-1 h-2 bg-black border border-vapor-cyan/30"><div className="h-full bg-gradient-to-r from-vapor-cyan to-vapor-pink" style={{ width: `${Math.min(100, skill.xp / need * 100)}%` }} /></div>
                    <p className="mt-1 text-[11px] text-vapor-muted">{skill.description}</p>
                  </div>
                );
              })}
              <p className="text-xs text-vapor-green">BONUSES // +{bonuses.attack} ATK / +{bonuses.maxHp} HP / +{bonuses.crit} CRIT / {(bonuses.coinBoost * 100 - 100).toFixed(0)}% COINS</p>
            </div>
          )}
          {panel === 'idle' && (
            <div className="space-y-3 text-xs">
              <div className="rounded border border-vapor-purple bg-vapor-purple/10 p-3">
                <p className="text-vapor-pink font-bold">IDLE DELVE ENGINE</p>
                <p className="text-vapor-muted">Auto-clears during rest timers when enabled. Active play is stronger; idle keeps the grind breathing.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['relaxed','balanced','intense'] as const).map(i => <button key={i} onClick={() => updateGameSetting('idleModeIntensity', i)} className={`rounded border py-2 ${state.gameSettings.idleModeIntensity === i ? 'border-vapor-green text-vapor-green' : 'border-vapor-pink/50 text-vapor-muted'}`}>{i}</button>)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => updateGameSetting('idleModeEnabled', !state.gameSettings.idleModeEnabled)} className="btn-secondary py-2">Idle {state.gameSettings.idleModeEnabled ? 'On' : 'Off'}</button>
                <button onClick={() => updateGameSetting('autoClaimWorkoutBonus', !state.gameSettings.autoClaimWorkoutBonus)} className="btn-secondary py-2">Auto Claim {state.gameSettings.autoClaimWorkoutBonus ? 'On' : 'Off'}</button>
              </div>
              <p className="text-vapor-muted">Focus skill:</p>
              <div className="grid grid-cols-3 gap-1">
                {SKILL_ORDER.map(s => <button key={s} onClick={() => setIdleFocus(s)} className={`rounded border px-2 py-1 ${state.gameSettings.idleFocus === s ? 'border-vapor-cyan text-vapor-cyan' : 'border-vapor-pink/40 text-vapor-muted'}`}>{state.skills[s].icon} {s}</button>)}
              </div>
              <button onClick={() => runIdleDelve(3)} className="btn-primary w-full py-3">Simulate 3m Rest Delve</button>
              <div className="space-y-1 text-vapor-muted">
                {(state.idleProgress?.log ?? ['NO IDLE DELVES YET']).map((l, i) => <p key={i}>▸ {l}</p>)}
              </div>
            </div>
          )}
          {panel === 'equipment' && (
            <div className="space-y-3 text-xs">
              <div className="rounded border border-vapor-cyan/40 bg-vapor-cyan/5 p-3">
                <p className="font-black text-vapor-pink">EQUIPMENT // DRIP LOADOUT</p>
                <p className="text-vapor-muted">Gear adds real combat stats. Craft it in the blacksmith, equip it here, upgrade it with cursed plates.</p>
              </div>
              <div className="grid gap-2">
                {EQUIPMENT_SLOT_ORDER.map(slot => {
                  const id = state.equipment[slot];
                  const item = EQUIPMENT_CATALOG.find(i => i.id === id);
                  return (
                    <div key={slot} className="dungeon-loot">
                      <span className="text-vapor-yellow">{slot}</span>
                      {item ? <><MiniAsset kind="relics" id={item.sprite} label={item.name} /><span><b>{item.name} +{state.equipmentLevels[item.id] ?? 1}</b><br/><small>ATK {item.attack ?? 0} / DEF {item.defense ?? 0} / HP {item.maxHp ?? 0} / CRIT {item.crit ?? 0}</small></span></> : <span className="text-vapor-muted">EMPTY SLOT // spiritually drafty</span>}
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-2">
                {state.equipmentInventoryIds.length === 0 ? <p className="text-vapor-muted">No crafted gear yet. Go to CRAFT.</p> : state.equipmentInventoryIds.map(id => {
                  const item = EQUIPMENT_CATALOG.find(i => i.id === id);
                  if (!item) return null;
                  return (
                    <div key={id} className="dungeon-loot">
                      <MiniAsset kind="relics" id={item.sprite} label={item.name} />
                      <span className="flex-1"><b>{item.name} +{state.equipmentLevels[id] ?? 1}</b><br/><small>{item.description}</small></span>
                      <button onClick={() => equipGear(id)} className="btn-secondary px-2 py-1 text-[10px]">Equip</button>
                      <button onClick={() => upgradeGear(id)} className="btn-secondary px-2 py-1 text-[10px]">Upgrade</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {panel === 'craft' && (
            <div className="space-y-3 text-xs">
              <div className="rounded border border-vapor-pink/50 bg-vapor-pink/10 p-3">
                <p className="font-black text-vapor-pink">BLACKSMITH // CRAFTING</p>
                <p className="text-vapor-muted">Costs scale by rarity: coins + cursed plates + neon chalk. Higher skill total unlocks meaner relic-gear.</p>
              </div>
              <div className="grid gap-2">
                {EQUIPMENT_CATALOG.map(item => {
                  const owned = state.equipmentInventoryIds.includes(item.id);
                  const usable = canUseEquipment(state, item);
                  return (
                    <button key={item.id} onClick={() => craftGear(item.id)} className={`dungeon-loot text-left ${owned ? 'opacity-60' : ''}`}>
                      <MiniAsset kind="relics" id={item.sprite} label={item.name} />
                      <span><b>{owned ? 'OWNED // ' : ''}{item.name}</b> <small>// {item.rarity} // {item.slot}</small><br/><small>{item.description} {usable ? '' : ` Requires total ${item.requiredLevel}`}</small></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {panel === 'prestige' && (
            <div className="space-y-3 text-xs">
              <div className="rounded border border-vapor-yellow bg-vapor-yellow/10 p-3">
                <p className="font-black text-vapor-yellow">PRESTIGE // ASCENSION RACK</p>
                <p className="text-vapor-muted">Available points now: {prestigePointsAvailable(state)}. Prestige resets dungeon skills/gear/relics, keeps achievements, and grants permanent Swole Points.</p>
                <p className="mt-1 text-vapor-cyan">Prestiges {state.prestige.totalPrestiges} // Swole Points {state.prestige.swolePoints}</p>
              </div>
              <button onClick={prestigeNow} className="btn-primary w-full py-3">Ascend For {prestigePointsAvailable(state)} Swole Points</button>
              <div className="grid gap-2">
                {PRESTIGE_PERKS.map(perk => {
                  const rank = state.prestige.perks[perk.id] ?? 0;
                  return (
                    <button key={perk.id} onClick={() => buyPerk(perk.id)} className="dungeon-loot text-left">
                      <span className="text-2xl">🔮</span>
                      <span><b>{perk.name} R{rank}/{perk.max}</b> // {perk.cost} SP<br/><small>{perk.description}</small></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {panel === 'relics' && (
            <div className="grid gap-2">
              {relics.length === 0 ? <p className="text-xs text-vapor-muted">NO RELICS. SPIRITUALLY UNSWOLE.</p> : relics.map(r => (
                <div key={r.id} className="dungeon-loot"><MiniAsset kind="relics" id={r.id} label={r.name} /><span><b>{r.name}</b><br/><small>{r.description}</small></span></div>
              ))}
            </div>
          )}
          {panel === 'achievements' && (
            <div className="grid gap-2 text-xs">
              {state.achievements.map(a => (
                <div key={a.id} className={`rounded border p-2 ${a.unlocked ? 'border-vapor-green bg-vapor-green/10 text-vapor-green' : 'border-vapor-purple text-vapor-muted'}`}>
                  <b>{a.unlocked ? '✓ ' : '□ '}{a.name}</b><br/><span>{a.description}</span>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-2">
                {state.unlockedTitles.map(t => <span key={t} className="chip">{t}</span>)}
              </div>
            </div>
          )}
        </div>

        <button onClick={hardReset} className="btn-danger mt-3 w-full py-2 text-xs">Reset Swolecrypt Progress</button>
        <div className="h-8" />
      </div>
    </div>
  ), document.body);
}
