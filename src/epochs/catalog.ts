import { CATS_A, type Cat, type Extras } from './epochs_a';
import { type Maker } from './shapes';
import { e6 } from './epochs_6';
import { e7, e8 } from './epochs_7_8';
import { e9, e10 } from './epochs_9_10';
import { e11 } from './epochs_11';
import { x12, x13, x14 } from './epochs_12_14';

/** Spread the new types evenly through the old list so every district gets some of them. */
function weave(base: Maker[], add: Maker[] = []): Maker[] {
  const out = [...base];
  add.forEach((m, i) => out.splice(Math.min(out.length, Math.round(((i + 0.5) * (base.length + add.length)) / add.length)), 0, m));
  return out;
}

/** Epochs 12-14 are the garden city of epoch 11 plus a growing layer of space-age buildings. */
const evolve = (base: Cat, x: Extras): Cat => ({
  small: weave(base.small, x.small), large: weave(base.large, x.large), huge: weave(base.huge ?? [], x.huge),
  fill: weave(base.fill, x.fill), sec: [...(x.sec ?? []), ...base.sec], mega: x.mega ?? base.mega, hero: x.hero ?? base.hero,
  road: x.road ?? base.road, pave: x.pave ?? base.pave, bridge: x.bridge ?? base.bridge,
});

const e12 = evolve(e11, x12), e13 = evolve(e12, x13), e14 = evolve(e13, x14);

/** One sprite library per epoch, in order. */
export const CATS: Cat[] = [...CATS_A, e6, e7, e8, e9, e10, e11, e12, e13, e14];
