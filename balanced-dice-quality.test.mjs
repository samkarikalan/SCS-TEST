import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../rounds.js', import.meta.url), 'utf8');
const start = source.indexOf('function balancedDiceQuality(');
const end = source.indexOf('async function RefreshRound(', start);
const { balancedDiceQuality, compareBalancedDiceQuality } = vm.runInNewContext(
  `${source.slice(start, end)}\n({ balancedDiceQuality, compareBalancedDiceQuality })`
);

const state = {
  allPlayers: [
    ['A', 5], ['B', 5], ['C', 2], ['D', 2],
    ['E', 5], ['F', 5], ['G', 2], ['H', 2]
  ].map(([name, clubRating]) => ({ name, clubRating })),
  fixedPairs: []
};
const game = (pair1, pair2) => ({ pair1, pair2 });
const round = games => ({
  games,
  balancedRatingMap: Object.fromEntries(state.allPlayers.map(player =>
    [player.name, player.clubRating >= 3.5 ? 5 : 2.5]))
});

test('balanced candidates rank ahead of unbalanced candidates', () => {
  const balanced = balancedDiceQuality(round([game(['A', 'C'], ['B', 'D'])]), [], state);
  const unbalanced = balancedDiceQuality(round([game(['A', 'B'], ['C', 'D'])]), [], state);
  assert.ok(compareBalancedDiceQuality(balanced, unbalanced) < 0);
});

test('fresh balanced partners rank ahead of repeated balanced partners', () => {
  const history = [round([game(['A', 'C'], ['B', 'D'])])];
  const fresh = balancedDiceQuality(round([game(['A', 'D'], ['B', 'C'])]), history, state);
  const repeated = balancedDiceQuality(round([game(['A', 'C'], ['B', 'D'])]), history, state);
  assert.ok(compareBalancedDiceQuality(fresh, repeated) < 0);
});

test('equally fresh balanced candidates prefer closer team strengths', () => {
  const ratedState = {
    allPlayers: [['A', 5], ['B', 4], ['C', 3], ['D', 1]]
      .map(([name, clubRating]) => ({ name, clubRating })),
    fixedPairs: []
  };
  const ratedRound = pairs => ({
    games: [game(...pairs)],
    balancedRatingMap: { A: 5, B: 5, C: 2.5, D: 2.5 }
  });
  const closer = balancedDiceQuality(ratedRound([['A', 'D'], ['B', 'C']]), [], ratedState);
  const wider = balancedDiceQuality(ratedRound([['A', 'C'], ['B', 'D']]), [], ratedState);
  assert.ok(compareBalancedDiceQuality(closer, wider) < 0);
});
