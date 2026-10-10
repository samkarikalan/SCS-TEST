# SCS tournament update

Upload the files in this archive to the matching paths in the test GitHub repository.

## Application files

- `index.html`
- `HomeScreen.js`
- `authUI.js`
- `main.js`
- `supabase.js`
- `tournament-bracket.js`
- `group-tournament.js`
- `group-tournament.css`

## Backend files

- `worker.js` — Cloudflare Worker source with tournament table access.
- `tournaments.sql` — Supabase table, indexes, RLS policies, grants, and Realtime publication setup.

The SQL only needs to be run once per Supabase project. Deploy `worker.js` whenever its source changes.
