# V302 — Shared Step 1 Home and Add Event

- All three tournament types call ScsApi.events.homePage() for the Home shell, event list, active event indicator and bottom navigation.
- Team uses ScsApi.events.eventForm() for its Add Event form.
- Knockout and Group use ScsApi.events.requestEvent() for the same Add Event form and preserve their tournament-specific event initialization.
- New Tournament form remains ScsApi.events.createForm()/requestCreate().
- No changes to Players Manager, bracket generation, group matches or team fixtures.

Verification: Node syntax checks, static source call-site checks and ZIP integrity. Browser/iPhone runtime flows are not verified.
