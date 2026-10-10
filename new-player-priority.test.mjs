import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const { standardRoundStrict, balancedRoundStrict } = await import('data:text/javascript;base64,' +
  Buffer.from(source + '\nexport { standardRoundStrict, balancedRoundStrict };').toString('base64'));

const players = ['A', 'B', 'C', 'D', 'E', 'F'].map(name => ({ name, gender: 'Male', rating: 3 }));
const game = (a, b, c, d) => ({ court: 1, pair1: [a, b], pair2: [c, d] });
const state = rounds => ({
  activeplayers: players.map(player => player.name), allPlayers: players,
  numCourts: 1, courts: 1, courtFormats: ['doubles'], courtTypes: ['free'],
  fixedPairs: [], restQueue: ['F', 'E', 'A', 'B', 'C', 'D'],
  restCount: { A: 1, B: 1, C: 1, D: 1, E: 0, F: 0 },
  allRounds: rounds, pairPlayedSet: new Set(), gamesMap: new Set(),
  opponentMap: {}, roundIndex: rounds.length + 1,
});

test('newly added player plays before an existing player is rested again', () => {
  const round = standardRoundStrict(state([{ games: [game('A', 'B', 'C', 'D')], resting: ['E#1'] }]));
  assert.ok(round.playing.includes('F'));
});

test('reactivated player who missed the last round plays first', () => {
  const rounds = [
    { games: [game('A', 'B', 'E', 'F')], resting: ['C#1', 'D#1'] },
    { games: [game('A', 'B', 'C', 'D')], resting: ['F#1'] },
  ];
  const round = standardRoundStrict(state(rounds));
  assert.ok(round.playing.includes('E'));
});

for (const [mode, generate] of [['Standard', standardRoundStrict], ['Balanced', balancedRoundStrict]]) {
  test(`${mode} reserves playing slots for every new and returning player`, () => {
    const roster = [...players, { name: 'G', gender: 'Male', rating: 3 }];
    const rounds = [
      { games: [game('A', 'B', 'E', 'F')], resting: ['C#1', 'D#1'] },
      { games: [game('A', 'B', 'C', 'D')], resting: ['F#1'] },
    ];
    const next = {
      ...state(rounds),
      activeplayers: roster.map(player => player.name), allPlayers: roster,
      restQueue: ['E', 'G', 'A', 'B', 'C', 'D', 'F'],
      restCount: { A: 1, B: 1, C: 1, D: 1, E: 0, F: 0, G: 0 },
    };
    const round = generate(next);
    assert.ok(round.playing.includes('E'), 'returning E must play');
    assert.ok(round.playing.includes('G'), 'new G must play');
    assert.ok(!round.resting.some(raw => ['E', 'G'].includes(raw.split('#')[0])));
  });
}

test('returning players retain priority when the previous roster was smaller than current court capacity', () => {
  const roster = [...players, ...['G', 'H', 'I', 'J'].map(name => ({ name, gender: 'Male', rating: 3 }))];
  const rounds = [{ games: [game('A', 'B', 'C', 'D')], resting: [] }];
  const next = {
    ...state(rounds), activeplayers: roster.map(player => player.name), allPlayers: roster,
    numCourts: 2, courts: 2, courtFormats: ['doubles', 'doubles'], courtTypes: ['free', 'free'],
  };
  const round = standardRoundStrict(next);
  assert.ok(['E', 'F', 'G', 'H', 'I', 'J'].every(name => round.playing.includes(name)));
});

test('three-court Balanced round seats everyone who missed the preceding round', () => {
  const roster = Array.from({ length: 15 }, (_, index) => ({
    name: `P${index + 1}`, gender: 'Male', rating: 3,
  }));
  const previous = {
    games: [
      game('P1', 'P2', 'P3', 'P4'),
      { ...game('P5', 'P6', 'P7', 'P8'), court: 2 },
      { ...game('P9', 'P10', 'P11', 'P12'), court: 3 },
    ],
    resting: ['P13#1', 'P14#1'],
  };
  const next = {
    ...state([previous]), activeplayers: roster.map(player => player.name), allPlayers: roster,
    numCourts: 3, courts: 3,
    courtFormats: ['doubles', 'doubles', 'doubles'],
    courtTypes: ['free', 'free', 'free'],
    restQueue: ['P13', 'P14', 'P15', ...roster.slice(0, 12).map(player => player.name)],
  };
  const round = balancedRoundStrict(next);
  assert.ok(['P13', 'P14', 'P15'].every(name => round.playing.includes(name)));
});
