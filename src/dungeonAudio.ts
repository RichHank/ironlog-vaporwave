import { loadSettings } from './storage';
import { getAudioContext, getSfxMuted, getSfxVolume } from './audio';

export type DungeonMusicMode = 'crawl' | 'battle' | 'boss' | 'victory' | 'shop';
type DungeonSfx = 'hit' | 'crit' | 'block' | 'loot' | 'curse' | 'heal' | 'boss' | 'level' | 'death' | 'shrine' | 'coin';

type TrackStep = {
  bass: number[];
  lead: number[];
  chord: number[];
  bpm: number;
  swing: number;
  color: OscillatorType;
  kickEvery: number;
  snareAt: number[];
};

const TRACKS: Record<DungeonMusicMode, TrackStep> = {
  crawl: {
    bass: [49, 49, 61.74, 49, 73.42, 61.74, 55, 61.74],
    lead: [196, 246.94, 293.66, 246.94, 392, 329.63, 293.66, 246.94],
    chord: [98, 123.47, 146.83, 196],
    bpm: 92,
    swing: 0.03,
    color: 'triangle',
    kickEvery: 4,
    snareAt: [4, 12],
  },
  battle: {
    bass: [65.41, 65.41, 98, 65.41, 77.78, 87.31, 98, 116.54],
    lead: [261.63, 392, 311.13, 466.16, 349.23, 523.25, 392, 587.33],
    chord: [130.81, 155.56, 196, 261.63],
    bpm: 138,
    swing: 0.015,
    color: 'square',
    kickEvery: 2,
    snareAt: [4, 10, 14],
  },
  boss: {
    bass: [41.2, 55, 41.2, 61.74, 41.2, 73.42, 65.41, 55],
    lead: [164.81, 196, 220, 246.94, 293.66, 246.94, 220, 196],
    chord: [82.41, 98, 123.47, 146.83],
    bpm: 116,
    swing: 0.025,
    color: 'sawtooth',
    kickEvery: 1,
    snareAt: [6, 14],
  },
  victory: {
    bass: [65.41, 82.41, 98, 130.81, 98, 82.41, 73.42, 82.41],
    lead: [392, 493.88, 587.33, 783.99, 659.25, 587.33, 493.88, 392],
    chord: [130.81, 164.81, 196, 261.63],
    bpm: 110,
    swing: 0.02,
    color: 'triangle',
    kickEvery: 4,
    snareAt: [8],
  },
  shop: {
    bass: [55, 65.41, 73.42, 82.41, 73.42, 65.41, 61.74, 65.41],
    lead: [220, 261.63, 329.63, 392, 329.63, 293.66, 261.63, 246.94],
    chord: [110, 130.81, 164.81, 220],
    bpm: 104,
    swing: 0.04,
    color: 'sine',
    kickEvery: 4,
    snareAt: [6, 14],
  },
};

class DungeonAudio {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private timer: number | null = null;
  private mode: DungeonMusicMode = 'crawl';
  private step = 0;
  private running = false;

  private ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        this.ctx = getAudioContext();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(this.ctx.destination);
        this.sfxBus.connect(this.ctx.destination);
      }
      this.applySettings();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private applySettings() {
    if (!this.ctx || !this.musicBus || !this.sfxBus) return;
    const settings = loadSettings();
    const musicVol = Math.max(0, Math.min(100, settings.musicVolume ?? 30)) / 100;
    const sfxMuted = getSfxMuted() || settings.soundEffectsMuted;
    const sfxVol = sfxMuted ? 0 : Math.max(0, Math.min(100, getSfxVolume() || settings.soundEffectsVolume || 75)) / 100;
    this.musicBus.gain.setTargetAtTime(musicVol * 0.28, this.ctx.currentTime, 0.02);
    this.sfxBus.gain.setTargetAtTime(sfxVol * 0.36, this.ctx.currentTime, 0.01);
  }

  async unlock(mode: DungeonMusicMode = this.mode): Promise<boolean> {
    this.mode = mode;
    const ctx = this.ensure();
    if (!ctx || !this.musicBus) return false;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {
      return false;
    }
    this.applySettings();
    if (!this.running) {
      this.running = true;
      this.step = 0;
      this.schedule();
    }
    this.tone(880, ctx.currentTime + 0.01, 0.045, 'triangle', 0.035, this.musicBus, 2400);
    return ctx.state === 'running';
  }

  start(mode: DungeonMusicMode = 'crawl') {
    this.mode = mode;
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.running) {
      this.applySettings();
      return;
    }
    this.running = true;
    this.step = 0;
    this.schedule();
  }

  setMode(mode: DungeonMusicMode) {
    this.mode = mode;
    this.applySettings();
  }

  stop() {
    this.running = false;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule = () => {
    if (!this.running) return;
    const ctx = this.ensure();
    if (!ctx || !this.musicBus) return;
    const track = TRACKS[this.mode];
    const now = ctx.currentTime;
    const i = this.step % 16;
    const bass = track.bass[i % track.bass.length];
    const lead = track.lead[(i + Math.floor(this.step / 16)) % track.lead.length];
    const chord = track.chord[Math.floor(i / 4) % track.chord.length];
    const stepMs = (60_000 / track.bpm) / 2;

    this.tone(bass, now, 0.11, 'square', 0.17, this.musicBus, 420);
    if (i % 2 === 0) this.tone(chord, now + 0.015, 0.2, 'sawtooth', this.mode === 'boss' ? 0.08 : 0.045, this.musicBus, this.mode === 'boss' ? 620 : 980);
    if (i % (this.mode === 'battle' ? 1 : 2) === 0) this.tone(lead, now + 0.04, 0.08, track.color, this.mode === 'shop' ? 0.08 : 0.105, this.musicBus, 1800);
    if (this.step % track.kickEvery === 0) this.kick(now);
    if (track.snareAt.includes(i)) this.noise(now + 0.02, 0.045, 0.08, this.musicBus, 1400, 'highpass');
    if (this.mode === 'boss' && i % 8 === 7) this.tone(36.7, now + 0.04, 0.28, 'sawtooth', 0.16, this.musicBus, 260);

    this.step += 1;
    this.timer = window.setTimeout(this.schedule, Math.max(70, stepMs + (i % 2 ? track.swing * 1000 : 0)));
  };

  private tone(freq: number, when: number, len: number, type: OscillatorType, gainValue: number, destination: AudioNode, filterHz = 900) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (type === 'sawtooth') osc.detune.setValueAtTime((Math.random() - 0.5) * 8, when);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterHz, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(gainValue, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, when + len);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    osc.start(when);
    osc.stop(when + len + 0.04);
  }

  private noise(when: number, len: number, gainValue: number, destination: AudioNode, filterHz: number, filterType: BiquadFilterType) {
    if (!this.ctx) return;
    const buffer = this.ctx.createBuffer(1, Math.max(1, Math.floor(this.ctx.sampleRate * len)), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    src.buffer = buffer;
    filter.type = filterType;
    filter.frequency.value = filterHz;
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + len);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    src.start(when);
  }

  private kick(when: number) {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.mode === 'boss' ? 92 : 72, when);
    osc.frequency.exponentialRampToValueAtTime(38, when + 0.09);
    gain.gain.setValueAtTime(0.16, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.14);
  }

  sfx(kind: DungeonSfx) {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const settings = loadSettings();
    if (getSfxMuted() || settings.soundEffectsMuted || (getSfxVolume() || settings.soundEffectsVolume || 75) <= 0) return;
    const now = ctx.currentTime;
    const map: Record<DungeonSfx, [number, number, OscillatorType]> = {
      hit: [110, 55, 'square'],
      crit: [880, 1480, 'sawtooth'],
      block: [70, 100, 'triangle'],
      loot: [660, 990, 'triangle'],
      curse: [300, 45, 'sawtooth'],
      heal: [440, 660, 'sine'],
      boss: [45, 32, 'sawtooth'],
      level: [523, 1046, 'square'],
      death: [180, 30, 'sawtooth'],
      shrine: [392, 784, 'sine'],
      coin: [880, 1174, 'triangle'],
    };
    const [a, b, type] = map[kind];
    this.tone(a, now, 0.11, type, 0.55, this.sfxBus, kind === 'boss' ? 360 : 1800);
    this.tone(b, now + 0.075, 0.13, type, 0.38, this.sfxBus, kind === 'curse' ? 520 : 2200);
    if (kind === 'crit' || kind === 'loot' || kind === 'coin' || kind === 'level') this.tone(b * 1.5, now + 0.15, 0.1, 'square', 0.23, this.sfxBus, 2600);
    if (kind === 'death' || kind === 'boss' || kind === 'curse') this.noise(now, kind === 'boss' ? 0.42 : 0.28, 0.55, this.sfxBus, kind === 'death' ? 500 : 1000, 'highpass');
  }
}

let instance: DungeonAudio | null = null;

export function getDungeonAudio(): DungeonAudio {
  if (!instance) instance = new DungeonAudio();
  return instance;
}
