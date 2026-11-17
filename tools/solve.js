// Level checker: proves every level is winnable and that all 3 stars fit on one winning flight.
//   node tools/solve.js
// No node? On macOS:  { cat js/physics.js js/levels.js tools/solve-core.js; echo 'solveAll(Physics, LEVELS, null, 2)'; } > /tmp/s.js && osascript -l JavaScript /tmp/s.js
const path = require('path');
require(path.join(__dirname, '../js/physics.js'));
require(path.join(__dirname, '../js/levels.js'));
const solveAll = require('./solve-core.js');
const only = process.argv[2] != null ? +process.argv[2] : null;
console.log(solveAll(globalThis.Physics, globalThis.LEVELS, only, 2));
