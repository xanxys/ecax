

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

HashCell.prototype.getRoot = function() {
	return {
		dx: this.dx,
		node: this.root,
	};
};

HashCell.prototype.extendLeft = function() {
	var new_dx = this.dx - Math.pow(2, this.root.level);
	this.root = this.createCanonicalNode(
		this.createFromInitial(new_dx, this.root.level),
		this.root);
	this.dx = new_dx;
};

HashCell.prototype.extendRight = function() {
	var new_dx = this.dx + Math.pow(2, this.root.level);
	this.root = this.createCanonicalNode(
		this.root,
		this.createFromInitial(new_dx, this.root.level));
};

HashCell.prototype.getTileSize = function() {
	return this.tile_size;
};

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


var Explorer110 = function() {
	var _this = this;
	this.eca = new HashCell(110);

	this.patterns = {
		"ether": {
			pattern: this.patternFromString("11111000100110"),
			key_color: 'rgba(255, 0, 0, 0.8)',
			base_color: 'rgba(255, 200, 200, 0.8)',
		},
		"A": {
			//pattern: this.patternFromString("11111000100110100110"),
			pattern: this.patternFromString("1110"),
			key_color: 'rgba(0, 0, 255, 0.8)',
			base_color: 'rgba(200, 200, 255, 0.8)',
		}
	};
	var core_pattern = this.generateRepetition('ether', 5)
		.concat(this.generateRepetition('A', 1))
		.concat(this.generateRepetition('ether', 5))
		.concat(this.generateRepetition('A', 1))
		.concat(this.generateRepetition('ether', 5));

	this.eca.setInitialState(function(x) {
		var ether = _this.patterns["ether"].pattern;
		var n = ether.length;
		if(x < 0) {
			return ether[((x % n) + n) % n];
		} else if(x < core_pattern.length) {
			return core_pattern[x];
		} else {
			return ether[(x - core_pattern.length) % n];
		}

	});

	this.setInitialStateFromUI();

	
	_.each(this.patterns, function(entry, name) {
		var item = $('<li/>').addClass('list-group-item');
		item.append($('<span/>').text(name).css('color', entry.key_color));
		item.append(' : ' + _this.patternToString(entry.pattern));
		item.append(' N=' + entry.pattern.length);
		$('#ui_patterns').append(item);
	});
	
	// Window into ECA.
	// p<canvas> = p<ECA> * zoom + t
	this.zoom = 3;
	this.tx = $('#col_eca').width() / 2;
	this.ty = 0;

	// cache tile
	this.tile_size = this.eca.getTileSize();
	this.tiles = {};

	this.debug = false;

	this.setupGUI();
};

Explorer110.prototype.setupGUI = function() {
	var _this = this;

	// adjust canvas size
	$('#eca')[0].width = $('#col_eca').width();
	$('#eca')[0].height = $(window).height() - 150;

	$('#eca').mousewheel(function(event) {
		event.preventDefault();

		// p = event.offsetX,Y must be preserved.
		// p<canvas> = p<ECA> * zoom + t = p<ECA> * new_zoom + new_t

		var center_x_eca = (event.offsetX - _this.tx) / _this.zoom;
		var center_y_eca = (event.offsetY - _this.ty) / _this.zoom;
		_this.zoom = Math.min(10, Math.max(1e-4, _this.zoom * (1 + event.deltaY * 0.1)));

		_this.tx = event.offsetX - center_x_eca * _this.zoom;
		_this.ty = event.offsetY - center_y_eca * _this.zoom;
	});

	var dragging = false;
	var prev_ev = null;
	$('#eca').mousedown(function(event) {
		dragging = true;
	});

	$('#eca').mouseleave(function(event) {
		dragging = false;
		prev_ev = null;
	});

	$('#eca').mouseup(function(event) {
		dragging = false;
		prev_ev = null;
	});

	$('#eca').mousemove(function(event) {
		if(!dragging) {
			return;
		}

		if(prev_ev !== null) {
			_this.tx += event.clientX - prev_ev.clientX;
			_this.ty += event.clientY - prev_ev.clientY;
		}
		prev_ev = event;
	});

	$('#ui_cells').change(function(event) {
		_this.notifyUpdate();
	});

	$('#ui_highlight').change(function(event) {
		_this.notifyUpdate();
	});

	$('#ui_initial_left').keyup(function(event) {
		_this.setInitialStateFromUI();
	});

	$('#ui_initial_center').keyup(function(event) {
		_this.setInitialStateFromUI();
	});

	$('#ui_initial_right').keyup(function(event) {
		_this.setInitialStateFromUI();
	});

	$('#ui_apply_glider').click(function(event) {
		_this.setInitialStateFromGliders();
	});

	$('#ui_rule').keyup(function(event) {
		_this.setRuleFromUI();
	});

	$(window).resize(function(event) {
		$('#eca')[0].width = $('#col_eca').width();
		$('#eca')[0].height = $(window).height() - 150;
	});
};

Explorer110.prototype.setRuleFromUI = function() {
	var rule = parseInt($('#ui_rule').val());

	// Note "==" (checking validity of integer)
	if(0 <= rule && rule < 256 && rule == $('#ui_rule').val()) {
		$('#ui_rule').parent().addClass('has-success');
		$('#ui_rule').parent().removeClass('has-error');

		this.eca = new HashCell(rule);
	} else {
		$('#ui_rule').parent().addClass('has-error');
		$('#ui_rule').parent().removeClass('has-success');
	}
};

Explorer110.prototype.setInitialStateFromGliders = function() {
	var a4 = this.patternFromString("1110111011101110");
	var a4pack = a4
		.concat(this.replicate(this.patterns["ether"].pattern, 27))
		.concat(a4)
		.concat(this.replicate(this.patterns["ether"].pattern, 23))
		.concat(a4)
		.concat(this.replicate(this.patterns["ether"].pattern, 25))
		.concat(a4);

	var bands = a4pack
		.concat(this.replicate(this.patterns["ether"].pattern, 649))
		.concat(a4pack)
		.concat(this.replicate(this.patterns["ether"].pattern, 649))
		.concat(a4pack);

	$('#ui_initial_left').val(this.patternToString(this.patterns["ether"].pattern));
	$('#ui_initial_center').val(this.patternToString(bands));
	$('#ui_initial_right').val(this.patternToString(this.patterns["ether"].pattern));
	this.setInitialStateFromUI();
};

Explorer110.prototype.replicate = function(pattern, n) {
	var ps = [];
	_.each(_.range(n), function() {
		ps = ps.concat(pattern);
	});
	return ps;
}

Explorer110.prototype.setInitialStateFromUI = function() {
	var pat_l = this.patternFromString($('#ui_initial_left').val());
	var pat_c = this.patternFromString($('#ui_initial_center').val());
	var pat_r = this.patternFromString($('#ui_initial_right').val());

	this.eca.setInitialState(function(x) {
		if(x < 0) {
			return pat_l[((x % pat_l.length) + pat_l.length) % pat_l.length];
		} else if(x < pat_c.length) {
			return pat_c[x];
		} else {
			return pat_r[(x - pat_c.length) % pat_r.length];
		}
	});
	this.tiles = {};
};

Explorer110.prototype.patternToString = function(pat) {
	return _.map(pat, function(v) {
		return v ? '1' : '0';
	}).join('');
};

Explorer110.prototype.patternFromString = function(s) {
	return _.map(s, function(v) {
		return v == '1';
	});
};

Explorer110.prototype.generateRepetition = function(name, n) {
	var result = [];
	_.each(_.range(n), function() {
		result = result.concat(this.patterns[name].pattern);
	}, this);
	return result;
};

Explorer110.prototype.notifyUpdate = function() {
	this.tiles = {};
};

// Get 4 nodes that corresponds to quadrants of node.stAttachments.
Explorer110.prototype.getSTDivisions = function(node) {
	console.assert(node.level > 3);

	var n0l = node.hashcell.createCanonicalNode(
		node.hashcell.createCanonicalNode(node.l.l.r, node.l.r.l),
		node.hashcell.createCanonicalNode(node.l.r.r, node.r.l.l));
	var n0r = node.hashcell.createCanonicalNode(
		node.hashcell.createCanonicalNode(node.l.r.r, node.r.l.l),
		node.hashcell.createCanonicalNode(node.r.l.r, node.r.r.l));

	// lower half
	var center_q = node.hashcell.createCanonicalNode(node.l.r, node.r.l).stepExp();
	var l_q = node.l.stepExp();
	var r_q = node.r.stepExp();

	var n1l = node.hashcell.createCanonicalNode(l_q, center_q);
	var n1r = node.hashcell.createCanonicalNode(center_q, r_q);

	return [[n0l, n0r], [n1l, n1r]];
};

Explorer110.prototype.getAttachment = function(node, tr) {
	if(node.level <= 2) {
		return null;
	}

	if(node.stAttachment !== null) {
		return node.stAttachment;
	}

	if(!tr.shouldRun()) {
		return null;
	}

	//console.log('GA', node.level);

	var canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 128;

	var ctx = canvas.getContext('2d');
	if(node.level > 3) {
		var quads = this.getSTDivisions(node);

		var i0l = this.getAttachment(quads[0][0], tr);
		var i0r = this.getAttachment(quads[0][1], tr);
		var i1l = this.getAttachment(quads[1][0], tr);
		var i1r = this.getAttachment(quads[1][1], tr);
		if(i0l === null || i0r === null || i1l === null || i1r === null) {
			return null;
		}

		ctx.drawImage(i0l, 0, 0, 128, 64);
		ctx.drawImage(i0r, 128, 0, 128, 64);
		ctx.drawImage(i1l, 0, 64, 128, 64);
		ctx.drawImage(i1r, 128, 64, 128, 64);
	} else {
		console.assert(node.level === 3);
		ctx.save();
		ctx.scale(256 / 4, 256 / 4);
		var slice = node.getPattern();
		for(var t = 0; t < 2; t++) {
			for(var x = 0; x < 4; x++) {
				var v = slice[x + 2];
				ctx.beginPath();
				ctx.rect(x, t, 1, 1);
				ctx.fillStyle = v ? 'rgb(100, 100, 100)' : 'white';
				ctx.fill();
			}
			slice = node.hashcell.step(slice);
		}
		ctx.restore();
	}
	node.stAttachment = canvas;
	return canvas;
};

// If immediate: may return null when it takes time to calculate the tile.
Explorer110.prototype.getTile = function(ix, it, tr) {
	var index = [ix, it];
	if(this.tiles[index] !== undefined) {
		return this.tiles[index];
	}

	var canvas = document.createElement('canvas');
	canvas.width = this.tile_size;
	canvas.height = this.tile_size;
	
	var ctx = canvas.getContext('2d');

	ctx.fillStyle = 'white';
	ctx.beginPath();
	ctx.rect(0, 0, this.tile_size, this.tile_size);
	ctx.fill();

	ctx.save();

	ctx.lineWidth = 0.1;
	ctx.beginPath();
	ctx.moveTo(-500, 0);
	ctx.lineTo(500, 0);
	ctx.strokeStyle = 'gray';
	ctx.stroke();

	var _this = this;
	var enable_cells = $('#ui_cells').is(':checked');
	var enable_highlight = $('#ui_highlight').is(':checked');


	var data = this.eca.getTile(ix, it, tr);
	var data_l = this.eca.getTile(ix - 1, it, tr);
	var data_r = this.eca.getTile(ix + 1, it, tr);
	if(data === null || data_l === null || data_r === null || !tr.shouldRun()) {
		return null;
	}

	for(var t = 0; t < this.tile_size; t++) {
		var state = data[t];

		if(enable_cells) {
			_.each(state, function(v, x) {
				ctx.beginPath();
				ctx.rect(x, t, 1, 1);

				ctx.fillStyle = v ? 'rgb(100, 100, 100)' : 'white';
				ctx.fill();
			});
		}

		if(enable_highlight) {
			var ext_state = data_l[t].concat(data[t]).concat(data_r[t]);

			_.each(ext_state, function(v, ext_x) {
				var x = ext_x - _this.tile_size;
				_.each(_this.patterns, function(entry) {
					var pattern = entry.pattern;

					var x_end = x + pattern.length;
					if(_.isEqual(ext_state.slice(x + _this.tile_size, x_end + _this.tile_size), pattern)) {
						ctx.beginPath();
						ctx.rect(x, t, pattern.length, 1);
						ctx.fillStyle = entry.base_color;
						ctx.fill();

						ctx.beginPath();
						ctx.rect(x, t, 1, 1);
						ctx.fillStyle = entry.key_color;
						ctx.fill();
					}
				});
			});
		}
	}
	ctx.restore();
	this.tiles[index] = canvas;
	return canvas;
};

Explorer110.prototype.redraw = function() {
	var _this = this;
	var ctx = $('#eca')[0].getContext('2d');
	
	ctx.fillStyle = 'white';
	ctx.beginPath();
	ctx.rect(0, 0, $('#eca')[0].width, $('#eca')[0].height);
	ctx.fill();

	// Draw visible tiles
	var tr = new Tracker(0.1);
	ctx.save();
	ctx.translate(this.tx, this.ty);
	ctx.scale(this.zoom, this.zoom);

	var node_descs = this.getVisibleNodes();
	_.each(node_descs, function(node_desc) {
		var attachment = _this.getAttachment(node_desc.node, tr);
		
		ctx.save();
		var k = node_desc.width / 256;
		ctx.translate(node_desc.dx, node_desc.dy);
		ctx.scale(k, k);

		if(attachment !== null) {
			ctx.drawImage(attachment, 0, 0);
		} else {
			ctx.fillStyle = "#020F80";
			ctx.fillText("Calculating", 64, 64);
		}

		if(_this.debug) {
			ctx.lineWidth = 1;
			ctx.strokeStyle = 'limegreen';
			ctx.beginPath();
			ctx.rect(0, 0, 256, 128);
			ctx.stroke();
		}
		ctx.restore();
	});
	ctx.restore();

	// Draw ruler (10x10 - 10x100)
	var exponent = Math.floor(Math.log(this.zoom) / Math.log(10));
	var fraction = this.zoom / Math.pow(10, exponent);

	ctx.save();
	ctx.translate(0, $('#eca')[0].height - 20);
	ctx.beginPath();
	ctx.rect(0, 0, 100, 20);
	ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
	ctx.fill();

	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(0, 15);
	ctx.lineTo(fraction * 10, 15);
	ctx.strokeStyle = '#020F80';
	ctx.stroke();

	ctx.fillStyle = '#020F80';
	ctx.fillText(this.generateExponentWithUnit(10 * Math.pow(10, -exponent)), 0, 10);
	ctx.restore();

	// Draw debug string.
	if(this.debug) {
		ctx.save();
		ctx.translate(0, $('#eca')[0].height - 40);
		ctx.beginPath();
		ctx.rect(0, 0, 400, 20);
		ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
		ctx.fill();

		ctx.fillStyle = 'limegreen';
		ctx.fillText("Root Level:" + this.eca.getRoot().node.level + " / Unique Tile:" + _.size(this.eca.cache) + " / New Id:" + this.eca.new_id, 0, 10);
		ctx.restore();
	}

	setTimeout(function() {
		_this.redraw();
	}, 100);
};

// 100 -> "100"
// 1000 -> "1k"
// 10000 -> "10k"
// ...
Explorer110.prototype.generateExponentWithUnit = function(n) {
	var units = ["", "k", "M", "G", "T", "P", "E", "Z", "Y"];

	for(var i = 0; i < units.length; i++) {
		var x = n / Math.pow(1000, i);
		if(x < 1000) {
			return x + units[i];
		}
	}

	return n;
};


Explorer110.prototype.run = function() {
	this.redraw();
};


//return [{node:HashCellNode, dx, dy, width}]
Explorer110.prototype.getVisibleNodes = function() {
	var _this = this;

	// Select target level low enough so that attachment zoom falls in
	// [1, 2). Which means 2^(level-1) * zoom = attachment.width.
	var target_level = Math.max(0, 2 + Math.floor(Math.log(256 / this.zoom) / Math.log(2)));

	var win = this.getWindow();
	var findTargetNodes = function(node, dx, dy) {
		var w = Math.pow(2, node.level - 1);
		var h = w / 2;

		// Discard if there's no overlap with the window.
		if(dx + w < win.x0 || dx > win.x1 || dy + h < win.y0 || dy > win.y1) {
			return [];
		}

		// Return as is if this is small enough.
		if(node.level <= target_level) {
			return [{
				node: node,
				dx: dx,
				dy: dy,
				width: w,
			}];
		}

		// Still too large; divide into quads and collect.
		var quads = _this.getSTDivisions(node);
		var nodes = [];
		_.each(_.range(2), function(iy) {
			_.each(_.range(2), function(ix) {
				nodes = nodes.concat(
					findTargetNodes(quads[iy][ix], dx + ix * w / 2, dy + iy * h / 2));
			});
		});
		return nodes;
	};

	// If root is smaller than window, replace root with larger one.
	var root = this.eca.getRoot();
	if(win.x0 < root.dx + Math.pow(2, root.node.level - 2)) {
		this.eca.extendLeft();
	} else if(root.dx + 3 * Math.pow(2, root.node.level - 2) < win.x1) {
		this.eca.extendRight();
	} else if(Math.pow(2, root.node.level - 2) < win.y1) {
		this.eca.extendLeft();  // in this case, left or right doesn't matter.
	}
	
	return findTargetNodes(root.node, root.dx + Math.pow(2, root.node.level - 2), 0);
};

Explorer110.prototype.getVisibleTileIndices = function() {
	var _this = this;
	var win = this.getWindow();
	var indices = [];
	_.each(_.range(Math.floor(win.y0 / _this.tile_size), Math.ceil(win.y1 / _this.tile_size)), function(iy) {
		_.each(_.range(Math.floor(win.x0 / _this.tile_size), Math.ceil(win.x1 / _this.tile_size)), function(ix) {
			indices.push([ix, iy]);
		});
	});
	return indices;
};

Explorer110.prototype.getWindow = function() {
	// p<canvas> = p<ECA> * zoom + t
	// p<ECA> = (p<canvas> - t) / zoom
	return {
		x0: (-this.tx) / this.zoom,
		x1: ($('#eca')[0].width - this.tx) / this.zoom,
		y0: Math.max(0, (-this.ty) / this.zoom),
		y1: ($('#eca')[0].height - this.ty) / this.zoom,
	};
};

var explorer = new Explorer110();
explorer.run();
