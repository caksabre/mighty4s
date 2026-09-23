# Mighty4s

**[mighty4s.com](https://mighty4s.com)**


A complete, offline-capable cricket browser game celebrating North Middlesex CC's 4th XI, based on the supplied **Mighty4s-2007-2015.pdf**.

## Play

Open **dist/index.html** in a modern browser. It is self-contained: no install, network, account, or server required. Browser-local storage saves your XI and completed league fixtures. Keep the same browser and file location for your saved progress.

For local development, run `npm start` and open http://localhost:4173. There are no third-party runtime dependencies. `npm test` runs the engine/data tests; `npm run build` rebuilds the standalone HTML.

## Contributing

No install needed: `npm start` serves the game at http://localhost:4173, `npm test` runs the tests, and `npm run build` makes the single-file `dist/index.html`. Game feel lives in `physics.js` (ball, shots, fielding) and `game.js` (drawing, animation, input). The tests check the physics stays fair, so run them before opening a pull request.

## Deploy to mighty4s.com

Run `npm run build`, then upload `dist/index.html` as the site root. It is a single self-contained file (scripts, styles and the team photo are embedded), so any static host works: Netlify, Cloudflare Pages, GitHub Pages or plain web hosting. Saved progress is per-domain, so players start fresh on mighty4s.com.

## Play the campaign

A full-screen, Stick Cricket-style batting game. Chase each opponent's total off 6 overs with 10 wickets, then move on. The fixed route covers all 63 distinct opponents from the nine historical league tables. Targets rise a run a match, from 18 to 80. Later sides bowl quicker, move the ball more, set deeper fields and catch better. Progress, your XI and the sound setting save locally.

**Controls**

- **←** pull / hook (short balls, leg side) · **↑** straight drive (full balls) · **→** cut / cover drive (wide of off) · **↓** block
- Hold **Shift** with an arrow to go aerial. That's the only way to hit sixes, but you can be caught. On touch screens, toggle **LOFT**.
- Press nothing to leave the ball. Safe outside off stump, fatal if it's hitting the stumps.
- **P** / **Esc** pauses. **Space** skips the gaps between balls.

**How a ball plays out**

- Every delivery is different: pace (88–148 km/h) with swing, or spin with turn after pitching. Lengths run from yorkers to bouncers, and lines vary, with the occasional wide.
- Timing is measured in milliseconds against the moment the ball visibly meets the bat from the batter-cam, which is about 150 ms before it reaches the crease (`TIMING_LEAD` in `physics.js`). The pause menu has an Earlier/Later adjuster (in 20 ms steps, saved) for different screens and keyboards. Early sends it to leg, late to off. A white ring closes on the contact point as a guide and fades out over the campaign.
- Picking the wrong shot for the delivery (say, a drive at a bouncer) risks edges, top edges and playing on.
- After contact the game switches to an overhead **field cam**. Nine fielders plus the bowler chase the ball, catch or drop it, and throw it in while the batters run. Boundaries are decided by where the ball actually crosses the rope, so fours and sixes are never scripted. Perfectly timed ground shots are steered into the nearest gap.
- Commentary uses the real players' names and nicknames. The result screen shows a scorecard and wagon wheel.

Code layout: `physics.js` (delivery, bat-on-ball and fielding simulation, pure and tested), `game.js` (rendering, input, sound, match flow), `engine.js` (scoring and campaign), `app.js` (clubhouse, squad, league and history pages).

## Source fidelity

- 173 distinct career-register entries, extracted from PDF pages 125–131. Every entry is selectable, including bowling-only Matt Holt.
- Career runs, wickets, highest scores, seasons, and averages are preserved. The source's separate Mike Edwards and Mikey Edwards entries remain separate.
- Opponent names and XI numbers were transcribed and visually checked against all nine league-table images (pages 12, 15, 27, 40, 49, 60, 75, 89, 99). Includes GWR in the 2008 table and Mill Hill Village in the 2009 table even though they have incomplete/zero played records.
- Historical summaries: pages 3–10. Nicknames: narrative and player profiles. Photograph: page 4, 2008 team.
- The book contains no complete opposition player registers. Opponent batters therefore have batting-order numbers; no invented real identities are used.
- Game abilities, roles, opponent strength, artwork and outcomes are adaptations. The fixed route introduces teams from the source seasons; target and pace rise with campaign progress. The all-time XI deliberately mixes seasons.
- This is an arcade adaptation: shortened innings, all deliveries legal, no weather or extras, simplified fielding and dismissals, batting-only preset chases. It does not reproduce historical league playing/points regulations.
- International heroes and other incidental names in the text are not treated as 4th XI roster members.

The club book itself is not included in this repository. `data.js` holds everything the game needs. If you have the PDF, `python3 scripts/extract_data.py path/to/Mighty4s-2007-2015.pdf` regenerates `data.js` (requires `pypdf`).

## Verification

`npm test` checks the source roster, scoring (including wides), innings/result invariants, all 63 chase fixtures with strictly increasing targets and strength, and the ball physics. The physics tests cover delivery ranges, leaving and bowled, timing windows, shot selection, early/late direction, lofted sixes, catches, legal scores across 500 random balls, and gap placement. A simulated club batter must win the opening chase reliably while the final chase stays hard. The standalone build must also compile.

Browser testing details are recorded in `TESTING.md`. The latest campaign was tested through an arrow-only victory and automatic advancement.
