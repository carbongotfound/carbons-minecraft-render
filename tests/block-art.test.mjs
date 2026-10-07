import test from 'node:test';
import assert from 'node:assert/strict';
import {paintHDTextures, paintOpaqueLeafTextures, HD_LEAF_TILES, HD_EMISSIVE_TILES, PLANT_TILES} from '../public/src/hd-textures.js';

function atlas() {
  const pixels = new Uint8ClampedArray(512 * 512 * 4); pixels.fill(128);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  const ctx = {
    createImageData: (width, height) => ({width, height, data: new Uint8ClampedArray(width * height * 4)}),
    putImageData(image, x, y) { for (let row = 0; row < image.height; row++) pixels.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), ((y + row) * 512 + x) * 4); },
    getImageData(x, y, width, height) {
      const image = this.createImageData(width, height);
      for (let row = 0; row < height; row++) image.data.set(pixels.subarray(((y + row) * 512 + x) * 4, ((y + row) * 512 + x + width) * 4), row * width * 4);
      return image;
    },
  };
  return {pixels, getContext: () => ctx, tile: tile => ctx.getImageData(tile % 16 * 32, Math.floor(tile / 16) * 32, 32, 32).data};
}
const pixel = (data, x, y) => [...data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)];

test('the block atlas is deterministic original 16px artwork scaled without interpolated pixels', () => {
  const first = atlas(), second = atlas(); paintHDTextures(first); paintHDTextures(second);
  assert.deepEqual(first.pixels, second.pixels);
  for (const tile of [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 13, 17, 18, 19, 114, ...Object.values(PLANT_TILES)]) {
    const data = first.tile(tile);
    for (let y = 0; y < 32; y += 2) for (let x = 0; x < 32; x += 2) {
      const expected = pixel(data, x, y);
      assert.deepEqual(pixel(data, x + 1, y), expected, `tile ${tile}`);
      assert.deepEqual(pixel(data, x, y + 1), expected, `tile ${tile}`);
      assert.deepEqual(pixel(data, x + 1, y + 1), expected, `tile ${tile}`);
    }
  }
});

test('leaves and decorative flora have opaque pixels and real transparent cutouts', () => {
  const canvas = atlas(); paintHDTextures(canvas);
  for (const tile of [...HD_LEAF_TILES, ...Object.values(PLANT_TILES)]) {
    const alphas = new Set([...canvas.tile(tile)].filter((_, i) => i % 4 === 3));
    assert.deepEqual(alphas, new Set([0, 255]), `tile ${tile}`);
  }
  const glass = canvas.tile(10);
  assert.equal(pixel(glass, 16, 16)[3], 0); assert.equal(pixel(glass, 0, 0)[3], 255);
});

test('Fast leaf artwork is repainted fully opaque without relying on hidden Canvas RGB', () => {
  const fancy = atlas(), fast = atlas(); paintHDTextures(fancy); paintHDTextures(fast);
  // Simulate Canvas premultiplication discarding RGB in fully transparent pixels.
  for (let i = 0; i < fast.pixels.length; i += 4) if (!fast.pixels[i + 3]) fast.pixels.fill(0, i, i + 3);
  const nonleafBefore = fast.pixels.slice(); paintOpaqueLeafTextures(fast);
  for (const tile of HD_LEAF_TILES) {
    const original = fancy.tile(tile), opaque = fast.tile(tile);
    for (let i = 0; i < opaque.length; i += 4) {
      assert.equal(opaque[i + 3], 255);
      assert.deepEqual([...opaque.subarray(i, i + 3)], [...original.subarray(i, i + 3)]);
      assert.ok(opaque[i + 1] > opaque[i], 'Every Fast leaf pixel is green, including former cutouts');
    }
  }
  for (let tile = 0; tile < 256; tile++) if (!HD_LEAF_TILES.includes(tile)) {
    const x = tile % 16 * 32, y = Math.floor(tile / 16) * 32;
    for (let row = 0; row < 32; row++) {
      const offset = ((y + row) * 512 + x) * 4;
      assert.deepEqual(fast.pixels.subarray(offset, offset + 128), nonleafBefore.subarray(offset, offset + 128));
    }
  }
});

test('grass retains a green cap above dirt and dedicated special atlas IDs are preserved', () => {
  const canvas = atlas(), torch = canvas.tile(21), portal = canvas.tile(74); paintHDTextures(canvas);
  const side = canvas.tile(1), top = pixel(side, 14, 0), bottom = pixel(side, 14, 30);
  assert.ok(top[1] > top[0]); assert.ok(bottom[0] > bottom[1]);
  assert.deepEqual(canvas.tile(21), torch); assert.deepEqual(canvas.tile(74), portal);
  assert.deepEqual(HD_EMISSIVE_TILES, [67, 73, 88, 143]);
  assert.deepEqual(Object.values(PLANT_TILES), [240, 241, 242, 243, 244, 245, 246]);
});
