# Moth Choir

A nocturnal browser instrument where lamps attract moths, the swarm becomes a chorus, the moon keeps changing the room, and the dark keeps changing shape.

A subtle ambient hum can be started from a user gesture so the scene does not stay purely visual.

## Live

- Site: `https://garytalbot.github.io/moth-choir/`
- Source: `https://github.com/garytalbot/moth-choir`
- Sister pieces: `strange-computational-art.html`, `noise-lullaby.html`

## Controls

- Click to drop a lamp.
- Move the pointer to become the brightest thing in the room.
- `D` dims the stage.
- `S` scatters the moths.
- `L` drops a lamp.
- `M` shifts the moon phase.
- `C` toggles conducting mode for drawing a temporary light-score across the room.
- `H` wakes the hum.
- `P` saves a postcard artifact of the current scene, with a share-sheet fallback when supported.
- `R` resets the scene.

## Side chamber toys

- `strange-computational-art.html`: attractor-based orbital swarm that layers glow and harmonic states.
- `noise-lullaby.html`: noise-driven lullaby field with pointer influence, pulse bursts, and breathing controls.
- `lattice-liturgy.html`: click-to-spawn drift lattice with surging threads and entropy gestures.

## Notes

The scene is built as a single-page static art toy with a canvas-based swarm, a moon-phase lantern, a breathing room pulse, a gesture-gated Web Audio hum, a conducting mode that leaves temporary score marks in the room, shareable scene links, a postcard export/share flow, and a small browser-facing UI.

Latest polish pass: the postcard export now prefers the native share sheet and falls back to an SVG download, while the ambient hum was tuned a little softer and stranger. The newer pass adds a conducting mode and richer postcard exports that preserve score trails when you draw them.
