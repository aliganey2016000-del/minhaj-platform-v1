import assert from 'node:assert/strict';
import { pickSimilar, similarityScore } from '../services/guuldoon-similar.service';

const q = (id: string, textEn: string, topicTags: string[] = []) => ({ _id: id, textEn, topicTags });

const asked = q('1', 'Infrared radiation has less energy and a longer wavelength than visible light', ['em-spectrum']);
const nightVision = q('2', 'A night vision device can see it in darkness by receiving a kind of radiation known as', ['em-spectrum']);
const sensation = q('3', 'An invisible energy which causes in us a sensation of vision is called', []);
const unrelated = q('4', 'Calculate the resistance of a wire given its length and the area of cross section', ['electricity']);
const wavelength = q('5', 'Which radiation has the longer wavelength and lower energy: infrared or ultraviolet', []);

// A hand-made link to an unrelated question is dropped.
assert.deepEqual(pickSimilar(asked, [unrelated], []), []);
// Related hand-made link is kept (shares the topic tag).
assert.deepEqual(pickSimilar(asked, [nightVision], []).map((x) => x._id), ['2']);
// Slots are topped up from the pool by relevance, never with unrelated questions.
const picked = pickSimilar(asked, [unrelated], [unrelated, wavelength, nightVision, sensation]).map((x) => x._id);
assert.ok(picked.includes('5') && picked.includes('2'), `got ${picked}`);
assert.ok(!picked.includes('4'));
assert.equal(picked.length, 2);
// A question is never similar to itself.
assert.deepEqual(pickSimilar(asked, [asked], [asked]), []);
// Nothing related in the chapter means nothing is shown.
assert.deepEqual(pickSimilar(unrelated, [], [asked, nightVision, sensation]), []);
assert.ok(similarityScore(asked, unrelated).score < 0.3);
console.log('Guulgaar similar-question picker passed');
