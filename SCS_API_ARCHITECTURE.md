# SCS V296 shared UI extraction

## Single implementations in scs-api.js
- ScsApi.cards.player(name, levelMarkup) — shared player card markup
- ScsApi.buttons.render(config) — shared button builder
- ScsApi.navigation.bottom(config) — shared four-tab navigation
- ScsApi.events.home(config) — shared multi-event Home renderer

## Team-only code in team-tournament.js
- Encounters, ranking, fixtures, team state, score handling, storage, club selection
- Calls shared player, navigation and Home functions; retains SCSTeamTournament compatibility alias
- Existing Team Match Center renderer and registered-roster picker remain Team-owned until they can be separated safely.

## Known limitations
- Team-specific CSS remains in team-tournament.css; shared selectors have not been split into separate CSS.
- Knockout and Group are not yet migrated to the shared components.
- No browser/iPhone runtime test performed.
