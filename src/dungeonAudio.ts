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
    bass: [36.71, 36.71, 43.65, 36.71, 49, 46.25, 41.2, 43.65],
    lead: [146.83, 174.61, 207.65, 174.61, 293.66, 261.63, 220, 174.61],
    chord: [73.42, 87.31, 110, 146.83],
    bpm: 104,
    swing: 0.03,
    color: 'triangle',
    kickEvery: 4,
    snareAt: [4, 12],
  },
  battle: {
    bass: [55, 55, 82.41, 55, 61.74, 73.42, 82.41, 103.83],
    lead: [220, 329.63, 261.63, 440, 293.66, 554.37, 392, 659.25],
    chord: [110, 130.81, 164.81, 220],
    bpm: 156,
    swing: 0.015,
    color: 'square',
    kickEvery: 2,
    snareAt: [4, 10, 14],
  },
  boss: {
    bass: [30.87, 41.2, 30.87, 46.25, 30.87, 55, 49, 41.2],
    lead: [123.47, 164.81, 185, 220, 246.94, 220, 185, 164.81],
    chord: [61.74, 82.41, 92.5, 123.47],
    bpm: 128,
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
    bass: [46.25, 55, 65.41, 73.42, 65.41, 55, 51.91, 55],
    lead: [185, 220, 277.18, 369.99, 277.18, 246.94, 220, 207.65],
    chord: [92.5, 110, 138.59, 185],
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

    this.tone(bass, now, this.mode === 'boss' ? 0.18 : 0.12, 'square', 0.24, this.musicBus, this.mode === 'boss' ? 320 : 520);
    if (i % 2 === 0) this.tone(chord, now + 0.015, 0.22, 'sawtooth', this.mode === 'boss' ? 0.12 : 0.07, this.musicBus, this.mode === 'boss' ? 540 : 860);
    if (i % (this.mode === 'battle' ? 1 : 2) === 0) this.tone(lead, now + 0.04, 0.075, track.color, this.mode === 'shop' ? 0.12 : 0.145, this.musicBus, 2200);
    if ((this.mode === 'battle' || this.mode === 'boss') && i % 4 === 3) this.tone(lead * 2, now + 0.07, 0.045, 'square', 0.09, this.musicBus, 3200);
    if (this.step % track.kickEvery === 0) this.kick(now);
    if (i % 4 === 2) this.noise(now + 0.015, 0.025, 0.035, this.musicBus, 4200, 'highpass');
    if (track.snareAt.includes(i)) this.noise(now + 0.02, 0.065, 0.13, this.musicBus, 1400, 'highpass');
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
