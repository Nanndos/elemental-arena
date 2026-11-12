# Elemental Arena

A local, procedural wave-survival game built on the original MIT VFX sandbox.
Run `npm run dev`, or `npx vite build` for a production build. Assets ship in
`public`; gameplay adds no dependencies or external requests.

- Enter or click starts/restarts. WASD moves relative to the camera.
- Mouse aims; Q/E/R/F/V/X arms a spell, then left click casts.
- Escape/right click cancels. P pauses, scroll zooms, H toggles help.
- G toggles the preserved VFX editor. The author card is hidden by default.
- Q slows (34 damage / 1.4s cooldown); E hits hard (85 / 3s).
- R strikes its endpoint circle (110 / 5s); F burns along its beam (65 DPS / 4s).
- V roots for 3s (24 / 5s); X freezes for 2.5s (55 / 7s).

Clear each wave for the next. Enemies get tougher and faster; wave size caps at
40 pooled enemies. Contact costs 12 HP with a 0.7s grace period. Each wave
restores 8 HP. Kills award 100 + 10 × wave points.

`window.__game.start()` starts a run; `window.__game.state` exposes phase,
wave, score, HP and active enemy count after boot. `window.app` retains the
sandbox inspection API. Run `node tests/arena.mjs` for the headless combat checks.
