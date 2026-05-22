import type { DungeonMusicMode } from './dungeonAudio';

export type DoctrineQuestion = {
  id: string;
  bossTheme: DungeonMusicMode | 'general';
  prompt: string;
  options: string[];
  answer: number;
  lesson: string;
};

export const DOCTRINE_QUESTIONS: DoctrineQuestion[] = [
  {
    id: 'failure_compounds', bossTheme: 'boss',
    prompt: 'Heavy barbell compound is already moving slow. What is the highest-signal hypertrophy call?',
    options: ['Grind every set to failure because failure is always superior.', 'Keep 1-3 reps in reserve, push closer mainly on safer isolation/last sets.', 'Cut ROM short so fatigue stays low.'],
    answer: 1,
    lesson: 'Failure is not magic; close proximity matters, but compounds punish sloppy fatigue. Save true failure for safer contexts.',
  },
  {
    id: 'rest_intervals', bossTheme: 'boss',
    prompt: 'Your next boss set needs high output. What rest choice best protects performance?',
    options: ['Rest only 20 seconds to maximize burn.', 'Use enough rest to repeat quality work; short rest is not automatically better for growth.', 'Skip rest entirely if music is hype.'],
    answer: 1,
    lesson: 'Recent rest-interval reviews do not support “shorter is always better”; quality volume still rules.',
  },
  {
    id: 'volume_recovery', bossTheme: 'general',
    prompt: 'You are sore, performance is dropping, and joints feel cooked. Best progression decision?',
    options: ['Add sets anyway because more volume always scales linearly.', 'Hold or reduce volume until performance/recovery returns, then progress.', 'Max out to test character.'],
    answer: 1,
    lesson: 'Volume has a dose response only inside recoverable limits. Past that, fatigue steals adaptation.',
  },
  {
    id: 'lengthened_partials', bossTheme: 'battle',
    prompt: 'For hypertrophy, where are partial reps most defensible if you use them?',
    options: ['Only the shortened/easy lockout range.', 'The lengthened/challenging range, usually as a tool rather than a religion.', 'Any random half rep as long as it burns.'],
    answer: 1,
    lesson: 'Lengthened-position loading appears promising; shortened partials are usually the weaker bargain.',
  },
  {
    id: 'specificity_strength', bossTheme: 'boss',
    prompt: 'You want a stronger 1RM squat. What choice best respects specificity?',
    options: ['Never lift heavy; only 30-rep pump sets.', 'Include practice with heavier loads and skillful execution while managing fatigue.', 'Change exercises every session so the body stays confused.'],
    answer: 1,
    lesson: 'Hypertrophy can support strength, but maximal strength also needs heavy, specific, technically stable practice.',
  },
  {
    id: 'rir_autoregulation', bossTheme: 'general',
    prompt: 'Warmups feel unexpectedly heavy today. Smart autoregulated move?',
    options: ['Adjust load/sets to keep target RIR and technique quality.', 'Ignore readiness; the spreadsheet is sacred.', 'Double caffeine and attempt a PR.'],
    answer: 0,
    lesson: 'Autoregulation exists because daily strength fluctuates. The target stimulus matters more than ego load.',
  },
  {
    id: 'exercise_selection', bossTheme: 'battle',
    prompt: 'A muscle is the goal, but joints hate the movement. Best advanced substitution logic?',
    options: ['Keep the painful lift because “optimal” is always mandatory.', 'Choose a stable movement that trains the target hard through useful ROM with less joint cost.', 'Remove all hard sets forever.'],
    answer: 1,
    lesson: 'Stimulus-to-fatigue and adherence matter. A slightly less famous lift you can load safely often wins.',
  },
  {
    id: 'deload_signal', bossTheme: 'boss',
    prompt: 'Boss aura: sleep down, motivation low, loads regressing. Best mesocycle call?',
    options: ['Deload/reduce fatigue, then rebuild.', 'Add forced reps on every set.', 'Switch to only one-rep maxes until morale improves.'],
    answer: 0,
    lesson: 'Accumulated fatigue can mask fitness. Strategic unloading is not weakness; it is how the next wave gets teeth.',
  },
  {
    id: 'protein_basics', bossTheme: 'general',
    prompt: 'The Protein Moon demands a recovery offering. Most defensible baseline?',
    options: ['Protein distribution and adequate daily intake support adaptation.', 'Protein timing is everything; daily intake barely matters.', 'Supplements replace training quality.'],
    answer: 0,
    lesson: 'Nutrition supports the signal; it does not replace progressive training, sleep, and enough protein across the day.',
  },
  {
    id: 'novelty_trap', bossTheme: 'shop',
    prompt: 'New exercise looks cool but you cannot track progression. Best call?',
    options: ['Rotate everything constantly.', 'Use novelty sparingly; keep enough stable lifts to measure overload.', 'Only do exercises that trend on social media.'],
    answer: 1,
    lesson: 'Variation is useful when it serves the plan. Too much novelty hides whether you are actually progressing.',
  },
  {
    id: 'warmup_logic', bossTheme: 'general',
    prompt: 'Before a heavy boss set, what warmup strategy is cleanest?',
    options: ['Fatigue yourself with many hard warmup sets.', 'Ramp gradually with low-fatigue practice sets that prepare the target load.', 'Skip warmups to conserve mana.'],
    answer: 1,
    lesson: 'Warmups should increase readiness without spending the work capacity reserved for the hard sets.',
  },
  {
    id: 'technique_failure', bossTheme: 'boss',
    prompt: 'Rep speed collapses and technique changes. What does the doctrine say?',
    options: ['Technique failure is a valid stop even if the muscle could flail more.', 'Keep going until the bar pins you.', 'Count assisted contortions as clean reps.'],
    answer: 0,
    lesson: 'A set can be over when the target stimulus turns into compensation and risk.',
  },
];

export function doctrineForSeed(seed: number): DoctrineQuestion {
  return DOCTRINE_QUESTIONS[Math.abs(Math.floor(seed)) % DOCTRINE_QUESTIONS.length];
}
