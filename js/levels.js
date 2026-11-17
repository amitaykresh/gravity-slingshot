// Level data. World is 1600 x 900. Bodies without `m` get mass from their radius.
// orbit: { cx, cy | around: <body index>, R, w (rad/s), phase }
(function (root) {
  'use strict';
  root.LEVELS = [
    {
      name: 'First Light',
      hint: 'Drag anywhere and release to fling the probe. Gravity bends your path around the planet.',
      start: { x: 160, y: 450 },
      target: { x: 1440, y: 450, r: 36 },
      bodies: [{ x: 800, y: 450, r: 70 }],
      stars: [{ x: 492, y: 370 }, { x: 855, y: 327 }, { x: 1177, y: 397 }],
    },
    {
      name: 'Twin Wells',
      hint: 'Two planets, two pulls. Thread the gap or swing around.',
      start: { x: 150, y: 760 },
      target: { x: 1460, y: 160, r: 34 },
      bodies: [{ x: 620, y: 470, r: 58 }, { x: 1040, y: 430, r: 58 }],
      stars: [{ x: 504, y: 641 }, { x: 852, y: 436 }, { x: 1185, y: 260 }],
    },
    {
      name: 'Moonrise',
      hint: 'The moon keeps moving. Timing matters as much as aim.',
      start: { x: 150, y: 150 },
      target: { x: 1450, y: 760, r: 36 },
      bodies: [
        { x: 800, y: 480, r: 80 },
        { r: 22, orbit: { around: 0, R: 200, w: 0.9, phase: 0 } },
      ],
      stars: [{ x: 529, y: 197 }, { x: 932, y: 317 }, { x: 1232, y: 548 }],
    },
    {
      name: 'Event Horizon',
      hint: 'A black hole. Tiny, invisible pull from far away, brutal up close. Swing around it to collect the stars.',
      start: { x: 150, y: 450 },
      target: { x: 300, y: 130, r: 36 },
      bodies: [{ x: 820, y: 450, r: 18, m: 8e7, type: 'hole' }],
      stars: [{ x: 367, y: 557 }, { x: 798, y: 544 }, { x: 530, y: 158 }],
    },
    {
      name: 'Asteroid Gate',
      hint: 'Squeeze through the gate, then let the big planet slingshot you home.',
      start: { x: 140, y: 450 },
      target: { x: 1470, y: 450, r: 34 },
      bodies: [
        { x: 640, y: 120, r: 30 }, { x: 640, y: 300, r: 30 },
        { x: 640, y: 600, r: 30 }, { x: 640, y: 780, r: 30 },
        { x: 1150, y: 450, r: 62 },
      ],
      stars: [{ x: 474, y: 495 }, { x: 835, y: 559 }, { x: 1208, y: 588 }],
    },
    {
      name: 'Grand Tour',
      hint: 'Everything orbits the sun, including the target. Lead your shot.',
      start: { x: 120, y: 820 },
      target: { r: 38, orbit: { cx: 800, cy: 450, R: 360, w: -0.35, phase: 0 } },
      bodies: [
        { x: 800, y: 450, r: 60 },
        { r: 28, orbit: { cx: 800, cy: 450, R: 210, w: 0.55, phase: 2 } },
      ],
      stars: [{ x: 385, y: 733 }, { x: 664, y: 629 }, { x: 916, y: 407 }],
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
