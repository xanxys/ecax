var patternToString = function(pat) {
	return _.map(pat, function(v) {
		return v ? '1' : '0';
	}).join('');
};

var patternFromString = function(s) {
	return _.map(s, function(v) {
		return v == '1';
	});
};


var InitialStateView = Backbone.View.extend({
	el: 'body',

	events: {
		'keyup #ui_initial_left': "readValues",
		'keyup #ui_initial_center': "readValues",
		'keyup #ui_initial_right': "readValues",
	},

	initialize: function(options) {
		this.on_update = options.on_update;
	},

	readValues: function() {
		console.log('A');
		var pat_l = patternFromString($('#ui_initial_left').val());
		var pat_c = patternFromString($('#ui_initial_center').val());
		var pat_r = patternFromString($('#ui_initial_right').val());

		this.on_update(function(x) {
			if(x < 0) {
				return pat_l[((x % pat_l.length) + pat_l.length) % pat_l.length];
			} else if(x < pat_c.length) {
				return pat_c[x];
			} else {
				return pat_r[(x - pat_c.length) % pat_r.length];
			}
		});
	},
});


var Explorer110 = function() {
	var _this = this;
	this.eca = new HashCell(110);

	var _this = this;
	this.initial_state_view = new InitialStateView({
		on_update: function(pattern) {
			_this.eca.setInitialState(pattern);
			_this.tiles = {};
		}
	});

	this.patterns = {
		"ether": {
			pattern: patternFromString("11111000100110"),
			key_color: 'rgba(255, 0, 0, 0.8)',
			base_color: 'rgba(255, 200, 200, 0.8)',
		},
		"A": {
			//pattern: patternFromString("11111000100110100110"),
			pattern: patternFromString("1110"),
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
		item.append(' : ' + patternToString(entry.pattern));
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
	var a4 = patternFromString("1110111011101110");
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

	$('#ui_initial_left').val(patternToString(this.patterns["ether"].pattern));
	$('#ui_initial_center').val(patternToString(bands));
	$('#ui_initial_right').val(patternToString(this.patterns["ether"].pattern));
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
	var pat_l = patternFromString($('#ui_initial_left').val());
	var pat_c = patternFromString($('#ui_initial_center').val());
	var pat_r = patternFromString($('#ui_initial_right').val());

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

	var node_descs = this.getVisibleNodes(tr);
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
	ctx.rect(0, 0, 300, 20);
	ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
	ctx.fill();

	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(0, 15);
	ctx.lineTo(fraction * 10, 15);
	ctx.strokeStyle = '#020F80';
	ctx.stroke();

	var win = this.getWindow();
	ctx.fillStyle = '#020F80';
	ctx.fillText(
		this.generateExponentWithUnit(10 * Math.pow(10, -exponent)) +
		"  x:[" + win.x0.toFixed(1) + "," + win.x1.toFixed(1) +"]" +
		" t:[" + win.y0.toFixed(1) +"," + win.y1.toFixed(1) + "]",
		0, 10);
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
Explorer110.prototype.getVisibleNodes = function(tr) {
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
		this.eca.extendLeft(tr);
	} else if(root.dx + 3 * Math.pow(2, root.node.level - 2) < win.x1) {
		this.eca.extendRight(tr);
	} else if(Math.pow(2, root.node.level - 2) < win.y1) {
		this.eca.extendLeft(tr);  // in this case, left or right doesn't matter.
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
