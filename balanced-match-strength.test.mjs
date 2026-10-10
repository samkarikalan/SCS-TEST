import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const { balancedRoundStrict } = await import('data:text/javascript;base64,' +
  Buffer.from(source + '\nexport { balancedRoundStrict };').toString('base64'));

test('Balanced picks the closest team strength from the fixed playing pool', () => {
  const allPlayers = [
    { name: 'Top1', rating: 3, clubRating: 3, activeRating: 5, gender: 'Male' },
    { name: 'Top2', rating: 3, clubRating: 3, activeRating: 4, gender: 'Male' },
    { name: 'Bottom1', rating: 3, clubRating: 3, activeRating: 3, gender: 'Male' },
    { name: 'Bottom2', rating: 3, clubRating: 3, activeRating: 1, gender: 'Male' },
  ];
  const round = balancedRoundStrict({
    activeplayers: allPlayers.map(player => player.name), allPlayers,
    numCourts: 1, courts: 1, courtFormats: ['doubles'], courtTypes: ['free'],
    fixedPairs: [], restQueue: allPlayers.map(player => player.name),
    restCount: {}, allRounds: [], pairPlayedSet: new Set(), gamesMap: new Set(),
    opponentMap: {}, roundIndex: 0,
  });
  const rating = Object.fromEntries(allPlayers.map(player => [player.name, player.activeRating]));
  const [game] = round.games;
  const gap = Math.abs(game.pair1.reduce((sum, name) => sum + rating[name], 0) -
    game.pair2.reduce((sum, name) => sum + rating[name], 0));
  assert.equal(gap, 1);
  assert.deepEqual(new Set([...game.pair1, ...game.pair2]), new Set(allPlayers.map(player => player.name)));
});

test('Balanced minimizes total strength gap across two courts', () => {
  const ratings = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5];
  const allPlayers = ratings.map((activeRating, index) => ({
    name: `P${index + 1}`, rating: 3, clubRating: 3, activeRating, gender: 'Male'
  }));
  const round = balancedRoundStrict({
    activeplayers: allPlayers.map(player => player.name), allPlayers,
    numCourts: 2, courts: 2, courtFormats: ['doubles', 'doubles'], courtTypes: ['free', 'free'],
    fixedPairs: [], restQueue: allPlayers.map(player => player.name),
    restCount: {}, allRounds: [], pairPlayedSet: new Set(), gamesMap: new Set(),
    opponentMap: {}, roundIndex: 0,
  });
  const rating = Object.fromEntries(allPlayers.map(player => [player.name, player.activeRating]));
  const totalGap = round.games.reduce((total, game) => total +
    Math.abs(game.pair1.reduce((sum, name) => sum + rating[name], 0) -
      game.pair2.reduce((sum, name) => sum + rating[name], 0)), 0);
  assert.equal(round.games.length, 2);
  assert.equal(totalGap, 0);
});
