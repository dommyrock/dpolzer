export interface EpochMeta { name: string; tag: string; accent: number; night: number; glow?: number }

/** `night` = share of the day/night cycle spent in the dark (neon epochs love the night). */
export const EPOCH_META: EpochMeta[] = [
  { name: 'Forest Camp', tag: 'A fire, a few hides, and the whole forest ahead', accent: 0x8fd36b, night: 0.26 },
  { name: 'Farm Hamlet', tag: 'Fields are cleared and the first barns go up', accent: 0xe3c15a, night: 0.26 },
  { name: 'Village', tag: 'A chapel bell, a market, neighbours', accent: 0xf0a35e, night: 0.28 },
  { name: 'Medieval Town', tag: 'Cobbled streets under the castle keep', accent: 0xe07a5f, night: 0.3 },
  { name: 'Walled City', tag: 'Spires, plazas and pastel facades', accent: 0xd9b96a, night: 0.3 },
  { name: 'Industrial City', tag: 'Brick, steam and smokestacks', accent: 0xc98b5b, night: 0.36 },
  { name: 'Early-Modern City', tag: 'Art-deco towers and the first motorcars', accent: 0xf2d28a, night: 0.42 },
  { name: 'Modern Downtown', tag: 'Glass, steel and a skyline', accent: 0x6fc3f0, night: 0.44 },
  { name: 'Neon Metropolis', tag: 'The city that never switches off', accent: 0xff5fb8, night: 0.62, glow: 0.45 },
  { name: 'Cyberpunk Megacity', tag: 'Megatowers, holo-ads and sky traffic', accent: 0x3cf2ff, night: 0.66, glow: 0.45 },
  { name: 'Garden Metropolis', tag: 'Towers wrapped in forest, waterfalls between them', accent: 0x7be38a, night: 0.3, glow: 0.12 },
  { name: 'Spaceport City', tag: 'Rockets rise from the gardens every few minutes', accent: 0xffb45a, night: 0.4, glow: 0.2 },
  { name: 'Lunar Gateway', tag: 'Shuttles run to the base on the Moon', accent: 0xcfd8ff, night: 0.46, glow: 0.25 },
  { name: 'Mars Frontier', tag: 'Two worlds now, and the traffic between them', accent: 0xff7a5a, night: 0.46, glow: 0.25 },
];

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];

/** What it costs to move on from an epoch. The treasury is emptied by every jump. */
export const jumpCost = (epoch: number) => Math.round(120 * Math.pow(5.2, epoch - 1));
const SAVED = [0, 0.13, 0.33, 0.61, 1];
/** Coins in the treasury: starts at 0 in every epoch and reaches the jump cost at zone 5. */
export const coinsAt = (epoch: number, zone: number) => Math.round(jumpCost(epoch) * SAVED[zone - 1]);
/** Coins earned per second while waiting in a zone (a slow trickle towards the next zone's total). */
export const incomeAt = (epoch: number, zone: number) => (zone >= 5 ? 0 : (jumpCost(epoch) * (SAVED[zone] - SAVED[zone - 1])) / 90);
export const popAt = (step: number) => Math.round(6 * Math.pow(1.345, step) + step * 3);

export function fmt(n: number): string {
  if (n < 1000) return String(Math.round(n));
  const u = ['K', 'M', 'B', 'T'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0)) + u[i];
}
