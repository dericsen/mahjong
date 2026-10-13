'use strict';
/**
 * Tile encoding (kind = integer):
 *   0-8   Characters (萬) 1-9
 *   9-17  Dots       (筒) 1-9
 *   18-26 Bamboos    (条) 1-9
 *   27-30 Winds East, South, West, North
 *   31-33 Dragons Red, Green, White
 *   34-37 Flowers  Plum, Orchid, Chrysanthemum, Bamboo   (1 each)
 *   38-41 Seasons  Spring, Summer, Autumn, Winter        (1 each)
 */
const crypto = require('crypto');

const EAST = 27, SOUTH = 28, WEST = 29, NORTH = 30;
const RED = 31, GREEN = 32, WHITE = 33;
const NUM_KINDS = 34;

const isSuited = (k) => k >= 0 && k < 27;
const suitOf = (k) => (k < 27 ? Math.floor(k / 9) : 3); // 0 char, 1 dot, 2 bam, 3 honor
const numOf = (k) => (k % 9) + 1;
const isHonor = (k) => k >= 27 && k < 34;
const isWind = (k) => k >= 27 && k <= 30;
const isDragon = (k) => k >= 31 && k <= 33;
const isFlower = (k) => k >= 34 && k <= 41;
const isTerminal = (k) => isSuited(k) && (numOf(k) === 1 || numOf(k) === 9);
const isTermOrHonor = (k) => isTerminal(k) || isHonor(k);

const SUIT_NAMES = ['Characters', 'Dots', 'Bamboos'];
const HONOR_NAMES = ['East', 'South', 'West', 'North', 'Red Dragon', 'Green Dragon', 'White Dragon'];
const FLOWER_NAMES = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo', 'Spring', 'Summer', 'Autumn', 'Winter'];

function tileName(k) {
  if (isSuited(k)) return `${numOf(k)} ${SUIT_NAMES[suitOf(k)]}`;
  if (isHonor(k)) return HONOR_NAMES[k - 27];
  if (isFlower(k)) return FLOWER_NAMES[k - 34];
  return '?';
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 136 playing tiles + 8 flowers/seasons = 144. */
function buildWall(withFlowers = true) {
  const wall = [];
  for (let k = 0; k < NUM_KINDS; k++) for (let c = 0; c < 4; c++) wall.push(k);
  if (withFlowers) for (let k = 34; k <= 41; k++) wall.push(k);
  return shuffle(wall);
}

function toCounts(tiles) {
  const c = new Array(NUM_KINDS).fill(0);
  for (const t of tiles) if (t < NUM_KINDS) c[t]++;
  return c;
}

const sortTiles = (tiles) => tiles.slice().sort((a, b) => a - b);

module.exports = {
  EAST, SOUTH, WEST, NORTH, RED, GREEN, WHITE, NUM_KINDS,
  isSuited, suitOf, numOf, isHonor, isWind, isDragon, isFlower, isTerminal, isTermOrHonor,
  tileName, buildWall, toCounts, sortTiles, shuffle,
};
