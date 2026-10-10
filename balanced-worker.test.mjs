import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadScheduler() {
  const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
  const exposed = source + '\nexport { balancedRoundStrict, standardRoundStrict, handleGenerateRound };\n';
  return import('data:text/javascript;base64,' + Buffer.from(exposed).toString('base64'));
}

const players = (rows) => rows.map(([name, rating, gender = 'Male']) => ({
  name, rating, clubRating: rating, gender,
}));

function stateFor(allPlayers, options = {}) {
  return {
    activeplayers: allPlayers.map(player => player.name),
    allPlayers,
    numCourts: options.numCourts ?? 2,
    courts: options.numCourts ?? 2,
    courtFormats: options.formats ?? ['doubles', 'doubles'],
    courtTypes: options.types ?? ['free', 'free'],
    fixedPairs: options.fixedPairs ?? [],
    restQueue: allPlayers.map(player => player.name),
    restCount: Object.fromEntries(allPlayers.map(player => [player.name, 0])),
    allRounds: [],
    pairPlayedSet: new Set(),
    gamesMap: new Set(),
    opponentMap: {},
    roundIndex: 0,
  };
}

function commit(state, round) {
  state.allRounds.push(round);
  for (const raw of round.resting || []) {
    const player = String(raw).split('#')[0];
    state.restCount[player] = (state.restCount[player] || 0) + 1;
    state.restQueue = state.restQueue.filter(name => name !== player);
    state.restQueue.push(player);
  }
  state.roundIndex += 1;
}

function bandMap(round, allPlayers) {
  const rating = new Map(allPlayers.map(player => [player.name, player.rating]));
  const sorted = [...round.playing].sort((a, b) => rating.get(b) - rating.get(a) || a.localeCompare(b));
  const half = Math.ceil(sorted.length / 2);
  return new Map(sorted.map((name, index) => [name, index < half ? 1 : 0]));
}

function assertBinaryGames(round, allPlayers, fixedPairs = []) {
  const bands = bandMap(round, allPlayers);
  const fixed = new Set(fixedPairs.map(pair => [...pair].sort().join('|')));
  for (const game of round.games) {
    if (game.pair1.length === 1) {
      assert.equal(bands.get(game.pair1[0]), bands.get(game.pair2[0]));
      continue;
    }
    const key1 = [...game.pair1].sort().join('|');
    const key2 = [...game.pair2].sort().join('|');
    if (fixed.has(key1) || fixed.has(key2)) continue;
    const sum1 = game.pair1.reduce((sum, name) => sum + bands.get(name), 0);
    const sum2 = game.pair2.reduce((sum, name) => sum + bands.get(name), 0);
    assert.equal(sum1, sum2, `${game.pair1.join('+')} must balance ${game.pair2.join('+')}`);
  }
}

test('one-rest Free Doubles prioritises lowest rest count and preserves binary equality', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players([
    ['Vinod', 4], ['Faison', 4], ['Kari', 4],
    ['Arron', 3], ['Jidhin', 3], ['Prince', 3],
    ['Rahul', 3], ['Sam', 3], ['Sreekrishnan', 3],
  ]);
  const state = stateFor(roster);
  const rested = [];
  for (let roundIndex = 0; roundIndex < roster.length; roundIndex++) {
    const round = balancedRoundStrict(state);
    assert.equal(round.games.length, 2);
    assert.equal(round.resting.length, 1);
    assertBinaryGames(round, roster);
    rested.push(round.resting[0].split('#')[0]);
    commit(state, round);
  }
  const restTotals = Object.values(state.restCount);
  assert.ok(Math.max(...restTotals) - Math.min(...restTotals) <= 1);
  assert.equal(new Set(rested).size, roster.length);
});

test('Random Order lets Balanced choose any zero-rest player needed for a fully balanced round', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players([
    ['Bottom1', 1],
    ['Top1', 5], ['Top2', 4.8], ['Top3', 4.6], ['Top4', 4.4], ['Top5', 4.2],
    ['Bottom2', 1.8], ['Bottom3', 1.6], ['Bottom4', 1.4],
  ]);
  const state = stateFor(roster);
  state.randomPlayerOrder = true;
  state.frozenBalancedBands = Object.fromEntries(roster.map(player => [player.name, player.rating >= 4 ? 1 : 0]));

  const round = balancedRoundStrict(state);
  const resting = round.resting[0].split('#')[0];

  assert.equal(state.restCount[resting], 0, 'selection stays inside the zero-rest cycle');
  assert.equal(state.frozenBalancedBands[resting], 1, 'solver may bypass FIFO to preserve a balanced match');
  assert.ok(round.games.every(game => game.balanceMode === 'balanced'));
  assertBinaryGames(round, roster);
});

test('three-court Random Order chooses an odd Top rest count from a 7/8 split', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players([
    ['Abhishek', 3], ['Ajit', 4], ['Anand P', 4], ['Anand', 4], ['Android', 4],
    ['Aravindh', 4], ['Ariav', 4.5], ['Ariav Karikalan', 4], ['Ashish', 3],
    ['Babu', 3], ['Bala', 3], ['Chandra', 3], ['Govi', 3], ['Gowrishankar', 3], ['Guna', 3],
  ]);
  const state = stateFor(roster, {
    numCourts: 3,
    formats: ['doubles', 'doubles', 'doubles'],
    types: ['free', 'free', 'free'],
  });
  state.randomPlayerOrder = true;
  state.frozenBalancedBands = Object.fromEntries(roster.map(player => [player.name, player.rating >= 3.5 ? 1 : 0]));

  const round = balancedRoundStrict(state);
  const restingBands = round.resting.map(name => state.frozenBalancedBands[String(name).split('#')[0]]);

  assert.equal(round.games.length, 3);
  assert.equal(restingBands.reduce((sum, band) => sum + band, 0) % 2, 1);
  assert.ok(round.games.every(game => game.balanceMode === 'balanced'));
});

test('Random Order does not change Standard FIFO player selection', async () => {
  const { standardRoundStrict } = await loadScheduler();
  const roster = players([
    ['Bottom1', 1],
    ['Top1', 5], ['Top2', 4.8], ['Top3', 4.6], ['Top4', 4.4], ['Top5', 4.2],
    ['Bottom2', 1.8], ['Bottom3', 1.6], ['Bottom4', 1.4],
  ]);
  const state = stateFor(roster);
  state.randomPlayerOrder = true;

  const round = standardRoundStrict(state);

  assert.equal(round.resting[0].split('#')[0], 'Bottom1', 'Standard must keep its existing FIFO rest choice');
});

test('Balanced Random Order never starts a second rest cycle early', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players([
    ['Bottom1', 1],
    ['Top1', 5], ['Top2', 4.8], ['Top3', 4.6], ['Top4', 4.4], ['Top5', 4.2],
    ['Bottom2', 1.8], ['Bottom3', 1.6], ['Bottom4', 1.4],
  ]);
  const state = stateFor(roster);
  state.randomPlayerOrder = true;
  state.frozenBalancedBands = Object.fromEntries(roster.map(player => [player.name, player.rating >= 4 ? 1 : 0]));
  state.restCount = Object.fromEntries(roster.map(player => [player.name, player.name.startsWith('Top') ? 1 : 0]));

  const round = balancedRoundStrict(state);
  const resting = round.resting[0].split('#')[0];

  assert.equal(state.restCount[resting], 0, 'a zero-rest player must rest before any one-rest player');
});

test('rested players receive fair mixed-partner opportunities across zebra rounds', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players(Array.from({ length: 9 }, (_, index) => [`P${index + 1}`, 5 - index * .25]));
  const state = stateFor(roster);
  const mixedCounts = Object.fromEntries(roster.map(player => [player.name, 0]));
  for (let index = 0; index < 18; index++) {
    const round = balancedRoundStrict(state);
    assertBinaryGames(round, roster);
    for (const game of round.games) for (const pair of [game.pair1, game.pair2]) {
      if (round.balancedBands[pair[0]] !== round.balancedBands[pair[1]]) {
        mixedCounts[pair[0]] += 1;
        mixedCounts[pair[1]] += 1;
      }
    }
    commit(state, round);
  }
  const restTotals = Object.values(state.restCount);
  assert.ok(Math.max(...restTotals) - Math.min(...restTotals) <= 1, 'rests remain fair');
  assert.ok(Math.min(...Object.values(mixedCounts)) > 0, 'every player eventually partners across bands');
  assert.ok(Math.max(...Object.values(mixedCounts)) - Math.min(...Object.values(mixedCounts)) <= 2, 'mixed opportunities remain close');
});

test('one-court round preserves frozen full-roster bands after eight players rest', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players([
    ...Array.from({ length: 6 }, (_, index) => [`Top${index + 1}`, 4]),
    ...Array.from({ length: 6 }, (_, index) => [`Bottom${index + 1}`, 1]),
  ]);
  const state = stateFor(roster, { numCourts: 1, formats: ['doubles'], types: ['free'] });
  state.frozenBalancedBands = Object.fromEntries(roster.map((player,index) => [player.name, index < 6 ? 1 : 0]));
  const round = balancedRoundStrict(state);
  assert.equal(round.resting.length, 8);
  for (const game of round.games) {
    const left = game.pair1.reduce((sum,name) => sum + state.frozenBalancedBands[name], 0);
    const right = game.pair2.reduce((sum,name) => sum + state.frozenBalancedBands[name], 0);
    assert.equal(left, right);
    for (const name of [...game.pair1,...game.pair2]) {
      assert.equal(round.balancedBands[name], state.frozenBalancedBands[name]);
    }
  }
});

test('Men Singles rotates participation instead of repeating one player', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players(Array.from({ length: 8 }, (_, index) => [`M${index + 1}`, 4 - index * .1]));
  const state = stateFor(roster, {
    numCourts: 1,
    formats: ['singles'],
    types: ['singles-men'],
  });
  const counts = Object.fromEntries(roster.map(player => [player.name, 0]));
  const activeBand = new Map(roster.map((player, index) => [player.name, index < roster.length / 2 ? 1 : 0]));
  for (let index = 0; index < 8; index++) {
    const round = balancedRoundStrict(state);
    const singles = round.games.find(game => game.pair1.length === 1);
    assert.equal(activeBand.get(singles.pair1[0]), activeBand.get(singles.pair2[0]));
    for (const name of [...singles.pair1, ...singles.pair2]) counts[name] += 1;
    commit(state, round);
  }
  assert.ok(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1);
});

test('typed doubles courts preserve gender rules and ordinary binary equality', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players([
    ['M1', 4.5], ['M2', 4.3], ['M3', 4.1], ['M4', 3.9], ['M5', 3.7],
    ['M6', 3.5], ['M7', 3.3], ['M8', 3.1], ['M9', 2.9],
    ['W1', 4.0, 'Female'], ['W2', 3.5, 'Female'], ['W3', 3.0, 'Female'],
  ]);
  const state = stateFor(roster, {
    numCourts: 2,
    formats: ['doubles', 'doubles'],
    types: ['MD', 'XD'],
  });
  for (let index = 0; index < 6; index++) {
    const round = balancedRoundStrict(state);
    assertBinaryGames(round, roster);
    const md = round.games[0];
    const xd = round.games[1];
    const gender = name => roster.find(player => player.name === name).gender;
    assert.ok([...md.pair1, ...md.pair2].every(name => gender(name) === 'Male'));
    assert.equal([...xd.pair1, ...xd.pair2].filter(name => gender(name) === 'Female').length, 2);
    commit(state, round);
  }
});

test('impossible odd-band Singles plus Doubles combination is rejected explicitly', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players(Array.from({ length: 8 }, (_, index) => [`M${index + 1}`, 4 - index * .1]));
  const state = stateFor(roster, {
    numCourts: 2,
    formats: ['singles', 'doubles'],
    types: ['singles-men', 'MD'],
  });
  assert.throws(() => balancedRoundStrict(state), /No valid Balanced round satisfies/);
});

test('fixed pair stays together and is exempt from ordinary binary equality', async () => {
  const { balancedRoundStrict } = await loadScheduler();
  const roster = players([
    ['A', 5], ['B', 1], ['C', 4.5], ['D', 4],
    ['E', 3.5], ['F', 3], ['G', 2.5], ['H', 2],
  ]);
  const state = stateFor(roster, { fixedPairs: [['A', 'B']] });
  const round = balancedRoundStrict(state);
  assert.ok(round.games.some(game =>
    [game.pair1, game.pair2].some(pair => pair.includes('A') && pair.includes('B'))
  ));
  assertBinaryGames(round, roster, [['A', 'B']]);
});

test('generate-round endpoint routes Balanced mode through the strict scheduler', async () => {
  const { handleGenerateRound } = await loadScheduler();
  const roster = players(Array.from({ length: 9 }, (_, index) => [`P${index + 1}`, 5 - index * .2]));
  const request = new Request('https://worker.test/generate-round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activeplayers: roster.map(player => player.name),
      allPlayers: roster,
      numCourts: 2,
      courtFormats: ['doubles', 'doubles'],
      courtTypes: ['free', 'free'],
      fixedPairs: [],
      restQueue: roster.map(player => player.name),
      restCount: roster.map(player => [player.name, 0]),
      pairPlayedSet: [], gamesMap: [], opponentMap: [], allRounds: [],
      roundIndex: 0, balancedGamesMode: true, gameGenerationMode: 'balanced',
    }),
  });
  const response = await handleGenerateRound(request, {});
  assert.equal(response.status, 200);
  const round = await response.json();
  assert.equal(round.games.length, 2);
  assert.equal(round.resting.length, 1);
  assert.equal(round.resting[0].split('#')[0], 'P1');
  assert.ok(Object.values(round.balancedBands).every(value => value === 0 || value === 1));
  for (const game of round.games) {
    const left = game.pair1.reduce((sum, name) => sum + round.balancedBands[name], 0);
    const right = game.pair2.reduce((sum, name) => sum + round.balancedBands[name], 0);
    assert.equal(left, right);
  }
});

test('generate-round endpoint forwards Random Order into Balanced rest selection', async () => {
  const { handleGenerateRound } = await loadScheduler();
  const roster = players([
    ['Bottom1', 1],
    ['Top1', 5], ['Top2', 4.8], ['Top3', 4.6], ['Top4', 4.4], ['Top5', 4.2],
    ['Bottom2', 1.8], ['Bottom3', 1.6], ['Bottom4', 1.4],
  ]);
  const bands = Object.fromEntries(roster.map(player => [player.name, player.rating >= 4 ? 1 : 0]));
  const request = new Request('https://worker.test/generate-round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activeplayers: roster.map(player => player.name), allPlayers: roster,
      numCourts: 2, courtFormats: ['doubles', 'doubles'], courtTypes: ['free', 'free'],
      fixedPairs: [], restQueue: roster.map(player => player.name),
      restCount: roster.map(player => [player.name, 0]), pairPlayedSet: [], gamesMap: [],
      opponentMap: [], allRounds: [], roundIndex: 0,
      balancedGamesMode: true, gameGenerationMode: 'balanced',
      randomPlayerOrder: true, balancedBands: bands,
    }),
  });

  const response = await handleGenerateRound(request, {});
  assert.equal(response.status, 200);
  const round = await response.json();
  const resting = round.resting[0].split('#')[0];
  assert.equal(bands[resting], 1, 'endpoint must allow Balanced to bypass FIFO inside the zero-rest cycle');
  assert.ok(round.games.every(game => game.balanceMode === 'balanced'));
});
