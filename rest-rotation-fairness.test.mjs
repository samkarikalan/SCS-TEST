import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const { balancedRoundStrict, standardRoundStrict } = await import('data:text/javascript;base64,' +
  Buffer.from(source + '\nexport { balancedRoundStrict, standardRoundStrict };').toString('base64'));

for (const [mode, generate] of [['Standard', standardRoundStrict], ['Balanced', balancedRoundStrict]]) {
  test(`${mode} shares total rests and short rest gaps across 19 players`, () => {
    const names = Array.from({ length: 19 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
    const state = {
      activeplayers: names, allPlayers: names.map(name => ({ name, gender: 'Male', rating: 3 })),
      numCourts: 3, courts: 3, courtFormats: ['doubles', 'doubles', 'doubles'],
      courtTypes: ['free', 'free', 'free'], fixedPairs: [], restQueue: [...names],
      restCount: Object.fromEntries(names.map(name => [name, 0])),
      allRounds: [], pairPlayedSet: new Set(), gamesMap: new Set(), opponentMap: {}, roundIndex: 0,
    };
    if (mode === 'Balanced') {
      state.frozenBalancedBands = Object.fromEntries(names.map((name, index) => [name, index < 10 ? 1 : 0]));
    }
    const rests = [];
    for (let index = 0; index < 19; index++) {
      const round = generate(state);
      const resting = round.resting.map(raw => raw.split('#')[0]);
      assert.equal(resting.length, 7);
      assert.equal(round.playing.length, 12);
      if (rests.length) assert.ok(resting.every(name => !rests.at(-1).includes(name)), 'nobody rests consecutively');
      rests.push(resting);
      state.allRounds.push(round);
      state.roundIndex++;
      for (const name of resting) {
        state.restCount[name]++;
        state.restQueue.splice(state.restQueue.indexOf(name), 1);
        state.restQueue.push(name);
      }
    }
    assert.deepEqual(new Set(Object.values(state.restCount)), new Set([7]));
    const shortGaps = names.map(name => {
      const positions = rests.flatMap((group, index) => group.includes(name) ? [index] : []);
      return positions.slice(1).filter((position, index) => position - positions[index] === 2).length;
    });
    assert.ok(Math.max(...shortGaps) - Math.min(...shortGaps) <= 1,
      `two-round rest gaps varied: ${shortGaps.join(',')}`);
  });
}
