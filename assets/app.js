const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: true });
const lampCountEl = document.getElementById('lamp-count');
const mothCountEl = document.getElementById('moth-count');
const moodLabelEl = document.getElementById('mood-label');
const moonPhaseEl = document.getElementById('moon-phase');
const audioStateEl = document.getElementById('audio-state');
const performanceModeEl = document.getElementById('performance-mode');
const pulseValueEl = document.getElementById('pulse-value');
const sceneSeedEl = document.getElementById('scene-seed');
const verseEl = document.getElementById('verse');
const miniNoteEl = document.getElementById('mini-note');
const buttons = [...document.querySelectorAll('[data-action]')];
const humButton = document.querySelector('[data-action="hum"]');

const BASE_MOTHS = 42;
const BASE_LAMPS = 2;
const MAX_LAMPS = 9;
const STAR_COUNT = 260;
const DIM_SCALE = 0.58;
const MOON_PHASES = [
  'new',
  'waxing crescent',
  'first quarter',
  'waxing gibbous',
  'full',
  'waning gibbous',
  'last quarter',
  'waning crescent',
];
const ROOM_PHASES = ['hush', 'murmur', 'chorus', 'swarm'];
const PERFORMANCE_MODES = ['still', 'conducting'];
const POSTCARD_SIZE = { width: 1400, height: 900 };

const audio = {
  supported: Boolean(window.AudioContext || window.webkitAudioContext),
  context: null,
  enabled: false,
  master: null,
  filter: null,
  drone: null,
  overtone: null,
  droneGain: null,
  overtoneGain: null,
};

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  seed: '',
  rng: null,
  dim: false,
  moon: 0,
  pulse: 0,
  resonance: 0,
  roomPhase: 'hush',
  clockOffset: 0,
  lamps: [],
  moths: [],
  stars: [],
  trails: [],
  pointer: { x: 0, y: 0, active: false, down: null },
  lastVerseAt: 0,
  verse: '',
  titlePulse: 0,
  performanceMode: 'still',
  lastTrailAt: 0,
};

let animationFrameId = null;

const openers = [
  'The room is',
  'The dark keeps',
  'Every wingbeat',
  'Somewhere under the lamp, the night is',
  'The choir is',
  'Your shadow is making the lamps',
];

const verbs = [
  'breathing',
  'listening',
  'tilting',
  'gathering',
  'humming',
  'leaning',
  'remembering',
  'stitching itself'
];

const nouns = [
  'around the amber seam',
  'through the dust halo',
  'into the soft brass',
  'toward the brightest pulse',
  'like a prayer with wings',
  'around the warmest stitch in the dark',
  'where the room goes almost kind'
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapLines(text, maxChars, maxLines) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) {
        break;
      }
    } else {
      current = candidate;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  const original = words.join(' ');
  const joined = lines.join(' ');
  if (lines.length && joined.length < original.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\s+$/, '')}…`;
  }

  return lines;
}

function hashSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  return mulberry32(hashSeed(seed));
}

function choose(rng, items) {
  return items[Math.floor(rng() * items.length) % items.length];
}

function makeSeed() {
  const raw = Math.floor((Date.now() + Math.random() * 100000) % 1e9).toString(36);
  return `night-${raw}`;
}

function readConfig() {
  const params = new URLSearchParams(location.search);
  const seed = params.get('seed') || makeSeed();
  const lamps = clamp(Number.parseInt(params.get('lamps') || '', 10) || BASE_LAMPS, 1, MAX_LAMPS);
  const moths = clamp(Number.parseInt(params.get('moths') || '', 10) || BASE_MOTHS, 18, 84);
  const dim = params.get('dim') === '1';
  const moon = clamp(Number.parseInt(params.get('moon') || '', 10) || 0, 0, MOON_PHASES.length - 1);
  const mode = PERFORMANCE_MODES.includes(params.get('mode')) ? params.get('mode') : PERFORMANCE_MODES[0];
  return { seed, lamps, moths, dim, moon, mode };
}

function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set('seed', state.seed);
  url.searchParams.set('lamps', String(Math.min(state.lamps.filter((lamp) => !lamp.cursor).length, MAX_LAMPS)));
  url.searchParams.set('moths', String(state.moths.length));
  url.searchParams.set('dim', state.dim ? '1' : '0');
  url.searchParams.set('moon', String(state.moon));
  url.searchParams.set('mode', state.performanceMode);
  history.replaceState(null, '', url);
}

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  seedStars();
  if (!state.lamps.length) {
    resetScene(false);
  }
}

function seedStars() {
  const rng = makeRng(`${state.seed}:stars`);
  state.stars = Array.from({ length: STAR_COUNT }, () => ({
    x: rng() * state.width,
    y: rng() * state.height * 0.84,
    r: 0.4 + rng() * 1.5,
    a: 0.1 + rng() * 0.65,
    wobble: rng() * Math.PI * 2,
  }));
}

function makeLamp(x, y, permanent = false, power = 1) {
  return {
    x,
    y,
    power,
    warmth: 0.72 + state.rng() * 0.35,
    life: permanent ? Number.POSITIVE_INFINITY : 12 + state.rng() * 12,
    permanent,
    cursor: false,
  };
}

function makeMoth(index) {
  const edge = index % 4;
  const margin = 40;
  const x = edge === 0 ? -margin - state.rng() * 80 : edge === 1 ? state.width + margin + state.rng() * 80 : state.rng() * state.width;
  const y = edge === 2 ? -margin - state.rng() * 80 : edge === 3 ? state.height + margin + state.rng() * 80 : state.rng() * state.height * 0.82;
  const tone = state.rng();
  return {
    x,
    y,
    vx: (state.rng() - 0.5) * 1.4,
    vy: (state.rng() - 0.5) * 1.4,
    wing: state.rng() * Math.PI * 2,
    tone,
    phase: state.rng() * Math.PI * 2,
    glow: 0.25 + tone * 0.35,
    trail: [],
  };
}

function updateSceneTone(time) {
  const lampPower = state.lamps
    .filter((lamp) => !lamp.cursor)
    .reduce((sum, lamp) => sum + lamp.power, 0);
  const trailPower = state.trails.reduce((sum, trail) => sum + trail.energy, 0);
  const moonLift = state.moon === 4 ? 0.16 : (state.moon / Math.max(MOON_PHASES.length - 1, 1)) * 0.12;
  const breath = 0.5 + 0.5 * Math.sin(time * 0.00055 + state.clockOffset);
  const lampTerm = clamp(lampPower / 7.5, 0, 1);
  const mothTerm = clamp(state.moths.length / 84, 0, 1);
  const trailTerm = clamp(trailPower / 20, 0, 1);

  state.pulse = clamp(0.14 + breath * 0.38 + lampTerm * 0.24 + trailTerm * 0.2 + moonLift + (state.pointer.active ? 0.06 : 0), 0, 1);
  state.resonance = clamp(lampTerm * 0.34 + mothTerm * 0.28 + trailTerm * 0.42 + state.pulse * 0.26, 0, 1);
  state.roomPhase = trailTerm > 0.48 || state.resonance > 0.78 || state.moths.length > 68
    ? ROOM_PHASES[3]
    : state.resonance > 0.58 || lampPower > 5
      ? ROOM_PHASES[2]
      : state.resonance > 0.34
        ? ROOM_PHASES[1]
        : ROOM_PHASES[0];
}

function resetScene(advanceSeed = true) {
  const config = readConfig();
  if (advanceSeed || !state.seed) {
    state.seed = advanceSeed ? makeSeed() : state.seed || makeSeed();
  }
  state.rng = makeRng(state.seed);
  state.clockOffset = (hashSeed(state.seed) / 0xffffffff) * Math.PI * 2;
  state.dim = config.dim;
  state.moon = config.moon;
  state.performanceMode = config.mode;
  state.lamps = [];
  state.moths = [];
  state.trails = [];
  for (let i = 0; i < config.moths; i += 1) {
    state.moths.push(makeMoth(i));
  }
  const centerX = state.width * 0.51;
  const centerY = state.height * 0.46;
  const ring = Math.min(state.width, state.height) * 0.18;
  for (let i = 0; i < config.lamps; i += 1) {
    const angle = (i / Math.max(config.lamps, 1)) * Math.PI * 2 - Math.PI / 2;
    const jitter = (state.rng() - 0.5) * ring * 0.6;
    state.lamps.push(
      makeLamp(
        centerX + Math.cos(angle) * (ring + jitter),
        centerY + Math.sin(angle) * (ring * 0.38 + jitter * 0.4),
        i === 0,
        1 + state.rng() * 0.6,
      ),
    );
  }
  state.pointer.active = false;
  updateSceneTone(performance.now());
  updateLabels();
  refreshVerse(true);
  miniNoteEl.textContent = 'A fresh night has been cued. The moths are already arguing with the lanterns.';
  syncUrl();
}

function addLamp(x, y, power = 1.1) {
  const lamps = state.lamps.filter((lamp) => !lamp.cursor);
  if (lamps.length >= MAX_LAMPS) {
    lamps.shift();
  }
  lamps.push(makeLamp(x, y, false, power));
  state.lamps = lamps;
  state.titlePulse = performance.now();
  updateLabels();
  refreshVerse(true);
  syncUrl();
}

function laySignalPoint(x, y, energy = 1, force = false) {
  const last = state.trails[state.trails.length - 1];
  if (!force && last) {
    const dx = x - last.x;
    const dy = y - last.y;
    if (dx * dx + dy * dy < 196) {
      return null;
    }
  }

  const now = performance.now();
  const point = {
    x,
    y,
    energy: clamp(energy, 0.18, 1.2),
    life: 2.4 + state.rng() * 1.8,
    maxLife: 0,
    bornAt: now,
    phase: state.rng() * Math.PI * 2,
  };
  point.maxLife = point.life;

  state.trails.push(point);
  if (state.trails.length > 72) {
    state.trails.shift();
  }
  state.lastTrailAt = now;
  state.titlePulse = now;
  return point;
}

function makeCursorLamp() {
  if (!state.pointer.active) {
    return null;
  }
  return {
    x: state.pointer.x,
    y: state.pointer.y,
    power: 1.5,
    warmth: 0.9,
    life: Number.POSITIVE_INFINITY,
    cursor: true,
    permanent: false,
  };
}

function scatterMoths() {
  for (const moth of state.moths) {
    const side = Math.floor(state.rng() * 4);
    const margin = 50;
    moth.x = side === 0 ? -margin : side === 1 ? state.width + margin : state.rng() * state.width;
    moth.y = side === 2 ? -margin : side === 3 ? state.height + margin : state.rng() * state.height * 0.82;
    moth.vx = (state.rng() - 0.5) * 2.2;
    moth.vy = (state.rng() - 0.5) * 2.2;
    moth.phase = state.rng() * Math.PI * 2;
    moth.trail.length = 0;
  }
  miniNoteEl.textContent = 'The swarm has been shaken loose. It will reassemble around the next warm thing that moves.';
  refreshVerse(true);
}

function updateTrails(dt, now) {
  state.trails = state.trails.filter((trail) => {
    trail.life -= dt * (state.performanceMode === 'conducting' ? 0.17 : 0.24);
    trail.energy = clamp(trail.life / Math.max(trail.maxLife, 0.6), 0.12, 1);
    trail.phase += dt * (1.4 + trail.energy * 1.8);
    return trail.life > 0;
  });

  if (state.performanceMode === 'conducting' && state.pointer.active && now - state.lastTrailAt > 110) {
    laySignalPoint(state.pointer.x, state.pointer.y, 0.95, true);
  }
}

function toggleDim() {
  state.dim = !state.dim;
  updateLabels();
  refreshVerse(true);
  syncUrl();
}

function updateLabels() {
  lampCountEl.textContent = String(state.lamps.filter((lamp) => !lamp.cursor).length);
  mothCountEl.textContent = String(state.moths.length);
  moodLabelEl.textContent = state.dim
    ? 'hushed'
    : state.roomPhase === ROOM_PHASES[3]
      ? 'radiant'
      : state.roomPhase === ROOM_PHASES[2]
        ? 'thrumming'
        : state.roomPhase === ROOM_PHASES[1]
          ? 'glimmer'
          : 'breathing';
  moonPhaseEl.textContent = MOON_PHASES[state.moon];
  if (performanceModeEl) {
    performanceModeEl.textContent = state.performanceMode;
  }
  pulseValueEl.textContent = `${Math.round(state.pulse * 100)}%`;
  audioStateEl.textContent = audio.supported
    ? (audio.context ? (audio.enabled ? 'humming' : 'silent') : 'silent')
    : 'unavailable';
  sceneSeedEl.textContent = state.seed;
  if (humButton) {
    humButton.textContent = audio.enabled ? 'Mute hum' : 'Wake hum';
    humButton.setAttribute('aria-pressed', String(audio.enabled));
    humButton.disabled = !audio.supported;
  }
  const conductButton = document.querySelector('[data-action="conduct"]');
  if (conductButton) {
    conductButton.textContent = state.performanceMode === 'conducting' ? 'Conducting' : 'Conduct';
    conductButton.setAttribute('aria-pressed', String(state.performanceMode === 'conducting'));
  }
}

function ensureAudio() {
  if (audio.context) {
    return audio;
  }

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    miniNoteEl.textContent = 'Your browser does not expose Web Audio, so the choir will stay visual tonight.';
    return null;
  }

  const context = new AudioCtor();
  const master = context.createGain();
  const filter = context.createBiquadFilter();
  const droneGain = context.createGain();
  const overtoneGain = context.createGain();
  const drone = context.createOscillator();
  const overtone = context.createOscillator();

  filter.type = 'lowpass';
  filter.frequency.value = 440;
  filter.Q.value = 0.9;

  drone.type = 'triangle';
  drone.frequency.value = 46;
  droneGain.gain.value = 0.8;

  overtone.type = 'sine';
  overtone.frequency.value = 92;
  overtoneGain.gain.value = 0.22;

  drone.connect(droneGain);
  overtone.connect(overtoneGain);
  droneGain.connect(filter);
  overtoneGain.connect(filter);
  filter.connect(master);
  master.connect(context.destination);
  drone.start();
  overtone.start();

  audio.context = context;
  audio.master = master;
  audio.filter = filter;
  audio.drone = drone;
  audio.overtone = overtone;
  audio.droneGain = droneGain;
  audio.overtoneGain = overtoneGain;
  return audio;
}

async function toggleHum() {
  const engine = ensureAudio();
  if (!engine) {
    return;
  }

  audio.enabled = !audio.enabled;
  if (audio.enabled) {
    await audio.context.resume();
    miniNoteEl.textContent = 'The choir has started humming under the lamps.';
  } else {
    await audio.context.suspend();
    miniNoteEl.textContent = 'The hum has been muted, but the room remembers the note.';
  }
  updateLabels();
  syncUrl();
}

function updateAudio(now) {
  if (!audio.context || !audio.enabled) {
    return;
  }

  const time = now / 1000;
  const lampCount = state.lamps.filter((lamp) => !lamp.cursor).length;
  const trailEnergy = clamp(state.trails.reduce((sum, trail) => sum + trail.energy, 0) / 18, 0, 1);
  const targetGain = clamp(0.008 + state.pulse * 0.02 + lampCount * 0.0015 + state.resonance * 0.007 + trailEnergy * 0.006, 0.008, 0.05);
  const droneFreq = 42 + lampCount * 1.6 + state.moon * 1.7 + state.resonance * 3.5 + trailEnergy * 6;

  audio.master.gain.setTargetAtTime(targetGain, time, 0.03);
  audio.filter.frequency.setTargetAtTime(360 + lampCount * 52 + state.moon * 20 + state.pulse * 140, time, 0.05);
  audio.filter.Q.setTargetAtTime(0.8 + state.resonance * 1.1, time, 0.05);
  audio.drone.frequency.setTargetAtTime(droneFreq, time, 0.05);
  audio.overtone.frequency.setTargetAtTime(droneFreq * 2.01, time, 0.05);
  audioStateEl.textContent = 'humming';
}

function refreshVerse(force = false) {
  const now = performance.now();
  if (!force && now - state.lastVerseAt < 4200) {
    return;
  }

  state.lastVerseAt = now;
  const lampCount = state.lamps.filter((lamp) => !lamp.cursor).length;
  const mothCount = state.moths.length;
  const moonLine = state.moon === 4
    ? 'the full moon has joined the performance'
    : state.moon === 0
      ? 'the moon is pretending not to be there'
      : `the moon is ${MOON_PHASES[state.moon]} and still listening`;
  const pulseLine = state.pulse > 0.75
    ? 'the room is breathing fast enough to sound like a chord'
    : state.pulse > 0.5
      ? 'the room is holding a warm, steady pulse'
      : 'the room is still finding its pulse';
  const modeLine = state.performanceMode === 'conducting'
    ? 'you are drawing the score through the dark'
    : 'the room is waiting for a hand to conduct it';
  const trailLine = state.trails.length > 0
    ? `${state.trails.length} ember marks are lingering in the air`
    : 'no score marks are hanging in the room yet';
  const phaseLine = state.roomPhase === ROOM_PHASES[3]
    ? 'the swarm has gone almost ceremonial'
    : state.roomPhase === ROOM_PHASES[2]
      ? 'the lamp halos are starting to overlap'
      : state.roomPhase === ROOM_PHASES[1]
        ? 'the moths are tightening their circles'
        : 'the night is keeping its distance';
  const opener = choose(state.rng, openers);
  const verb = choose(state.rng, verbs);
  const noun = choose(state.rng, nouns);
  const middle = lampCount > 4
    ? 'the room has become a little cathedral of light'
    : 'the lanterns are only just starting to learn each other';
  const ending = mothCount > 55
    ? 'and the ceiling is beginning to sound crowded'
    : 'and the wings keep the quiet from hardening';
  state.verse = `${opener} ${verb} ${noun}; ${middle}, ${pulseLine}, ${phaseLine}, ${moonLine}, ${modeLine}, ${trailLine}, ${ending}.`;
  verseEl.textContent = state.verse;
}

function updateMoths(dt, now) {
  const lamps = state.lamps.map((lamp) => ({ ...lamp }));
  for (const trail of state.trails) {
    lamps.push({
      x: trail.x,
      y: trail.y,
      power: 0.42 + trail.energy * 0.82,
      warmth: 0.56 + trail.energy * 0.18,
    });
  }
  const cursorLamp = makeCursorLamp();
  if (cursorLamp) {
    lamps.push(cursorLamp);
  }
  const moonLamp = getMoonLamp();
  if (moonLamp.power > 0) {
    lamps.push(moonLamp);
  }

  for (const moth of state.moths) {
    let bestLamp = null;
    let bestScore = -Infinity;
    let secondLamp = null;
    let secondScore = -Infinity;
    for (const lamp of lamps) {
      const dx = lamp.x - moth.x;
      const dy = lamp.y - moth.y;
      const distSq = dx * dx + dy * dy + 120;
      const score = (lamp.power * 1200) / distSq;
      if (score > bestScore) {
        secondScore = bestScore;
        secondLamp = bestLamp;
        bestScore = score;
        bestLamp = lamp;
      } else if (score > secondScore) {
        secondScore = score;
        secondLamp = lamp;
      }
    }

    if (!bestLamp) {
      bestLamp = {
        x: state.width * 0.5,
        y: state.height * 0.45,
        power: 0.8,
        warmth: 0.6,
      };
    }

    moth.glow = clamp(0.22 + bestLamp.power * 0.14 + state.resonance * 0.24, 0.18, 0.88);

    const dx = bestLamp.x - moth.x;
    const dy = bestLamp.y - moth.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const pulseLift = 0.78 + state.pulse * 0.78;
    const swirl = state.dim ? 0.045 : 0.075 + state.resonance * 0.02;
    const pull = clamp((bestLamp.power * 170 * pulseLift) / (dist * dist + 120), 0.014, state.dim ? 0.18 : 0.3);
    const orbit = (bestLamp.power * 0.14) + moth.tone * 0.08 + state.pulse * 0.05;

    moth.vx += nx * pull * dt * 60;
    moth.vy += ny * pull * dt * 60;
    moth.vx += -ny * orbit * swirl * dt * 60;
    moth.vy += nx * orbit * swirl * dt * 60;

    if (dist < 72) {
      moth.vx += -ny * 0.03 * dt * 60;
      moth.vy += nx * 0.03 * dt * 60;
    }

    if (secondLamp && secondScore > bestScore * 0.6) {
      const bridgeX = (bestLamp.x + secondLamp.x) * 0.5;
      const bridgeY = (bestLamp.y + secondLamp.y) * 0.5;
      const bridgeDx = bridgeX - moth.x;
      const bridgeDy = bridgeY - moth.y;
      const bridgeDist = Math.hypot(bridgeDx, bridgeDy) || 1;
      const bridgePull = clamp((secondScore / (bestScore + 0.001)) * 0.018 * (0.6 + state.pulse), 0.004, 0.024);
      moth.vx += (bridgeDx / bridgeDist) * bridgePull * dt * 60;
      moth.vy += (bridgeDy / bridgeDist) * bridgePull * dt * 60;
    }

    const wingWander = Math.sin(now * 0.0015 + moth.phase) * 0.0024;
    moth.vx += -ny * wingWander * dt * 60;
    moth.vy += nx * wingWander * dt * 60;

    const edgeX = Math.min(moth.x, state.width - moth.x);
    const edgeY = Math.min(moth.y, state.height - moth.y);
    if (edgeX < 52) {
      moth.vx += (moth.x < state.width * 0.5 ? 1 : -1) * (0.028 + state.pulse * 0.014) * dt * 60;
    }
    if (edgeY < 52) {
      moth.vy += (moth.y < state.height * 0.5 ? 1 : -1) * (0.024 + state.pulse * 0.012) * dt * 60;
    }

    moth.vx *= state.dim ? 0.992 : 0.989;
    moth.vy *= state.dim ? 0.992 : 0.989;

    const maxSpeed = state.dim ? 2.4 : 3.1 + state.resonance * 0.35;
    const speed = Math.hypot(moth.vx, moth.vy);
    if (speed > maxSpeed) {
      moth.vx = (moth.vx / speed) * maxSpeed;
      moth.vy = (moth.vy / speed) * maxSpeed;
    }

    moth.x += moth.vx * dt * 60;
    moth.y += moth.vy * dt * 60;
    moth.wing += dt * (8 + moth.tone * 4);

    const margin = 80;
    if (moth.x < -margin) moth.x = state.width + margin;
    if (moth.x > state.width + margin) moth.x = -margin;
    if (moth.y < -margin) moth.y = state.height + margin * 0.55;
    if (moth.y > state.height + margin) moth.y = -margin * 0.55;

    moth.trail.push({ x: moth.x, y: moth.y });
    if (moth.trail.length > 8) {
      moth.trail.shift();
    }
  }
}

function drawSky(time) {
  ctx.clearRect(0, 0, state.width, state.height);

  const sky = ctx.createLinearGradient(0, 0, 0, state.height);
  sky.addColorStop(0, state.resonance > 0.7 ? '#090914' : '#070810');
  sky.addColorStop(0.45, state.dim ? '#04050a' : state.resonance > 0.55 ? '#050611' : '#03050a');
  sky.addColorStop(1, '#010204');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, state.width, state.height);

  const beam = ctx.createLinearGradient(state.width * 0.82, state.height * 0.05, state.width * 0.44, state.height * 0.92);
  beam.addColorStop(0, `rgba(255, 240, 206, ${0.02 + state.pulse * 0.015})`);
  beam.addColorStop(0.35, `rgba(255, 218, 146, ${0.012 + state.resonance * 0.016})`);
  beam.addColorStop(0.62, `rgba(164, 150, 255, ${0.018 + state.pulse * 0.01})`);
  beam.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  const mist = ctx.createRadialGradient(
    state.pointer.active ? state.pointer.x : state.width * 0.48,
    state.pointer.active ? state.pointer.y * 0.92 : state.height * 0.36,
    30,
    state.width * 0.5,
    state.height * 0.45,
    Math.max(state.width, state.height) * 0.85,
  );
  mist.addColorStop(0, `rgba(133, 104, 255, ${state.dim ? 0.045 : 0.07 + state.pulse * 0.04})`);
  mist.addColorStop(0.34, `rgba(207, 148, 69, ${0.035 + state.resonance * 0.025})`);
  mist.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, 0, state.width, state.height);

  const floorGlow = ctx.createRadialGradient(state.width * 0.5, state.height * 0.88, 0, state.width * 0.5, state.height * 0.92, Math.max(state.width, state.height) * 0.72);
  floorGlow.addColorStop(0, `rgba(0, 0, 0, 0)`);
  floorGlow.addColorStop(0.5, `rgba(0, 0, 0, ${state.dim ? 0.16 : 0.1})`);
  floorGlow.addColorStop(1, `rgba(0, 0, 0, ${state.dim ? 0.48 : 0.36})`);
  ctx.fillStyle = floorGlow;
  ctx.fillRect(0, 0, state.width, state.height);

  drawMoon(time);

  for (const star of state.stars) {
    const twinkle = 0.3 + Math.sin(time * 0.0007 + star.wobble + state.clockOffset) * (0.18 + state.pulse * 0.12);
    ctx.fillStyle = `rgba(247, 236, 210, ${star.a * twinkle})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y + Math.sin(time * 0.0004 + star.wobble) * 0.5, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function getMoonLamp() {
  const phase = state.moon;
  const power = 0.18 + (phase === 0 ? 0 : phase === 4 ? 1 : 0.14 + Math.sin((phase / 7) * Math.PI) * 0.42);
  return {
    x: state.width * 0.81,
    y: state.height * 0.17,
    power,
    warmth: phase === 4 ? 0.78 : 0.52,
  };
}

function drawMoon(time) {
  const moon = getMoonLamp();
  const phase = state.moon / (MOON_PHASES.length - 1);
  const glowRadius = 116 + moon.power * 42 + state.pulse * 20;
  const glow = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, glowRadius);
  glow.addColorStop(0, `rgba(242, 237, 255, ${0.14 + moon.power * 0.3 + state.pulse * 0.03})`);
  glow.addColorStop(0.26, `rgba(210, 198, 255, ${0.11 + moon.power * 0.18 + state.resonance * 0.02})`);
  glow.addColorStop(0.72, 'rgba(180, 170, 230, 0.05)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(moon.x, moon.y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(moon.x, moon.y);
  ctx.rotate(Math.sin(time * 0.0003 + state.clockOffset) * (0.05 + state.pulse * 0.02));
  ctx.shadowBlur = 28;
  ctx.shadowColor = 'rgba(224, 214, 255, 0.6)';
  ctx.fillStyle = 'rgba(236, 231, 255, 0.96)';
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(4, 5, 10, 0.76)';
  ctx.beginPath();
  ctx.arc((phase - 0.5) * 20, 0, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLamp(lamp, time, isCursor = false) {
  const glowRadius = isCursor ? 138 : 166 * lamp.power + state.pulse * 24;
  const coreRadius = isCursor ? 5 : 6 + lamp.power * 3 + state.resonance * 0.6;
  const pulse = 1 + Math.sin(time * 0.002 + lamp.x * 0.01 + state.clockOffset) * (0.03 + state.pulse * 0.03);
  const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, glowRadius);
  const amber = lamp.warmth || 0.8;
  glow.addColorStop(0, `rgba(255, 243, 214, ${0.28 * pulse})`);
  glow.addColorStop(0.16, `rgba(255, 202, 121, ${0.26 * amber + state.pulse * 0.045})`);
  glow.addColorStop(0.52, `rgba(233, 146, 79, ${0.16 * amber + state.resonance * 0.045})`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lamp.x, lamp.y, glowRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(lamp.x, lamp.y);
  ctx.shadowBlur = 18;
  ctx.shadowColor = `rgba(255, 202, 118, ${0.65 * amber})`;
  ctx.fillStyle = `rgba(255, 214, 147, ${isCursor ? 0.9 : 0.85})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, coreRadius + 6, coreRadius + 3, Math.sin(time * 0.001 + lamp.power) * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isCursor ? 'rgba(255, 253, 244, 0.92)' : 'rgba(255, 224, 179, 0.95)';
  ctx.beginPath();
  ctx.ellipse(0, 0, coreRadius, coreRadius * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 225, 177, ${0.12 + state.pulse * 0.18})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, coreRadius + 11 + state.pulse * 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMoth(moth, time) {
  const angle = Math.atan2(moth.vy, moth.vx);
  const wingOpen = 0.68 + Math.sin(time * 0.014 + moth.phase + state.clockOffset) * (0.24 + state.pulse * 0.1);
  const bodyAlpha = state.dim ? 0.74 : 0.9;
  const wingTint = moth.tone > 0.5 ? '218, 193, 255' : '255, 225, 188';

  if (moth.trail.length > 1) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(${wingTint}, ${0.05 + moth.glow * 0.08})`;
    ctx.beginPath();
    moth.trail.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(moth.x, moth.y);
  ctx.rotate(angle + Math.PI * 0.5);
  ctx.shadowBlur = state.dim ? 4 : 10 + state.resonance * 6;
  ctx.shadowColor = `rgba(${wingTint}, ${0.25 + moth.glow * 0.18})`;

  ctx.fillStyle = `rgba(${wingTint}, ${0.18 * bodyAlpha})`;
  ctx.beginPath();
  ctx.ellipse(-5, -1, 9 * wingOpen, 17 * wingOpen, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(5, -1, 9 * wingOpen, 17 * wingOpen, 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(24, 16, 10, ${0.65 * bodyAlpha})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(0, 10);
  ctx.stroke();

  ctx.fillStyle = `rgba(20, 15, 12, ${bodyAlpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 2.6, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 231, 192, ${0.65 * bodyAlpha})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(-5.5, -16);
  ctx.moveTo(0, -10);
  ctx.lineTo(5.5, -16);
  ctx.stroke();

  ctx.restore();
}

function drawTrails(time) {
  if (!state.trails.length) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  state.trails.forEach((trail, index) => {
    const wobble = Math.sin(time * 0.002 + trail.phase) * (4 + trail.energy * 5);
    const x = trail.x + wobble * 0.3;
    const y = trail.y + Math.cos(time * 0.0022 + trail.phase) * (2 + trail.energy * 3);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = `rgba(205, 186, 255, ${0.08 + state.resonance * 0.14})`;
  ctx.lineWidth = 3 + state.resonance * 4;
  ctx.shadowBlur = 18;
  ctx.shadowColor = 'rgba(175, 154, 255, 0.45)';
  ctx.stroke();

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = `rgba(255, 216, 149, ${0.12 + state.pulse * 0.14})`;
  ctx.stroke();

  for (const trail of state.trails) {
    const halo = 8 + trail.energy * 22;
    const flicker = 0.6 + Math.sin(time * 0.006 + trail.phase) * 0.16;
    const glow = ctx.createRadialGradient(trail.x, trail.y, 0, trail.x, trail.y, halo);
    glow.addColorStop(0, `rgba(255, 241, 217, ${0.18 * flicker})`);
    glow.addColorStop(0.25, `rgba(255, 209, 133, ${0.24 * trail.energy})`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(trail.x, trail.y, halo, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawScene(time) {
  drawSky(time);

  const ambient = state.dim ? 0.055 : 0.09;
  ctx.fillStyle = `rgba(0, 0, 0, ${ambient})`;
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const pulseX = state.pointer.active ? state.pointer.x : state.width * 0.52;
  const pulseY = state.pointer.active ? state.pointer.y : state.height * 0.44;
  const pulseGlow = ctx.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, Math.max(state.width, state.height) * (0.22 + state.pulse * 0.12));
  pulseGlow.addColorStop(0, `rgba(255, 214, 167, ${0.04 + state.pulse * 0.08})`);
  pulseGlow.addColorStop(0.45, `rgba(156, 138, 255, ${0.03 + state.resonance * 0.05})`);
  pulseGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = pulseGlow;
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  drawTrails(time);

  for (const lamp of state.lamps) {
    if (lamp.cursor) {
      continue;
    }
    drawLamp(lamp, time, false);
  }

  if (state.pointer.active) {
    drawLamp(makeCursorLamp(), time, true);
  }

  for (const moth of state.moths) {
    drawMoth(moth, time);
  }

  const vignette = ctx.createRadialGradient(state.width * 0.5, state.height * 0.48, Math.min(state.width, state.height) * 0.1, state.width * 0.5, state.height * 0.5, Math.max(state.width, state.height) * 0.84);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.58, 'rgba(0, 0, 0, 0.02)');
  vignette.addColorStop(1, `rgba(0, 0, 0, ${state.dim ? 0.34 : 0.28})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, state.width, state.height);
}

function updateLamps(dt) {
  state.lamps = state.lamps
    .filter((lamp) => lamp.cursor || lamp.permanent || lamp.life > 0.05)
    .map((lamp) => {
      if (!lamp.permanent && !lamp.cursor) {
        lamp.life -= dt * (state.dim ? 0.5 : 0.35);
        lamp.power = clamp(lamp.power * 0.999, 0.55, 1.65);
      }
      return lamp;
    });
}

function animate(time) {
  if (document.hidden) {
    animationFrameId = null;
    animate.lastTime = null;
    return;
  }

  const now = time || performance.now();
  const dt = clamp((now - (animate.lastTime || now)) / 1000, 0.001, 0.032);
  animate.lastTime = now;

  updateLamps(dt);
  updateTrails(dt, now);
  updateSceneTone(now);
  updateMoths(dt, now);
  updateAudio(now);
  if (now - state.lastVerseAt > 4600) {
    refreshVerse();
  }
  updateLabels();
  drawScene(now);
  animationFrameId = requestAnimationFrame(animate);
}

function startAnimation() {
  if (animationFrameId !== null || document.hidden) {
    return;
  }

  animationFrameId = requestAnimationFrame(animate);
}

function stopAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  animate.lastTime = null;
}

function handlePointerMove(event) {
  const rect = canvas.getBoundingClientRect();
  state.pointer.x = event.clientX - rect.left;
  state.pointer.y = event.clientY - rect.top;
  state.pointer.active = true;
  if (state.pointer.down) {
    const dx = state.pointer.x - state.pointer.down.x;
    const dy = state.pointer.y - state.pointer.down.y;
    if (dx * dx + dy * dy > 144) {
      state.pointer.down.moved = true;
    }
    if (state.performanceMode === 'conducting') {
      const moved = dx * dx + dy * dy;
      const elapsed = performance.now() - state.lastTrailAt;
      if (moved > 144 || elapsed > 110) {
        laySignalPoint(state.pointer.x, state.pointer.y, 0.82 + state.rng() * 0.28);
      }
    }
  }
}

function handlePointerLeave() {
  if (!state.pointer.down) {
    state.pointer.active = false;
  }
}

function handlePointerDown(event) {
  if (event.button != null && event.button !== 0) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  state.pointer.x = event.clientX - rect.left;
  state.pointer.y = event.clientY - rect.top;
  state.pointer.active = true;
  state.pointer.down = {
    id: event.pointerId,
    type: event.pointerType || 'mouse',
    x: state.pointer.x,
    y: state.pointer.y,
    moved: false,
    startedAt: performance.now(),
  };

  if (canvas.setPointerCapture) {
    canvas.setPointerCapture(event.pointerId);
  }

  if (state.performanceMode === 'conducting') {
    laySignalPoint(state.pointer.x, state.pointer.y, 1, true);
  }
}

function handlePointerUp(event) {
  const session = state.pointer.down;
  if (session && event.pointerId !== session.id) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  state.pointer.x = event.clientX - rect.left;
  state.pointer.y = event.clientY - rect.top;

  const wasTap = !session || !session.moved || session.type === 'mouse';
  if (wasTap) {
    addLamp(state.pointer.x, state.pointer.y, 1.08 + state.rng() * 0.22);
    miniNoteEl.textContent = 'A new lamp has entered the room. The moths are rerouting their tiny lives around it.';
  } else if (state.performanceMode === 'conducting') {
    miniNoteEl.textContent = 'The score has been drawn into the room. The moths are following the trail like a thin prophecy.';
  }

  state.pointer.active = false;
  state.pointer.down = null;

  if (canvas.releasePointerCapture && session) {
    try {
      canvas.releasePointerCapture(session.id);
    } catch (error) {
      // The capture may already be gone if the browser canceled the pointer.
    }
  }
}

async function copySceneLink() {
  const url = new URL(location.href);
  url.searchParams.set('seed', state.seed);
  url.searchParams.set('lamps', String(Math.min(state.lamps.filter((lamp) => !lamp.cursor).length, MAX_LAMPS)));
  url.searchParams.set('moths', String(state.moths.length));
  url.searchParams.set('dim', state.dim ? '1' : '0');
  url.searchParams.set('moon', String(state.moon));
  url.searchParams.set('mode', state.performanceMode);
  try {
    await navigator.clipboard.writeText(url.toString());
    miniNoteEl.textContent = 'Scene link copied. The exact number of moths and lamps now has a paper trail.';
  } catch (error) {
    miniNoteEl.textContent = 'Copy failed. Your browser refused to hand over the tiny spell, but the scene is still alive.';
  }
}

function getSceneCounts() {
  return {
    lamps: state.lamps.filter((lamp) => !lamp.cursor).length,
    moths: state.moths.length,
  };
}

function sceneArtifactName() {
  const safeSeed = state.seed.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const modeSuffix = state.performanceMode === 'conducting' ? '-score' : '';
  return `moth-choir${modeSuffix}-${safeSeed || 'night'}.svg`;
}

function buildSceneArtifact() {
  const { width, height } = POSTCARD_SIZE;
  const currentWidth = Math.max(state.width, 1);
  const currentHeight = Math.max(state.height, 1);
  const scaleX = width / currentWidth;
  const scaleY = height / currentHeight;
  const scale = Math.min(scaleX, scaleY);
  const lampScale = Math.max(0.75, scale * 1.05);
  const mothScale = Math.max(0.62, scale * 0.9);
  const { lamps, moths } = getSceneCounts();
  const verseLines = wrapLines(state.verse || 'The room is waking in brass and shadow.', 38, 5);
  const detailLines = [
    `seed ${state.seed}`,
    `${state.performanceMode} mode`,
    `${lamps} lamp${lamps === 1 ? '' : 's'} lit`,
    `${moths} moth${moths === 1 ? '' : 's'} in the air`,
    `${state.trails.length} score mark${state.trails.length === 1 ? '' : 's'}`,
    `${MOON_PHASES[state.moon]} moon`,
    `${state.roomPhase} room`,
  ];
  const safeWidth = width - 72;
  const moonX = 1018;
  const moonY = 148;
  const moonPower = getMoonLamp().power;
  const moonRadius = 92 + moonPower * 22;
  const title = 'Moth Choir';
  const subtitle = state.performanceMode === 'conducting' ? 'live conducting score artifact' : 'preserved scene artifact';
  const trailPath = state.trails
    .map((trail) => `${(70 + trail.x * scaleX).toFixed(2)},${(70 + trail.y * scaleY).toFixed(2)}`)
    .join(' ');

  const lampMarks = state.lamps
    .filter((lamp) => !lamp.cursor)
    .map((lamp) => {
      const x = 70 + lamp.x * scaleX;
      const y = 70 + lamp.y * scaleY;
      const glow = 42 + lamp.power * 56 * lampScale;
      const core = 4.5 + lamp.power * 2.2 * lampScale;
      const warmth = lamp.warmth || 0.8;
      return `
        <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">
          <circle r="${glow.toFixed(2)}" fill="#ffc16b" fill-opacity="${Math.min(0.14 + warmth * 0.08, 0.22).toFixed(3)}"></circle>
          <circle r="${(glow * 0.56).toFixed(2)}" fill="#ff9454" fill-opacity="${Math.min(0.12 + warmth * 0.09, 0.2).toFixed(3)}"></circle>
          <ellipse rx="${(core * 1.7).toFixed(2)}" ry="${(core * 1.15).toFixed(2)}" fill="#ffe2ac" fill-opacity="0.96"></ellipse>
          <circle r="${core.toFixed(2)}" fill="#fff8ea" fill-opacity="0.95"></circle>
        </g>`;
    })
    .join('');

  const mothMarks = moths > 0
    ? state.moths.map((moth) => {
      const x = 70 + moth.x * scaleX;
      const y = 70 + moth.y * scaleY;
      const angle = Math.atan2(moth.vy, moth.vx) * 180 / Math.PI + 90;
      const tone = moth.tone > 0.5 ? '218,193,255' : '255,225,188';
      const alpha = clamp(0.25 + moth.glow * 0.35, 0.2, 0.75);
      const wing = (4.5 + moth.glow * 4.2) * mothScale;
      const body = (1.8 + moth.glow * 0.8) * mothScale;
      return `
        <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(2)})">
          <ellipse cx="-${(wing * 0.52).toFixed(2)}" cy="0" rx="${wing.toFixed(2)}" ry="${(wing * 1.4).toFixed(2)}" fill="rgb(${tone})" fill-opacity="${alpha.toFixed(3)}"></ellipse>
          <ellipse cx="${(wing * 0.52).toFixed(2)}" cy="0" rx="${wing.toFixed(2)}" ry="${(wing * 1.4).toFixed(2)}" fill="rgb(${tone})" fill-opacity="${alpha.toFixed(3)}"></ellipse>
          <rect x="${(-body * 0.45).toFixed(2)}" y="${(-body * 4.4).toFixed(2)}" width="${(body * 0.9).toFixed(2)}" height="${(body * 8.8).toFixed(2)}" rx="${(body * 0.45).toFixed(2)}" fill="#130f0d" fill-opacity="${clamp(0.72 + moth.glow * 0.15, 0.68, 0.95).toFixed(3)}"></rect>
        </g>`;
    }).join('')
    : '';

  const trailMarks = state.trails.length > 0
    ? `
      <polyline points="${trailPath}" fill="none" stroke="#cabaff" stroke-opacity="0.22" stroke-width="${(4 + state.resonance * 4).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"></polyline>
      <polyline points="${trailPath}" fill="none" stroke="#ffd889" stroke-opacity="0.18" stroke-width="${(1.5 + state.pulse * 1.6).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${state.trails
        .map((trail) => {
          const x = (70 + trail.x * scaleX).toFixed(2);
          const y = (70 + trail.y * scaleY).toFixed(2);
          const radius = (4 + trail.energy * 8).toFixed(2);
          return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#fff5dc" fill-opacity="${(0.1 + trail.energy * 0.24).toFixed(3)}"></circle>`;
        })
        .join('')}`
    : '';

  const verseBlock = verseLines
    .map((line, index) => `<tspan x="72" dy="${index === 0 ? 0 : 42}">${escapeXml(line)}</tspan>`)
    .join('');

  const detailBlock = detailLines
    .map((line, index) => `<tspan x="${safeWidth}" dy="${index === 0 ? 0 : 28}">${escapeXml(line)}</tspan>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Moth Choir preserved scene artifact">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#090a13"/>
      <stop offset="55%" stop-color="#05060c"/>
      <stop offset="100%" stop-color="#020204"/>
    </linearGradient>
    <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f8f4ff" stop-opacity="0.95"/>
      <stop offset="35%" stop-color="#d4c6ff" stop-opacity="0.6"/>
      <stop offset="68%" stop-color="#a899ff" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#a899ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cardGlow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd7aa" stop-opacity="0.1"/>
      <stop offset="48%" stop-color="#a191ff" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1400" height="900" fill="url(#bg)"/>
  <rect x="36" y="36" width="1328" height="828" rx="40" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.25"/>
  <rect x="48" y="48" width="1304" height="804" rx="34" fill="url(#cardGlow)" opacity="0.76"/>
  <ellipse cx="${moonX}" cy="${moonY}" rx="${(moonRadius * 1.6).toFixed(2)}" ry="${(moonRadius * 1.2).toFixed(2)}" fill="url(#moonGlow)" opacity="0.8"/>
  <circle cx="${moonX}" cy="${moonY}" r="${moonRadius.toFixed(2)}" fill="#ece6ff" fill-opacity="0.95"/>
  <circle cx="${(moonX + 18).toFixed(2)}" cy="${moonY}" r="${(moonRadius * 0.96).toFixed(2)}" fill="#080910" fill-opacity="0.88"/>
  <g opacity="0.5">
    <ellipse cx="300" cy="170" rx="210" ry="110" fill="#ffd58b" fill-opacity="0.06"/>
    <ellipse cx="1020" cy="670" rx="320" ry="140" fill="#a899ff" fill-opacity="0.05"/>
  </g>
  <g opacity="0.7">${lampMarks}</g>
  <g opacity="0.88">${trailMarks}</g>
  <g opacity="0.92">${mothMarks}</g>
  <rect x="48" y="646" width="1304" height="202" rx="28" fill="#08090e" fill-opacity="0.82" stroke="#ffffff" stroke-opacity="0.1"/>
  <text x="72" y="722" fill="#f7f1e4" font-family="Iowan Old Style, Palatino Linotype, Book Antiqua, Georgia, serif" font-size="54" letter-spacing="-0.05em">${escapeXml(title)}</text>
  <text x="72" y="768" fill="#e7bf67" fill-opacity="0.95" font-family="Iowan Old Style, Palatino Linotype, Book Antiqua, Georgia, serif" font-size="18" letter-spacing="0.25em">${escapeXml(subtitle)}</text>
  <text x="72" y="832" fill="#f7f1e4" fill-opacity="0.88" font-family="Iowan Old Style, Palatino Linotype, Book Antiqua, Georgia, serif" font-size="29" text-anchor="start">
    ${verseBlock}
  </text>
  <text x="${safeWidth}" y="714" fill="#f7f1e4" fill-opacity="0.7" font-family="Arial, Helvetica, sans-serif" font-size="18" text-anchor="end" letter-spacing="0.14em">
    ${detailBlock}
  </text>
  <text x="${safeWidth}" y="822" fill="#e7bf67" fill-opacity="0.92" font-family="Arial, Helvetica, sans-serif" font-size="16" text-anchor="end" letter-spacing="0.3em">MOTH CHOIR / PUBLIC ARTIFACT</text>
</svg>`;
}

async function savePostcard() {
  const svg = buildSceneArtifact();
  const fileName = sceneArtifactName();

  if (navigator.share && navigator.canShare) {
    const file = new File([svg], fileName, { type: 'image/svg+xml;charset=utf-8' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Moth Choir postcard',
          text: state.performanceMode === 'conducting'
            ? 'A browser-native conducting score from Moth Choir.'
            : 'A browser-native night score from Moth Choir.',
          files: [file],
        });
        miniNoteEl.textContent = 'The postcard left as a shareable SVG straight from the browser.';
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          miniNoteEl.textContent = 'The share sheet closed before the postcard left the room.';
          return;
        }
      }
    }
  }

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  miniNoteEl.textContent = 'The night has been preserved as a postcard. The file keeps the seed, the lamps, the moths, and the verse.';
}

function onKeyDown(event) {
  if (event.repeat) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 'd') {
    toggleDim();
  } else if (key === 's') {
    scatterMoths();
  } else if (key === 'm') {
    shiftMoon();
  } else if (key === 'c') {
    toggleConductMode();
  } else if (key === 'h') {
    toggleHum();
  } else if (key === 'p') {
    savePostcard();
  } else if (key === 'l') {
    const x = state.pointer.active ? state.pointer.x : state.width * (0.35 + state.rng() * 0.3);
    const y = state.pointer.active ? state.pointer.y : state.height * (0.35 + state.rng() * 0.25);
    addLamp(x, y, 1.03 + state.rng() * 0.32);
  } else if (key === 'r') {
    resetScene(true);
  }
}

function shiftMoon() {
  state.moon = (state.moon + 1) % MOON_PHASES.length;
  miniNoteEl.textContent = `The moon slides to ${MOON_PHASES[state.moon]}. The moths update their tiny theology.`;
  updateLabels();
  refreshVerse(true);
  syncUrl();
}

function toggleConductMode() {
  state.performanceMode = state.performanceMode === 'conducting' ? 'still' : 'conducting';
  miniNoteEl.textContent = state.performanceMode === 'conducting'
    ? 'Conducting mode is live. Drag across the dark and the moths will learn the score you draw.'
    : 'Conducting mode is off. The room has gone back to listening, but it remembers your line.';
  updateLabels();
  refreshVerse(true);
  syncUrl();
}

function wireButtons() {
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'lamp') {
        const x = state.pointer.active ? state.pointer.x : state.width * (0.34 + state.rng() * 0.32);
        const y = state.pointer.active ? state.pointer.y : state.height * (0.32 + state.rng() * 0.24);
        addLamp(x, y, 1.05 + state.rng() * 0.24);
      } else if (action === 'scatter') {
        scatterMoths();
      } else if (action === 'dim') {
        toggleDim();
      } else if (action === 'copy') {
        copySceneLink();
      } else if (action === 'postcard') {
        savePostcard();
      } else if (action === 'reset') {
        resetScene(true);
      } else if (action === 'moon') {
        shiftMoon();
      } else if (action === 'conduct') {
        toggleConductMode();
      } else if (action === 'hum') {
        toggleHum();
      }
    });
  }
}

function init() {
  const config = readConfig();
  state.seed = config.seed;
  state.rng = makeRng(state.seed);
  state.dim = config.dim;
  state.moon = config.moon;
  state.performanceMode = config.mode;
  state.moths = Array.from({ length: config.moths }, (_, index) => makeMoth(index));
  state.lamps = [];
  state.trails = [];
  resize();
  resetScene(false);
  updateLabels();
  refreshVerse(true);
  wireButtons();
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('pointercancel', handlePointerLeave);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (!audio.context || !audio.enabled) {
      if (document.hidden) {
        stopAnimation();
      } else {
        startAnimation();
      }
      return;
    }
    if (document.hidden) {
      audio.context.suspend().catch(() => {});
      stopAnimation();
    } else {
      audio.context.resume().catch(() => {});
      startAnimation();
    }
  });

  startAnimation();
}

init();
