import test from 'node:test';
import assert from 'node:assert/strict';
import {formatBoard,characterCode,DEFAULT_SCENES} from '../lib/board.ts';
test('all defaults fit exactly 6 rows by 22 flaps',()=>{for(const scene of Object.values(DEFAULT_SCENES)){const grid=formatBoard(scene.text,scene.alignment,scene.accent);assert.equal(grid.length,6);assert.ok(grid.every(row=>row.length===22));if(scene.accent)assert.ok(grid[5].every(code=>code===scene.accent));}});
test('normalizes accents and smart punctuation without changing supported codes',()=>{assert.equal(characterCode('0'),36);assert.equal(characterCode('9'),35);assert.equal(characterCode('°'),62);assert.doesNotThrow(()=>formatBoard('Café — “SHIP IT”'));});
test('rejects unsupported glyphs and overflowing rows instead of truncating',()=>{assert.throws(()=>formatBoard('SHIP 🚀'),/cannot display/);assert.throws(()=>formatBoard('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),/22 characters/);assert.throws(()=>formatBoard('1\n2\n3\n4\n5\n6','center',64),/5 or fewer/);});
test('wraps whole words and applies alignment',()=>{const grid=formatBoard('ABCDEFGHIJKLMNOPQRSTUV NEXT','left');assert.equal(grid[2][0],1);assert.equal(grid[3][0],14);const right=formatBoard('A','right');assert.equal(right[2][21],1);});
