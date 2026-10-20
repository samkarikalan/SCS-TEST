# SCS V298 shared roster picker

`ScsApi.players.pickRegisteredRoster(onDone, providers)` owns the one registered-club roster selection popup: sub-club dropdown, player list, checkboxes, Cancel/Done, loading and selection.

Team Tournament supplies its existing registered-club loaders, player renderer and card hydration as `providers`; its `pickRegisteredRoster` method is a compatibility adapter, not another popup. Knockout calls that adapter through `ScsApi.team` and therefore uses the same popup implementation.

The separate Team Tournament club *editor* is not yet extracted; it has different responsibilities (editing encounter club roster). No other modules have been migrated in this version.
