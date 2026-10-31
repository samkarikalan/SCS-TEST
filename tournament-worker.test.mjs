import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8')
  .replace(/export \{\s*worker_default as default\s*\};[\s\S]*$/, 'export { tournamentGroupFixtures, tournamentTeamFixtures, tournamentGroupStandings, tournamentTeamStandings, tournamentValidateScore, tournamentKnockoutGenerate, tournamentKnockoutGenerateCustom };');
const engine = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const assignments = { '0:0':['A','B'], '0:1':['C','D'], '0:2':['E','F'], '0:3':['G','H'] };
const groupMatches = engine.tournamentGroupFixtures({ config:{ groups:1, per:4 }, assignments });
assert.equal(groupMatches.length, 6);
assert.equal(new Set(groupMatches.map(match => match.id)).size, 6);

const clubs = [
  { name:'One', players:['A','B','C','D','E','F'] },
  { name:'Two', players:['G','H','I','J','K','L'] },
  { name:'Three', players:['M','N','O','P','Q','R'] }
];
const encounters = engine.tournamentTeamFixtures({ clubs, matchesPerEncounter:3 });
assert.equal(encounters.length, 3);
assert.ok(encounters.every(encounter => encounter.matches.length === 3));

const finished = { finished:true, completedSets:[{ score:[21,18] }] };
groupMatches[0].status = 'approved'; groupMatches[0].winner = 'L'; groupMatches[0].score = finished;
const groupStandings = engine.tournamentGroupStandings({ config:{ per:4 }, group:0, matches:groupMatches });
assert.equal(groupStandings[0].id, '0:0');
assert.equal(groupStandings[0].w, 1);

encounters[0].matches.forEach(match => { match.status='approved'; match.winner='L'; match.score=finished; });
const teamStandings = engine.tournamentTeamStandings({ clubs, encounters });
assert.equal(teamStandings[0].name, 'One');
assert.equal(teamStandings[0].w, 1);

assert.doesNotThrow(() => engine.tournamentValidateScore(finished, 'L'));
assert.throws(() => engine.tournamentValidateScore({ finished:false }, 'L'));

const standardBracket = engine.tournamentKnockoutGenerate({ names:['A','B','C','D','E','F','G','H'], title:'Eight', third:true });
assert.equal(standardBracket.entries.length, 8);
assert.equal(standardBracket.matches.filter(match => !match.third).length, 7);
assert.equal(standardBracket.matches.filter(match => match.third).length, 1);

const customBracket = engine.tournamentKnockoutGenerateCustom({ count:10, leftCount:5, title:'Ten' });
assert.equal(customBracket.entries.length, 10);
assert.equal(customBracket.matches.length, 9);
assert.equal(customBracket.matches.filter(match => match.final).length, 1);
assert.equal(customBracket.leftByeIds.length, 1);
assert.equal(customBracket.rightByeIds.length, 1);
for (const byeId of customBracket.leftByeIds.concat(customBracket.rightByeIds)) {
  assert.ok(!customBracket.matches.some(match => match.round === 1 && (match.a === byeId || match.b === byeId)));
}
assert.throws(() => engine.tournamentKnockoutGenerateCustom({ count:10, leftCount:5, leftByeIds:[], rightByeIds:[] }));
console.log('PASS tournament Worker fixtures, standings, results, and knockout brackets');
