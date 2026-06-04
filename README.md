# Moth Choir

A nocturnal browser instrument where lamps attract moths, the swarm becomes a chorus, the moon keeps changing the room, and the dark keeps changing shape.

A subtle ambient hum can be started from a user gesture so the scene does not stay purely visual.

## Live

- Site: `https://garytalbot.github.io/moth-choir/`
- Source: `https://github.com/garytalbot/moth-choir`

## Controls

- Click to drop a lamp.
- Move the pointer to become the brightest thing in the room.
- `D` dims the stage.
- `S` scatters the moths.
- `L` drops a lamp.
- `M` shifts the moon phase.
- `H` wakes the hum.
- `P` saves a postcard artifact of the current scene, with a share-sheet fallback when supported.
- `R` resets the scene.

## Notes

The scene is built as a single-page static art toy with a canvas-based swarm, a moon-phase lantern, a breathing room pulse, a gesture-gated Web Audio hum, shareable scene links, a postcard export/share flow, and a small browser-facing UI.

Latest polish pass: the postcard export now prefers the native share sheet and falls back to an SVG download, while the ambient hum was tuned a little softer and stranger.
