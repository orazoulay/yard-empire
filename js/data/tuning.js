// Movement and timing constants shared by the game and the balance simulator (tools/balance).
// Change a number here and both stay in step.
export const TUNING = {
  playerSpeed: 7,        // world units per second
  workerSpeed: 4.2,
  workerCapacity: 6,
  pickRate: 0.11,        // seconds between items picked up
  dropRate: 0.07,        // seconds between items dropped
  frame: 1 / 60,         // the game moves one item per frame at most, so real rates are rate + one frame
  procZone: { dx: 2.6, dz: 2.2, radius: 1.9 },   // input pad at -dx, output pad at +dx, in front of the machine
  sourceRadius: 3.4,
  shopRadius: 1.9,
  plotRadius: 1.9,
  processor: { inputCap: 12, outputCap: 24 },
};
