# Arcade rebuild — 23 September 2026

Replaced the in-page match with a full-screen batting game built on a ball-physics model (see README).

Verified in a headless browser against the dev server:
- Played complete autoplayed matches through the real keyboard handler with human-like timing jitter (±55–85 ms). One was won with a six, one lost 28/7. Saw fours, sixes, singles, dots, caught (point, cover, mid-on), bowled with flying stumps, leaves, end-of-over cards, new-batter cards and the result screen with scorecard and wagon wheel.
- Checked the field cam: ball flight and shadow, landing marker, fielder chases and batters running.
- Checked touch controls, the pause card and HUD at 390×844. Checked the home hero at 1280×800. No console errors apart from Chrome's expected pre-gesture AudioContext warning.
- Calibrated with Node simulations of 6,000 balls per profile. A "decent" player (±55 ms, 70% right shot) averages about 54–68 per 6 overs. A reckless slogger scores quickly but loses a wicket every 3–9 balls.

Not verified: sound was not audible in headless testing (synthesis code paths ran without errors); physical phones; a manual playthrough of all 63 matches.

---

# User-reported timing difficulty follow-up

The prior browser scoring checks used precisely timed key presses; they established that scoring was reachable, not human playability. Demonstrated an off-side six visibly in the browser, then found the drawn contact point was 24 canvas units ahead of the grounded bat. Moved the ball, contact ring and outgoing trajectory origin to y=500 and removed the 1.35 timing-error multiplier. Demonstrated a straight six on the revised build, with screenshot showing 6/0 after one ball. All 18 tests pass. Human assessment of the revised timing remains necessary.

# Boundary and dismissal acceptance test — 23 September 2026

Reviewed the supplied longer reference video (https://www.youtube.com/watch?v=ejwl0rsGm-k), including gameplay around 5:09 onward: fixed batting camera, side-on guard, cross-bat follow-through, and wicket/reset sequence.

Played the actual standalone game with keyboard input after the changes, without injecting scores or game state:

| Input | Good timing | Sweet timing |
| --- | --- | --- |
| Left / leg side | 4 | 6 |
| Right / off side | 4 | 6 |
| Up / straight | 4 | 6 |

The six sequence reached 18/0 from three balls. Reloaded the unfinished chase and the four sequence reached 12/0 from three balls. Deliberately mistimed attacks then produced Bowled through the gate and Caught (12/2). Leaving the next delivery produced Bowled, no shot offered (12/3). Visually checked the looping catch with intact stumps and a bowled outcome with displaced stump and bails. The next batter and wickets updated correctly.

Refinements: slightly widened the six timing window; Perfect timing now corresponds to six on attacking shots. Explicit dismissal types distinguish caught and bowled. Bad contact chips to a fielder; complete misses hit the stumps. All 18 tests pass, including scoring and dismissal regressions plus the embedded standalone build.

---

# Latest revision — batting-only chase campaign

Verified 23 September 2026 on the standalone HTML served at localhost:4173.

Video reference follow-up: reviewed gameplay frames from https://www.youtube.com/shorts/hG_408Tx0z8. Delayed and reduced the backswing, added eased recovery to guard, and removed the obsolete pre-shot aiming trail. Played a Right-arrow shot for two and visually checked the return to guard. All 17 tests pass after rebuilding.

- Inspected the user-linked Stick Cricket game, its arrow-key instructions and its live batting camera. The latest right-handed stance was redrawn against the user's supplied screenshot: narrow side-on silhouette, flexed knees, connected hands, grounded bat, forward head, foreground stumps.
- Played the first chase against Swamibapa using arrow shots: 4, 2, 6, 6; won at 18/0 in four balls. Verified the victory countdown automatically opens Indian Gymkhana 4, target 20, without opponent selection or bowling.
- Reloaded and confirmed campaign progress retained match 2. Played Down to defend for a single. Played a further Right shot after the stance update and visually checked the follow-through and outgoing ball.
- Verified Left, Up, Right and Down trigger shots directly. Paused between deliveries and resumed successfully. First arrow starts the delivery; subsequent deliveries follow automatically.
- Inspected the rendered desktop stance and four arrow controls. A viewport override did not visibly resize this browser surface, so no new mobile visual verification is claimed.
- All 17 tests pass, including all 63 generated chase fixtures, monotonically increasing targets and pace, achievable targets, win/loss/tie termination and timing-based sixes. Standalone build compiles with embedded assets.
- Browser playthrough covers the first victory and transition, not a manual playthrough of all 63 matches. Later campaign scoring and completion are covered by engine tests.

The sections below describe earlier versions and are retained as historical verification, not the current controls or game format.

---

# Playtest and verification — 23 September 2026

## Played through the actual browser UI

- Bat first, 2 overs versus Hornsey: 4s 50/1, Hornsey 16/4. Won by 34 runs. Played drives, lofts, direction changes and a deliberate early swing that produced a wicket. Verified the innings-break target, alternating bowlers, live scoring, individual batting and bowling figures, and the final result.
- Paused in the middle of a bowling delivery, resumed, and completed it without the timer advancing during the pause.
- Bowl first, 2014 league versus Richmond, at a 390 × 844 viewport: Richmond 16/4, 4s 20/0 in 0.5 overs. Chris Evans opened and finished 20 not out. The match ended as soon as the target was passed and credited the full winning boundary. League round 1 and all other clubs' results were recorded once. Round 2 offered Wembley.
- Reloaded the page and verified that the league table and round 2 persisted. Reset the test campaign and restored the default XI before delivery.
- Searched for Chris Evans and Matt Holt, removed Usman Mulla, selected Matt Holt, restored the XI, and moved Chris Evans into the opening position.
- Inspected the home, history photograph, live match and mobile controls visually. Verified no horizontal page overflow at 390px for the home and league screens.
- Tested Space to start/swing and P to pause/resume in the self-contained HTML build.

## Changes prompted by testing

- Added explicit Perfect / Good / Early / Late timing feedback.
- Varied delivery pace and made historical opponent-table position influence difficulty.
- Highlighted the deep fielder and added a bat-swing animation.
- Preserved incomplete XI selection across reloads.
- Corrected zero-ball not-out batting entries and clarified chase text.
- Improved page-title flow and reduced phone pitch height to make controls easier to reach.
- Fixed a standalone bundling issue where JavaScript replacement-string handling collapsed `$$` to `$`; added a compile check to prevent regression.

## Automated verification

`npm test` runs 11 tests covering:

- 173 unique player entries and key source totals.
- Strike changes, end-of-over changes, individual/team score reconciliation.
- Ten-wicket innings termination, successful chases, ties and defending totals.
- Bowling figures and timing-based outcomes.
- Every unique fixture and bye in all nine historical leagues.
- Full league completion and prevention of duplicate completion updates.
- 100 simulated matches with score and ball-count invariants.
- Valid standalone JavaScript and embedded runtime assets.

## Scope

The game is a short-form arcade adaptation, not a reproduction of historical league laws. No extras, rain, declarations or tied-match super overs. All-time selection mixes years. Completed fixtures and XI persist locally; an unfinished match does not survive a page reload. Opposition batters use numbered identities because the PDF does not contain full opposition squads. Gameplay was tested locally in the Codex browser; physical mobile devices and every browser engine were not separately tested.

The self-contained file was loaded and played through HTTP on the local server. A direct `file://` verification was blocked by the testing browser's URL policy; no bypass was attempted. Static build verification confirms that scripts, styles and the photograph are embedded and do not require network requests.
