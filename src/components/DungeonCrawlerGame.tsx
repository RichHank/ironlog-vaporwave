import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOSSES, DUNGEON_TITLES, MONSTERS, RELICS, ROOM_EVENTS, pickBySeed } from '../dungeonContent';
import { getDungeonAudio } from '../dungeonAudio';
import { DungeonEnemy, DungeonRelic, DungeonRoomType, DungeonState } from '../types';
import { loadDungeonState, resetDungeonState, saveDungeonState } from '../storage';

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

function PixelSprite({ enemy, relic, pulse = false }: { enemy?: DungeonEnemy; relic?: DungeonRelic; pulse?: boolean }) {
  const palette = paletteMap[enemy?.palette ?? 'cyan'];
  const label = enemy?.sprite ?? relic?.sprite ?? '💀';
  return (
    <div className={`dungeon-sprite ${pulse ? 'dungeon-sprite-hit' : ''}`} style={{ ['--sprite-a' as string]: palette.a, ['--sprite-b' as string]: palette.b }}>
      <svg viewBox="0 0 120 120" className="h-28 w-28">
        <defs>
          <filter id={`glow-${label}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="18" y="24" width="84" height="72" rx="8" fill="rgba(5,5,10,.92)" stroke={palette.a} strokeWidth="3" filter={`url(#glow-${label})`} />
        <path d="M30 86 L42 50 L60 72 L78 40 L92 86 Z" fill={palette.a} opacity=".35" />
        <circle cx="45" cy="52" r="7" fill={palette.b} />
        <circle cx="75" cy="52" r="7" fill={palette.b} />
        <rect x="42" y="76" width="36" height="6" fill={palette.c} opacity=".8" />
        <text x="60" y="70" textAnchor="middle" fontSize="34" filter={`url(#glow-${label})`}>{label}</text>
      </svg>
    </div>
  );
}

export default function DungeonCrawlerGame({ onClose, onShowToast }: Props) {
  const [state, setState] = useState<DungeonState>(() => loadDungeonState());
  const [pulse, setPulse] = useState(false);
  const [panel, setPanel] = useState<'run' | 'relics' | 'bestiary' | 'titles'>('run');

  useEffect(() => {
    saveDungeonState(state);
  }, [state]);

  useEffect(() => {
    const audio = getDungeonAudio();
    audio.start(state.run.roomType === 'boss' ? 'boss' : state.run.roomType === 'fight' ? 'battle' : 'crawl');
    audio.setMode(state.run.roomType === 'boss' ? 'boss' : state.run.roomType === 'fight' ? 'battle' : state.run.roomType === 'merchant' ? 'shop' : 'crawl');
    return () => audio.stop();
  }, [state.run.roomType]);

  const currentEnemy = useMemo(() => {
    const id = state.run.bossId ?? state.run.enemyId;
    return [...MONSTERS, ...BOSSES].find(e => e.id === id) ?? null;
  }, [state.run.bossId, state.run.enemyId]);

  const roomEvent = useMemo(() =>
    ROOM_EVENTS.find(e => e.type === state.run.roomType) ?? ROOM_EVENTS[0]
  , [state.run.roomType]);

  const relics = useMemo(() =>
    state.relicIds.map(id => RELICS.find(r => r.id === id)).filter((r): r is DungeonRelic => !!r)
  , [state.relicIds]);

  const offers = useMemo(() =>
    state.run.offeredRelicIds.map(id => RELICS.find(r => r.id === id)).filter((r): r is DungeonRelic => !!r)
  , [state.run.offeredRelicIds]);

  const startRun = () => {
    getDungeonAudio().sfx('boss');
    setState(prev => enterRoom({
      ...prev,
      player: { ...prev.player, hp: prev.player.maxHp },
      totalRuns: prev.totalRuns + 1,
      run: { ...prev.run, active: true, log: ['RUN STARTED: DO NOT TRUST THE LOCKER ROOM'] },
    }, 1));
  };

  const nextRoom = () => {
    setState(prev => enterRoom(prev, prev.run.room + 1));
  };

  const attack = () => {
    if (!currentEnemy) return;
    getDungeonAudio().sfx('hit');
    setPulse(true);
    window.setTimeout(() => setPulse(false), 220);
    setState(prev => {
      const enemyMax = currentEnemy.hp + Math.floor(prev.run.room * 2.5);
      const enemyRemaining = Number(prev.run.log.find(l => l.startsWith('ENEMY_HP:'))?.split(':')[1] ?? enemyMax);
      const didCrit = Math.random() * 100 < prev.player.crit;
      const playerDamage = Math.max(1, prev.player.attack + Math.floor(prev.player.level / 2) - currentEnemy.defense + (didCrit ? prev.player.attack : 0));
      const enemyNext = enemyRemaining - playerDamage;
      let next = appendLog(prev, `${didCrit ? 'CRIT! ' : ''}${currentEnemy.name} TAKES ${playerDamage}`);
      next.run.log = next.run.log.filter(l => !l.startsWith('ENEMY_HP:'));
      if (enemyNext <= 0) {
        const { player, leveled } = grantXp({
          ...next.player,
          coins: next.player.coins + currentEnemy.coins + Math.floor(prev.run.room / 2),
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
              `${currentEnemy.name} DEFEATED. +${currentEnemy.coins} COINS`,
              leveled ? `LEVEL UP: LVL ${player.level}` : `TITLE UNLOCKED: ${title}`,
              ...next.run.log,
            ].slice(0, 9),
          },
        };
        getDungeonAudio().sfx(prev.run.roomType === 'boss' ? 'level' : 'loot');
        return next;
      }
      const enemyDamage = Math.max(0, currentEnemy.attack + Math.floor(prev.run.room / 3) - prev.player.defense);
      const blocked = enemyDamage === 0;
      const hp = prev.player.hp - enemyDamage;
      if (hp <= 0) {
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
      if (blocked) getDungeonAudio().sfx('block');
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
      getDungeonAudio().sfx('curse');
      onShowToast('Not enough crypt coins');
      return;
    }
    getDungeonAudio().sfx(relic.kind === 'curse' || relic.kind === 'glitch' ? 'curse' : 'loot');
    setState(prev => appendLog({
      ...prev,
      player: { ...applyRelic(prev.player, relic), coins: applyRelic(prev.player, relic).coins - cost },
      relicIds: uniq([...prev.relicIds, relic.id]),
      discoveredRelicIds: uniq([...prev.discoveredRelicIds, relic.id]),
      run: { ...prev.run, offeredRelicIds: [] },
    }, `${relic.name} ACQUIRED${cost ? ` FOR ${cost} COINS` : ''}`));
  };

  const resolveRoom = () => {
    const audio = getDungeonAudio();
    setState(prev => {
      if (prev.run.log.includes('ROOM_RESOLVED')) return prev;
      if (prev.run.roomType === 'trap') {
        audio.sfx('curse');
        const damage = Math.max(3, Math.floor(prev.run.room * 1.7));
        const hp = Math.max(1, prev.player.hp - damage);
        return appendLog({ ...prev, player: { ...prev.player, hp }, run: { ...prev.run, log: ['ROOM_RESOLVED', ...prev.run.log] } }, `TRAP BITES FOR ${damage} HP`);
      }
      if (prev.run.roomType === 'shrine') {
        audio.sfx('shrine');
        return appendLog({ ...prev, player: { ...prev.player, attack: prev.player.attack + 1, crit: prev.player.crit + 1, hp: Math.max(1, prev.player.hp - 4) }, run: { ...prev.run, log: ['ROOM_RESOLVED', ...prev.run.log] } }, 'SHRINE GRANTS POWER, STEALS COMFORT');
      }
      if (prev.run.roomType === 'rest') {
        audio.sfx('heal');
        return appendLog({ ...prev, player: { ...prev.player, hp: Math.min(prev.player.maxHp, prev.player.hp + 22) }, run: { ...prev.run, log: ['ROOM_RESOLVED', ...prev.run.log] } }, 'REST SITE APPLIES HAUNTED FOAM ROLLER');
      }
      if (prev.run.roomType === 'glitch') {
        audio.sfx('coin');
        return appendLog({ ...prev, player: { ...prev.player, coins: prev.player.coins + 18, crit: prev.player.crit + 1 }, run: { ...prev.run, log: ['ROOM_RESOLVED', ...prev.run.log] } }, 'GLITCH ROOM DUPES 18 COINS');
      }
      return prev;
    });
  };

  const claimBonus = () => {
    if (!state.pendingWorkoutBonus) return;
    getDungeonAudio().sfx('level');
    setState(prev => {
      if (!prev.pendingWorkoutBonus) return prev;
      const { player, leveled } = grantXp({
        ...prev.player,
        coins: prev.player.coins + prev.pendingWorkoutBonus.coins,
        attack: prev.player.attack + prev.pendingWorkoutBonus.buffAttack,
      }, prev.pendingWorkoutBonus.xp);
      return appendLog({
        ...prev,
        player,
        pendingWorkoutBonus: undefined,
      }, `${prev.pendingWorkoutBonus.label} CLAIMED${leveled ? ' + LEVEL UP' : ''}`);
    });
  };

  const hardReset = () => {
    if (!window.confirm('Erase Swolecrypt progress? Workout data is untouched.')) return;
    getDungeonAudio().sfx('death');
    setState(resetDungeonState());
    onShowToast('Swolecrypt reset');
  };

  const enemyHp = currentEnemy
    ? Number(state.run.log.find(l => l.startsWith('ENEMY_HP:'))?.split(':')[1] ?? currentEnemy.hp + Math.floor(state.run.room * 2.5))
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
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-3 py-4">
        {state.pendingWorkoutBonus && (
          <button onClick={claimBonus} className="mb-3 w-full rounded-sm border border-vapor-green bg-vapor-green/10 p-3 text-left text-vapor-green shadow-neon-green">
            CLAIM WORKOUT OFFERING: +{state.pendingWorkoutBonus.coins} COINS / +{state.pendingWorkoutBonus.xp} XP / +{state.pendingWorkoutBonus.buffAttack} ATK
          </button>
        )}

        <div className="dungeon-card p-4">
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
                <div className="text-4xl">{currentEnemy?.sprite ?? roomEvent.sprite}</div>
              </div>

              <div className="my-4 flex justify-center">
                <PixelSprite enemy={currentEnemy ?? undefined} pulse={pulse} />
              </div>

              {currentEnemy ? (
                <>
                  <div className="mb-3 h-3 rounded border border-vapor-red/70 bg-black">
                    <div className="h-full bg-gradient-to-r from-vapor-red to-vapor-pink" style={{ width: `${Math.max(0, Math.min(100, enemyHp / (currentEnemy.hp + Math.floor(state.run.room * 2.5)) * 100))}%` }} />
                  </div>
                  <button onClick={attack} className="btn-primary w-full py-3 text-base">{state.run.roomType === 'boss' ? 'Fight Boss' : 'Throw Haunted Dumbbell'}</button>
                </>
              ) : offers.length > 0 ? (
                <div className="grid gap-2">
                  {offers.map(relic => {
                    const cost = state.run.roomType === 'merchant' ? 22 + state.run.room * 2 : 0;
                    return (
                      <button key={relic.id} onClick={() => chooseRelic(relic, cost)} className="dungeon-loot text-left">
                        <span className="text-2xl">{relic.sprite}</span>
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

        <div className="mt-3 grid grid-cols-4 gap-1">
          {(['run', 'relics', 'bestiary', 'titles'] as const).map(p => (
            <button key={p} onClick={() => setPanel(p)} className={`rounded-sm border px-2 py-2 text-xs ${panel === p ? 'border-vapor-cyan text-vapor-cyan bg-vapor-cyan/10' : 'border-vapor-pink/50 text-vapor-muted'}`}>{p}</button>
          ))}
        </div>

        <div className="dungeon-card mt-3 p-3">
          {panel === 'run' && (
            <div className="space-y-1 text-xs text-vapor-muted">
              {state.run.log.filter(l => !l.startsWith('ENEMY_HP:') && l !== 'ROOM_RESOLVED').map((line, i) => <p key={i}>▸ {line}</p>)}
              <p className="pt-2 text-vapor-cyan">DEEPEST ROOM {state.deepestRoom} // BOSSES {state.bossesDefeated} // RUNS {state.totalRuns}</p>
            </div>
          )}
          {panel === 'relics' && (
            <div className="grid gap-2">
              {relics.length === 0 ? <p className="text-xs text-vapor-muted">NO RELICS. SPIRITUALLY UNSWOLE.</p> : relics.map(r => (
                <div key={r.id} className="dungeon-loot"><span className="text-xl">{r.sprite}</span><span><b>{r.name}</b><br/><small>{r.description}</small></span></div>
              ))}
            </div>
          )}
          {panel === 'bestiary' && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {state.discoveredMonsterIds.length === 0 ? <p className="text-vapor-muted">DEFEAT CREATURES TO FILL THE CURSED DEX.</p> : state.discoveredMonsterIds.map(id => {
                const e = [...MONSTERS, ...BOSSES].find(m => m.id === id);
                return e ? <div key={id} className="rounded border border-vapor-purple p-2"><span className="text-xl">{e.sprite}</span> {e.name}</div> : null;
              })}
            </div>
          )}
          {panel === 'titles' && (
            <div className="flex flex-wrap gap-2">
              {state.unlockedTitles.map(t => <span key={t} className="chip">{t}</span>)}
            </div>
          )}
        </div>

        <button onClick={hardReset} className="btn-danger mt-3 w-full py-2 text-xs">Reset Swolecrypt Progress</button>
        <div className="h-8" />
      </div>
    </div>
  ), document.body);
}
