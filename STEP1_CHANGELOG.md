# V303 — Step 1 shared Home presentation correction

- Added `ScsApi.events.mountHome(root, options)` and `leaveHome(root)`.
- Team, Knockout and Group Home paths call the same mounting function and HTML renderer.
- Applied the proven Team Tournament Home styling to the shared Home host regardless of the host overlay class. In V302 the full-width Add Event CSS was scoped to `.scs-team-overlay` and therefore did not apply to Knockout/Group overlays.
- Restored full-width Add Event button, consistent card/header/empty-state spacing, and button styling for all three formats.
- Kept event generation, Players Manager and tournament-specific state untouched.
- Changed asset cache query versions to V303.

Checks: node --check for all four modified JS files; ZIP integrity. Browser/device interaction is not verified.
