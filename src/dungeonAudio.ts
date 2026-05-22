import { loadSettings } from './storage';

type DungeonMusicMode = 'crawl' | 'battle' | 'boss' | 'victory' | 'shop';
type DungeonSfx = 'hit' | 'crit' | 'block' | 'loot' | 'curse' | 'heal' | 'boss' | 'level' | 'death' | 'shrine' | 'coin';

class DungeonAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private mode: DungeonMusicMode = 'crawl';
  private step = 0;
  private running = false;

  private ensure(): AudioContext | null {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      if (!this.ctx) {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
      const settings = loadSettings();
      const vol = settings.soundEffectsMuted ? 0 : Math.max(0, Math.min(100, settings.musicVolume ?? 30)) / 100 * 0.12;
      this.master!.gain.setValueAtTime(vol, this.ctx.currentTime);
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  start(mode: DungeonMusicMode = 'crawl') {
    this.mode = mode;
    const ctx = this.ensure();
    if (!ctx || this.running) return;
    this.running = true;
    this.step = 0;
    this.schedule();
  }

  setMode(mode: DungeonMusicMode) {
    this.mode = mode;
  }

  stop() {
    this.running = false;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule = () => {
    if (!this.running) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const scale = this.mode === 'boss'
      ? [55, 65.41, 73.42, 82.41, 98, 110]
      : this.mode === 'battle'
        ? [65.41, 77.78, 87.31, 98, 116.54, 130.81]
        : [49, 61.74, 73.42, 98, 123.47, 146.83];
    const beat = this.mode === 'boss' ? 130 : this.mode === 'battle' ? 115 : 155;
    const now = ctx.currentTime;
    const root = scale[this.step % scale.length];
    this.tone(root, now, 0.09, 'square', 0.18);
    if (this.step % 2 === 0) this.tone(root * 4, now + 0.04, 0.08, 'triangle', 0.08);
    if (this.step % 4 === 0) this.noise(now, 0.04, 0.12);
    if (this.step % 8 === 6) this.tone(root * 6, now + 0.08, 0.16, 'sawtooth', 0.06);
    this.step += 1;
    this.timer = window.setTimeout(this.schedule, beat);
  };

  private tone(freq: number, when: number, len: number, type: OscillatorType, gainValue: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'sawtooth' ? 1400 : 900, when);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(gainValue, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, when + len);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + len + 0.03);
  }

  private noise(when: number, len: number, gainValue: number) {
    if (!this.ctx || !this.master) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    src.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + len);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(when);
  }

  sfx(kind: DungeonSfx) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const settings = loadSettings();
    if (settings.soundEffectsMuted) return;
    const old = this.master.gain.value;
    this.master.gain.setValueAtTime(Math.max(old, (settings.soundEffectsVolume ?? 75) / 100 * 0.18), now);
    const map: Record<DungeonSfx, [number, number, OscillatorType]> = {
      hit: [120, 55, 'square'],
      crit: [880, 1320, 'sawtooth'],
      block: [80, 70, 'triangle'],
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
    this.tone(a, now, 0.12, type, 0.24);
    this.tone(b, now + 0.08, 0.12, type, 0.18);
    if (kind === 'crit' || kind === 'loot' || kind === 'coin') this.tone(b * 1.5, now + 0.16, 0.12, 'square', 0.12);
    if (kind === 'death' || kind === 'boss') this.noise(now, 0.35, 0.25);
  }
}

let instance: DungeonAudio | null = null;

export function getDungeonAudio(): DungeonAudio {
  if (!instance) instance = new DungeonAudio();
  return instance;
}

