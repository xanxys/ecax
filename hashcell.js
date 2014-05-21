// Exponentially fast elementary automata simulation & visualization.

var Tracker = function(duration) {
	this.timeout = duration + new Date().getTime() / 1000;
};

Tracker.prototype.shouldRun = function() {
	var t = new Date().getTime() / 1000;
	return (t < this.timeout);
};

// Hashlife for ECA.
// When traversed, the universe will look like a binary tree;
// however, nodes with same pattern are shared.
var HashCell = function(rule) {
	this.rule = rule;
	this.new_id = 0;
	this.cache = {};
	this.setInitialState(function(x) {
		return x === 0;
	});

	this.tile_size = 256;
	this.extension_op = null;
};

HashCell.prototype.step = function(state) {
	var rule = this.rule;

	return _.map(state, function(v_c, ix) {
		var v_l = (ix - 1 < 0) ? state[state.length - 1] : state[ix - 1];
		var v_r = (ix + 1 >= state.length) ? state[0] : state[ix + 1];

		// Encode current neighbors to [0, 8) value.
		var v_enc = (v_l ? 4 : 0) | (v_c ? 2 : 0) | (v_r ? 1 : 0);

		// Lookup
		return (rule & (1 << v_enc)) != 0;
	});
};

HashCell.prototype.setInitialState = function(initial) {
	var _this = this;
	this.initial = initial;

	// [-2^(level-1), 2^(level-1))
	var level = 10;
	this.dx = -Math.pow(2, level - 1);
	this.root = this.createFromInitial(this.dx, level);
};

// This is original version of createFromInitialInterleaved.
// Create HashCellNode that spans [dx, dx + 2^level).
HashCell.prototype.createFromInitial = function(dx, level) {
	if(level === 0) {
		return this.createCanonicalNode(this.initial(dx));
	} else {
		return this.createCanonicalNode(
			this.createFromInitial(dx, level - 1),
			this.createFromInitial(dx + Math.pow(2, level - 1), level - 1));
	}
};

// This version will take at most O(level) time.
HashCell.prototype.createFromInitialInterleaved = function(dx, level, tr) {
	var index = dx;
	var incomplete = [];

	if(this.partial_tree !== undefined && this.partial_tree !== null) {
		if(dx !== this.partial_tree.dx || level !== this.partial_tree.level) {
			throw "Calculation parameter changed while in calculation";
		}
		index = this.partial_tree.index;
		incomplete = this.partial_tree.incomplete;
	}

	while(index < dx + Math.pow(2, level)) {
		if(!tr.shouldRun()) {
			this.partial_tree = {
				// For sanity check.
				dx: dx,
				level: level,

				// Current state
				index: index,
				incomplete: incomplete,
			}
			return null;
		}

		incomplete.push(this.createCanonicalNode(this.initial(index)));
		index += 1;

		// Merge until no subtree is complete: O(level) time
		while(incomplete.length >= 2) {
			var curr = incomplete.pop();
			var prev = incomplete.pop();

			if(prev.level === curr.level) {
				incomplete.push(this.createCanonicalNode(prev, curr));
			} else {
				// Revert pop*2.
				incomplete.push(prev);
				incomplete.push(curr);
				break;
			}
		}
	}
	console.assert(incomplete.length === 1);
	this.partial_tree = null;
	return incomplete[0];
};

HashCell.prototype.getRoot = function() {
	return {
		dx: this.dx,
		node: this.root,
	};
};

HashCell.prototype.extendLeft = function(tr) {
	// Ignore operation if another extension is ongoing.
	if(this.extension_op !== "extendLeft" && this.extension_op !== null) {
		return;
	}

	this.extension_op = "extendLeft";
	var new_dx = this.dx - Math.pow(2, this.root.level);
	var subtree = this.createFromInitialInterleaved(new_dx, this.root.level, tr);

	if(subtree !== null) {
		this.root = this.createCanonicalNode(subtree, this.root);
		this.dx = new_dx;
		this.extension_op = null;
	}
};

HashCell.prototype.extendRight = function(tr) {
	// Ignore operation if another extension is ongoing.
	if(this.extension_op !== "extendRight" && this.extension_op !== null) {
		return;
	}

	this.extension_op = "extendRight";
	var new_dx = this.dx + Math.pow(2, this.root.level);
	var subtree = this.createFromInitialInterleaved(new_dx, this.root.level, tr);

	if(subtree !== null) {
		this.root = this.createCanonicalNode(this.root, subtree);
		this.extension_op = null;
	}
};

HashCell.prototype.getTileSize = function() {
	return this.tile_size;
};

// DEPRECATED
HashCell.prototype.getTile = function(ix, it, tr) {
	var _this = this;
	console.assert(it >= 0);
	var index = [ix, it];

	var x = ix * this.tile_size;
	var find = function(node, dx) {
		if(x < dx) {
			return null;
		} else if(x >= dx + Math.pow(2, node.level)) {
			return null;
		} else if(x < dx + Math.pow(2, node.level - 1)) {
			if(Math.pow(2, node.level) === _this.tile_size) {
				return node;
			} else {
				return find(node.l, dx);
			}
		} else {
			return find(node.r, dx + Math.pow(2, node.level - 1));
		}
	};

	var node_slice = find(this.root, -Math.pow(2, this.root.level - 1));
	if(node_slice === null) {
		return null;
	} else {
		var slice = node_slice.getPattern();
		return _.map(_.range(this.tile_size), function() {
			return slice;
		});
	}
};

// Behaviorally same as new HashCellNode(this, ...).
// This method ensured the created HashCellNode is shared to maximum extent.
HashCell.prototype.createCanonicalNode = function(arg0, arg1) {
	var node = new HashCellNode(this, arg0, arg1);
	var node_existing = this.cache[node.hash()];
	if(node_existing === undefined) {
		// Register new node and return.
		this.cache[node.hash()] = node;
		return node;
	} else {
		// Return existing node (newly issued id will be discarded)
		return node_existing;
	}
};

HashCell.prototype.issueId = function() {
	var id = this.new_id;
	this.new_id += 1;
	return id;
};


// Immutable node representing 2^n slice of the universe.
// A 2^(n-1) * 2^(n-2) spatio-temporal region is completely tied to
// each HashCellNode.
//
// This constructor is overloaded:
// * single-value: hc, value
// * others: hc, left, right
var HashCellNode = function(hc, arg0, arg1) {
	this.hashcell = hc;
	this.id = hc.issueId();
	if(arg1 === undefined) {
		this.level = 0;
		this.pattern = [arg0];
	} else {
		this.l = arg0;
		this.r = arg1;
		this.level = arg0.level + 1;
		console.assert(this.l.level === this.r.level);
		console.assert(this.level >= 1);

		if(this.level <= 2) {
			this.pattern = this.l.pattern.concat(this.r.pattern);
		}
	}
	this.next = null;
	this.nextExp = null;

	this.stAttachment = null;
};

// Assuming the nodes are canonical, return a unique hash.
HashCellNode.prototype.hash = function() {
	if(this.level === 0) {
		return "" + this.pattern[0];
	} else {
		return this.l.id + ":" + this.r.id;
	}
};

// Return a smaller node after 1 step.
// this = |* *|* *|
// ret  =   |+ +|
HashCellNode.prototype.step = function() {
	console.assert(this.level >= 2);
	if(this.next !== null) {
		return this.next;
	}

	if(this.level === 2) {
		var new_pattern = this.hashcell.step(this.pattern);
		this.next = this.hashcell.createCanonicalNode(
			this.hashcell.createCanonicalNode(new_pattern[1]),
			this.hashcell.createCanonicalNode(new_pattern[2]));
	} else {
		// We want to do this:
		// this = |0 1 2 3|4 5 6 7|
		// ret  =     |a b c d|
		//
		// We generate two shifted nodes and step them:
		// |a b| = |1 2 3 4|.step
		// |c d| = |3 4 5 6|.step
		var l_part = this.hashcell.createCanonicalNode(this.l.l.r, this.l.r.l);
		var r_part = this.hashcell.createCanonicalNode(this.r.r.l, this.r.l.r);
		var center = this.hashcell.createCanonicalNode(this.l.r.r, this.r.l.l);

		var l_shifted = this.hashcell.createCanonicalNode(l_part, center);
		var r_shifted = this.hashcell.createCanonicalNode(center, r_part);

		this.next = this.hashcell.createCanonicalNode(l_shifted.step(), r_shifted.step());
	}
	return this.next;
};

// Return a smaller node after 2^(level-2) step.
// this = |* *|* *|
// ret  =   |+ +|
HashCellNode.prototype.stepExp = function() {
	console.assert(this.level >= 2);
	if(this.nextExp !== null) {
		return this.nextExp;
	}

	if(this.level === 2) {
		var new_pattern = this.hashcell.step(this.pattern);
		this.nextExp = this.hashcell.createCanonicalNode(
			this.hashcell.createCanonicalNode(new_pattern[1]),
			this.hashcell.createCanonicalNode(new_pattern[2]));
	} else {
		// We want to do this:
		// this = |0 1 2 3|4 5 6 7|
		// ret  =     |a b c d|
		// Basically we need to run 2 consecutive stepExp at level - 1.
		//
		// 1st:
		// |1 2| = |0 1 2 3|.stepExp
		// |3 4| = |2 3 4 5|.stepExp
		// |5 6| = |4 5 6 7|.stepExp
		// 2nd:
		// |a b| = |1 2 3 4|.stepExp
		// |c d| = |3 4 5 6|.stepExp
		var l_part = this.l.stepExp();
		var r_part = this.r.stepExp();
		var center = this.hashcell.createCanonicalNode(this.l.r, this.r.l).stepExp();

		var l_shifted = this.hashcell.createCanonicalNode(l_part, center).stepExp();
		var r_shifted = this.hashcell.createCanonicalNode(center, r_part).stepExp();

		this.nextExp = this.hashcell.createCanonicalNode(l_shifted, r_shifted);
	}
	return this.nextExp;
};

HashCellNode.prototype.getPattern = function() {
	if(this.pattern !== undefined) {
		return this.pattern;
	} else {
		return this.l.getPattern().concat(this.r.getPattern());
	}
};
