var m = require('../');
var test = require('tape');
var TransformUtils = require('./utils/transform');

test('transform1', function(t) {
	var todoCalc = 0;
	var stateCalc = 0;
	var state = m.observable({
		todos: [{
			title: "coffee"
		}],
		name: "michel"
	});

	var mapped;
	var unloaded = [];

	var transformState = m.createTransformer(function(state) {
		stateCalc++;
		return state.name + state.todos.map(transformTodo).join(",");
	})

	var transformTodo = m.createTransformer(function(todo) {
		todoCalc++;
		return todo.title.toUpperCase();
	}, function cleanup(todo, text) {
		unloaded.push([todo, text]);
	});

	m.autorun(function() {
		mapped = transformState(state);
	});

	t.equal(mapped, "michelCOFFEE");
	t.equal(stateCalc, 1);
	t.equal(todoCalc, 1);

	state.name = "john";
	t.equal(mapped, "johnCOFFEE");
	t.equal(stateCalc, 2);
	t.equal(todoCalc, 1);

	state.todos[0].title = "TEA";
	t.equal(mapped, "johnTEA");
	t.equal(stateCalc, 3);
	t.equal(todoCalc, 2);

	state.todos.push({ title: "BISCUIT" });
	t.equal(mapped, "johnTEA,BISCUIT");
	t.equal(stateCalc, 4);
	t.equal(todoCalc, 3);

	var tea = state.todos.shift();
	t.equal(mapped, "johnBISCUIT");
	t.equal(stateCalc, 5);
	t.equal(todoCalc, 3);

	t.equal(unloaded.length, 1);
	t.equal(unloaded[0][0], tea);
	t.equal(unloaded[0][1], "TEA");
	t.equal(m.extras.getDNode(tea, "title").observers.length, 0);
	t.equal(m.extras.getDNode(state.todos[0], "title").observers.length, 1);


	tea.title = "mint";
	t.equal(mapped, "johnBISCUIT");
	t.equal(stateCalc, 5);
	t.equal(todoCalc, 3);


	t.end();
});

test('transform using root-1 transformer', function(t) {
	var todoCalc = 0;
	var stateCalc = 0;
	var state = m.observable({
		todos: [{
			title: "coffee"
		}],
		name: "michel"
	});

	var unloaded = [];

	var transformState = m.createTransformer(function(state) {
		stateCalc++;
		return state.name + state.todos.map(transformTodo).join(",");
	})

	var transformTodo = m.createTransformer(function(todo) {
		todoCalc++;
		return todo.title.toUpperCase();
	}, function cleanup(todo, text) {
		unloaded.push([todo, text]);
	});

	var transformController = transformState.root(state);

	t.equal(transformController.value, "michelCOFFEE");
	t.equal(stateCalc, 1);
	t.equal(todoCalc, 1);

	state.name = "john";
	t.equal(transformController.value, "johnCOFFEE");
	t.equal(stateCalc, 2);
	t.equal(todoCalc, 1);

	state.todos[0].title = "TEA";
	t.equal(transformController.value, "johnTEA");
	t.equal(stateCalc, 3);
	t.equal(todoCalc, 2);

	state.todos.push({ title: "BISCUIT" });
	t.equal(transformController.value, "johnTEA,BISCUIT");
	t.equal(stateCalc, 4);
	t.equal(todoCalc, 3);

	var tea = state.todos.shift();
	t.equal(transformController.value, "johnBISCUIT");
	t.equal(stateCalc, 5);
	t.equal(todoCalc, 3);

	t.equal(unloaded.length, 1);
	t.equal(unloaded[0][0], tea);
	t.equal(unloaded[0][1], "TEA");
	t.equal(m.extras.getDNode(tea, "title").observers.length, 0);
	t.equal(m.extras.getDNode(state.todos[0], "title").observers.length, 1);

	tea.title = "mint";
	t.equal(transformController.value, "johnBISCUIT");
	t.equal(stateCalc, 5);
	t.equal(todoCalc, 3);

	transformController.dispose();

	state.todos[0].title = "disposed";
	t.equal(stateCalc, 5);
	t.equal(todoCalc, 3);
	t.equal(m.extras.getDNode(state, "name").observers.length, 0);

	t.throws(function() {
		transformController.value;
	}, "already disposed");

	t.end();
});

// testing: https://github.com/mweststrate/mobservable/issues/67
test('transform tree (modifying tree)', function(t) {
  var pluckFn = TransformUtils.pluckFn;
  var identity = TransformUtils.identity;
	var testSet = TransformUtils.testSet();
	var state = testSet.state;
	var stats = testSet.stats;
  var TreeNode = testSet.TreeNode;
  var DisplayNode = testSet.DisplayNode;

  var nodeCalc = 0;
  var renderCalc = 0;
  var renderNodeCalc = 0;
  var node, children;

	var transformNode = m.createTransformer(function(node) {
		nodeCalc++;
		return new DisplayNode(node);
	}, function cleanup(node, displayNode) { displayNode.destroy(); }); // KM: maybe the transformed node should be the first argument?

	// transform nodes to renderedNodes
	m.autorun(function() {
		// KM: ideally, I would like to do an assignment here, but it creates a cycle and would need to preserve ms.asStructure:
		//
		// state.renderedNodes = state.root ? state.root.transform(transformNode) : [];
		//

		var renderedNodes = state.root ? state.root.transform(transformNode) : [];
		state.renderedNodes.replace(renderedNodes);
	});

	// render
	m.autorun(function() {
		renderCalc++;
		renderNodeCalc += state.renderedNodes.length;
	});

	t.equal(nodeCalc, 			0);
	t.equal(stats.nodeCount,	0);
	t.equal(renderCalc, 		1);
	t.equal(renderNodeCalc, 0);
	t.deepEqual(state.renderedNodes.length, 0);

	////////////////////////////////////
	// Incremental Tree
	////////////////////////////////////

	// initialize root-1
	state.root = new TreeNode('root-1');
	t.equal(nodeCalc, 				1);
	t.equal(stats.nodeCount,	1);
	t.equal(renderCalc, 			2);
	t.equal(renderNodeCalc, 	1);
	t.deepEqual(state.renderedNodes.length, 1);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1']);

	// add first child
	state.root.addChild(new TreeNode('root-1-child-1'));
	t.equal(nodeCalc, 				1 + 1);
	t.equal(stats.nodeCount,	1 + 1);
	t.equal(renderCalc, 			2 + 1);
	t.equal(renderNodeCalc, 	1 + 2);
	t.deepEqual(state.renderedNodes.length, 2);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1', 'root-1-child-1']);

	// add second child
	state.root.addChild(new TreeNode('root-1-child-2'));
	t.equal(nodeCalc, 				1 + 1 + 1);
	t.equal(stats.nodeCount,	1 + 1 + 1);
	t.equal(renderCalc, 			2 + 1 + 1);
	t.equal(renderNodeCalc, 	1 + 2 + 3);
	t.deepEqual(state.renderedNodes.length, 3);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1', 'root-1-child-1', 'root-1-child-2']);

	// add first child to second child
	node = state.root.find(function(node) { return node.name === 'root-1-child-2'; });
	node.addChild(new TreeNode('root-1-child-2-child-1'));
	t.equal(nodeCalc, 				1 + 1 + 1 + 1);
	t.equal(stats.nodeCount,	1 + 1 + 1 + 1);
	t.equal(renderCalc, 			2 + 1 + 1 + 1);
	t.equal(renderNodeCalc, 	1 + 2 + 3 + 4);
	t.deepEqual(state.renderedNodes.length, 4);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1', 'root-1-child-1', 'root-1-child-2', 'root-1-child-2-child-1']);

	// add first child to first child
	node = state.root.find(function(node) { return node.name === 'root-1-child-1'; });
	node.addChild(new TreeNode('root-1-child-1-child-1'));
	t.equal(nodeCalc, 				1 + 1 + 1 + 1 + 1);
	t.equal(stats.nodeCount, 	1 + 1 + 1 + 1 + 1);
	t.equal(renderCalc, 			2 + 1 + 1 + 1 + 1);
	t.equal(renderNodeCalc, 	1 + 2 + 3 + 4 + 5);
	t.deepEqual(state.renderedNodes.length, 5);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1', 'root-1-child-1', 'root-1-child-1-child-1', 'root-1-child-2', 'root-1-child-2-child-1']);

	// remove children from first child
	node = state.root.find(function(node) { return node.name === 'root-1-child-1'; });
	node.children.splice(0);
	t.equal(nodeCalc, 				1 + 1 + 1 + 1 + 1 + 0);
	t.equal(stats.nodeCount, 	1 + 1 + 1 + 1 + 1 - 1);
	t.equal(renderCalc, 			2 + 1 + 1 + 1 + 1 + 1);
	t.equal(renderNodeCalc, 	1 + 2 + 3 + 4 + 5 + 4);
	t.deepEqual(state.renderedNodes.length, 4);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1', 'root-1-child-1', 'root-1-child-2', 'root-1-child-2-child-1']);

	// remove children from first child with no children should be a no-op
	node = state.root.find(function(node) { return node.name === 'root-1-child-1'; });
	node.children.splice(0);
	t.equal(nodeCalc, 				1 + 1 + 1 + 1 + 1 + 0 + 0);
	t.equal(stats.nodeCount, 	1 + 1 + 1 + 1 + 1 - 1 + 0);
	t.equal(renderCalc, 			2 + 1 + 1 + 1 + 1 + 1 + 0);
	t.equal(renderNodeCalc, 	1 + 2 + 3 + 4 + 5 + 4 + 0);
	t.deepEqual(state.renderedNodes.length, 4);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1', 'root-1-child-1', 'root-1-child-2', 'root-1-child-2-child-1']);

	// remove children from root-1
	state.root.children.splice(0);
	t.equal(nodeCalc, 				1 + 1 + 1 + 1 + 1 + 0 + 0 + 0);
	t.equal(stats.nodeCount, 	1 + 1 + 1 + 1 + 1 - 1 + 0 - 3);
	t.equal(renderCalc, 			2 + 1 + 1 + 1 + 1 + 1 + 0 + 1);
	t.equal(renderNodeCalc, 	1 + 2 + 3 + 4 + 5 + 4 + 0 + 1);
	t.deepEqual(state.renderedNodes.length, 1);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1']);

	////////////////////////////////////
	// Batch Tree (Partial)
	////////////////////////////////////

	// add partial tree as a batch
	children = [];
	children.push(new TreeNode('root-1-child-1b'));
	children[0].addChild(new TreeNode('root-1-child-1b-child-1'))
	children.push(new TreeNode('root-1-child-2b'));
	children[1].addChild(new TreeNode('root-1-child-2b-child-1'))
	state.root.addChildren(children);
	t.equal(nodeCalc, 				1 + 1 + 1 + 1 + 1 + 0 + 0 + 0 + 4);
	t.equal(stats.nodeCount, 	1 + 1 + 1 + 1 + 1 - 1 + 0 - 3 + 4);
	t.equal(renderCalc, 			2 + 1 + 1 + 1 + 1 + 1 + 0 + 1 + 1);
	t.equal(renderNodeCalc, 	1 + 2 + 3 + 4 + 5 + 4 + 0 + 1 + 5);
	t.deepEqual(state.renderedNodes.length, 5);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1', 'root-1-child-1b', 'root-1-child-1b-child-1', 'root-1-child-2b', 'root-1-child-2b-child-1']);

	// remove root-1
	state.root = null;
	t.equal(nodeCalc, 				1 + 1 + 1 + 1 + 1 + 0 + 0 + 0 + 4 + 0);
	t.equal(stats.nodeCount, 	1 + 1 + 1 + 1 + 1 - 1 + 0 - 3 + 4 - 5);
	t.equal(renderCalc, 			2 + 1 + 1 + 1 + 1 + 1 + 0 + 1 + 1 + 1);
	t.equal(renderNodeCalc, 	1 + 2 + 3 + 4 + 5 + 4 + 0 + 1 + 5 + 0);
	t.deepEqual(state.renderedNodes.length, 0);

	////////////////////////////////////
	// Batch Tree (Full)
	////////////////////////////////////

	// add full tree as a batch
	node = new TreeNode('root-1b')
	node.addChild(new TreeNode('root-1b-child-1'));
	node.children[0].addChild(new TreeNode('root-1b-child-1-child-1'))
	node.addChild(new TreeNode('root-1b-child-2'));
	node.children[1].addChild(new TreeNode('root-1b-child-2-child-1'))
	state.root = node;
	t.equal(nodeCalc, 				1 + 1 + 1 + 1 + 1 + 0 + 0 + 0 + 4 + 0 + 5);
	t.equal(stats.nodeCount, 	1 + 1 + 1 + 1 + 1 - 1 + 0 - 3 + 4 - 5 + 5);
	t.equal(renderCalc, 			2 + 1 + 1 + 1 + 1 + 1 + 0 + 1 + 1 + 1 + 1);
	t.equal(renderNodeCalc, 	1 + 2 + 3 + 4 + 5 + 4 + 0 + 1 + 5 + 0 + 5);
	t.deepEqual(state.renderedNodes.length, 5);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1b', 'root-1b-child-1', 'root-1b-child-1-child-1', 'root-1b-child-2', 'root-1b-child-2-child-1']);

	t.end();
});

test('transform tree (modifying expanded)', function(t) {
  var pluckFn = TransformUtils.pluckFn;
  var identity = TransformUtils.identity;
	var testSet = TransformUtils.testSet();
	var state = testSet.state;
	var stats = testSet.stats;
  var TreeNode = testSet.TreeNode;
  var DisplayNode = testSet.DisplayNode;

  var nodeCalc = 0;
  var renderCalc = 0;
  var renderNodeCalc = 0;
  var node, children;

	var transformNode = m.createTransformer(function(node) {
		nodeCalc++;
		return new DisplayNode(node);
	}, function cleanup(node, displayNode) { displayNode.destroy(); });

	// transform nodes to renderedNodes
	m.autorun(function() {
		var renderedNodes = state.root ? state.root.transform(transformNode) : [];
		state.renderedNodes.replace(renderedNodes);
	});

	// render
	m.autorun(function() {
		renderCalc++;
		renderNodeCalc += state.renderedNodes.length;
	});

	t.equal(nodeCalc, 			0);
	t.equal(stats.nodeCount,	0);
	t.equal(renderCalc, 		1);
	t.equal(renderNodeCalc, 0);
	t.deepEqual(state.renderedNodes.length, 0);

	////////////////////////////////////
	// Expanded
	////////////////////////////////////

	node = new TreeNode('root-1b')
	node.addChild(new TreeNode('root-1b-child-1'));
	node.children[0].addChild(new TreeNode('root-1b-child-1-child-1'))
	node.addChild(new TreeNode('root-1b-child-2'));
	node.children[1].addChild(new TreeNode('root-1b-child-2-child-1'))
	state.root = node;

	// toggle root to collapsed
	state.renderedNodes[0].toggleCollapsed();
	t.equal(nodeCalc, 				5 + 0);
	t.equal(stats.nodeCount, 	5 - 4);
	t.equal(renderCalc, 			2 + 1);
	t.equal(renderNodeCalc, 	5 + 1);
	t.deepEqual(state.renderedNodes.length, 1);
	t.notDeepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity)); // not a direct map of the tree nodes
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1b']);

	// toggle root to expanded
	state.renderedNodes[0].toggleCollapsed();
	t.equal(nodeCalc, 				5 + 0 + 4);
	t.equal(stats.nodeCount, 	5 - 4 + 4);
	t.equal(renderCalc, 			2 + 1 + 1);
	t.equal(renderNodeCalc, 	5 + 1 + 5);
	t.deepEqual(state.renderedNodes.length, 5);
	t.deepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity));
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1b', 'root-1b-child-1', 'root-1b-child-1-child-1', 'root-1b-child-2', 'root-1b-child-2-child-1']);

	// toggle child-1 collapsed
	state.renderedNodes[1].toggleCollapsed();
	t.equal(nodeCalc, 				5 + 0 + 4 + 0);
	t.equal(stats.nodeCount, 	5 - 4 + 4 - 1);
	t.equal(renderCalc, 			2 + 1 + 1 + 1);
	t.equal(renderNodeCalc, 	5 + 1 + 5 + 4);
	t.deepEqual(state.renderedNodes.length, 4);
	t.notDeepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity)); // not a direct map of the tree nodes
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1b', 'root-1b-child-1', 'root-1b-child-2', 'root-1b-child-2-child-1']);

	// toggle child-2-child-1 collapsed should be a no-op
	state.renderedNodes[state.renderedNodes.length-1].toggleCollapsed();
	t.equal(nodeCalc, 				5 + 0 + 4 + 0 + 0);
	t.equal(stats.nodeCount, 	5 - 4 + 4 - 1 + 0);
	t.equal(renderCalc, 			2 + 1 + 1 + 1 + 0);
	t.equal(renderNodeCalc, 	5 + 1 + 5 + 4 + 0);
	t.deepEqual(state.renderedNodes.length, 4);
	t.notDeepEqual(state.renderedNodes.map(pluckFn('node')), state.root.map(identity)); // not a direct map of the tree nodes
	t.deepEqual(state.renderedNodes.map(pluckFn('node.name')), ['root-1b', 'root-1b-child-1', 'root-1b-child-2', 'root-1b-child-2-child-1']);

	t.end();
});