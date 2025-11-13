const DotContext = require('./DotContext.js');

const ctx = new DotContext();

// Generate some dots
console.log(ctx.makedot('nodeA')); // [nodeA, 1]
console.log(ctx.makedot('nodeA')); // [nodeA, 2]
console.log(ctx.makedot('nodeB')); // [nodeB, 1]

// Check if dots exist
console.log(ctx.dotin(['nodeA', 1])); // true
console.log(ctx.dotin(['nodeA', 99])); // false

// Insert and compact
ctx.insertDot(['nodeC', 1]);
ctx.insertDot(['nodeC', 2]);
console.log(ctx.cc); // Should have nodeC: 2 after compacting

// Test join
const ctx2 = new DotContext();
ctx2.makedot('nodeD');
ctx.join(ctx2);
console.log(ctx.cc); // Should now include nodeD: 1