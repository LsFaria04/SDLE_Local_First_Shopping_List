const DotContext = require('./DotContext.js');
const DotKernel = require('./DotKernel.js');
const AWORSet = require('./AWORSet.js');

console.log('=== Testing DotContext ===');
const ctx = new DotContext();

// Generate some dots
console.log('makedot(nodeA):', ctx.makedot('nodeA')); // [nodeA, 1]
console.log('makedot(nodeA):', ctx.makedot('nodeA')); // [nodeA, 2]
console.log('makedot(nodeB):', ctx.makedot('nodeB')); // [nodeB, 1]

// Check if dots exist
console.log('dotin([nodeA, 1]):', ctx.dotin(['nodeA', 1])); // true
console.log('dotin([nodeA, 99]):', ctx.dotin(['nodeA', 99])); // false

// Insert and compact
ctx.insertDot(['nodeC', 1]);
ctx.insertDot(['nodeC', 2]);
console.log('Compact context cc:', ctx.cc); // Should have nodeC: 2 after compacting

// Test join
const ctx2 = new DotContext();
ctx2.makedot('nodeD');
ctx.join(ctx2);
console.log('After join, cc:', ctx.cc); // Should now include nodeD: 1

console.log('\n=== Testing DotKernel ===');
const dk1 = new DotKernel();

// Add items
console.log('Adding "Milk" to kernel...');
dk1.add('alice', 'Milk');
console.log('Adding "Bread" to kernel...');
dk1.add('alice', 'Bread');
console.log('DotKernel ds:', dk1.ds);

// Remove item
console.log('\nRemoving "Milk"...');
dk1.rmv('Milk');
console.log('DotKernel ds after remove:', dk1.ds);

// Test join
const dk2 = new DotKernel();
dk2.add('bob', 'Eggs');
dk2.add('bob', 'Cheese');
console.log('\ndk2 ds:', dk2.ds);

console.log('\nJoining dk1 and dk2...');
dk1.join(dk2);
console.log('dk1 ds after join:', dk1.ds);

console.log('\n=== Testing AWORSet ===');
const set1 = new AWORSet('alice');
const set2 = new AWORSet('bob');

// Add items to set1
console.log('Alice adds Milk, Bread, Eggs');
set1.add('Milk');
set1.add('Bread');
set1.add('Eggs');
console.log('set1.read():', Array.from(set1.read()));

// Check membership
console.log('set1.in("Milk"):', set1.in('Milk')); // true
console.log('set1.in("Cheese"):', set1.in('Cheese')); // false

// Bob adds items
console.log('\nBob adds Cheese, Butter');
set2.add('Cheese');
set2.add('Butter');
console.log('set2.read():', Array.from(set2.read()));

// Alice removes Bread
console.log('\nAlice removes Bread');
set1.rmv('Bread');
console.log('set1.read():', Array.from(set1.read()));

// Test concurrent add of same item
console.log('\nBoth add "Yogurt" concurrently');
set1.add('Yogurt');
set2.add('Yogurt');

// Merge replicas
console.log('\nMerging set1 and set2...');
set1.join(set2);
console.log('set1.read() after join:', Array.from(set1.read()));
console.log('set1 should have: Milk, Eggs, Cheese, Butter, Yogurt');

// Test remove after concurrent add
console.log('\nAlice removes Yogurt (which was added concurrently)');
set1.rmv('Yogurt');
console.log('set1.read():', Array.from(set1.read()));

console.log('\n=== All tests complete ===')