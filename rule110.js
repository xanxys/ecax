
// Infinitely large, deferred elementary cellular automaton.
// No GUI code here.
var ECA = function(rule) {
	this.rule = rule;

	this.initial = function(x) {
		return (x == 0);
	};

	// cache states
	this.states = [];
	var curr_state = this.initial_state;
	_.each(_.range(2000), function(t) {
		this.states.push(curr_state);
		curr_state = this.step(curr_state);
	}, this);

	// cache tile
	this.tile_size = 250;
	this.tiles = {};
};

// To update a tile (ix, it), we use last values from (ix-1, it) and (ix+1, it).
// e.g. tile_size = 3
// |+++|+++|+++|
// -------------
// |-++|+++|++-|
// |--+|+++|+--|
// |---|+++|---|
ECA.prototype.updateTile = function(ix, it) {
	var states = [];

	if(it == 0) {
		// Use supplied initial value function.
		var x0 = (ix - 1) * this.tile_size;
		var x1 = (ix + 2) * this.tile_size;

		var state = _.map(_.range(x0, x1), this.initial);	
		for(var t = 0; t < this.tile_size; t++) {
			states.push(state.slice(this.tile_size, this.tile_size * 2));
			state = this.step(state);
		}
	} else {
		// Use previous tiles' last values.
		var tn = this.getTile(ix - 1, it - 1);
		var t0 = this.getTile(ix, it - 1);
		var tp = this.getTile(ix + 1, it - 1);

		var state = tn[this.tile_size - 1].concat(
			t0[this.tile_size - 1]).concat(
			tp[this.tile_size - 1]);
		for(var t = 0; t < this.tile_size; t++) {
			state = this.step(state);
			states.push(state.slice(this.tile_size, this.tile_size * 2));
		}
	}
	return states;
};

ECA.prototype.getTile = function(ix, it) {
	console.assert(it >= 0);
	var index = [ix, it];
	if(this.tiles[index] === undefined) {
		this.tiles[index] = this.updateTile(ix, it);
	}
	return this.tiles[index];
};

// initial :: int -> bool
ECA.prototype.setInitialState = function(initial) {
	this.initial = initial;
	this.tiles = {};
};

ECA.prototype.step = function(state) {
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

ECA.prototype.getTileSize = function() {
	return this.tile_size;
};


var Explorer110 = function() {
	var _this = this;
	this.eca = new ECA(110);

	this.patterns = {
		"ether": {
			pattern: this.patternFromString("00010011011111"),
			key_color: 'rgba(255, 0, 0, 0.8)',
			base_color: 'rgba(255, 200, 200, 0.8)',
		},
		"A": {
			pattern: this.patternFromString("00010011010011011111"),
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
	this.tx = 0;
	this.ty = 0;

	// cache tile
	this.tile_size = this.eca.getTileSize();
	this.tiles = {};

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
		_this.zoom = Math.max(0.2, _this.zoom + event.deltaY * 0.1);

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
};

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


Explorer110.prototype.getTile = function(ix, it) {
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


	var data = this.eca.getTile(ix, it);
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
			_.each(state, function(v, x) {
				_.each(_this.patterns, function(entry) {
					var pattern = entry.pattern;

					var x_end = x + pattern.length;
					if(_.isEqual(state.slice(x, x_end), pattern)) {
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


Explorer110.prototype.run = function() {
	var _this = this;
	var ctx = $('#eca')[0].getContext('2d');
	
	ctx.fillStyle = 'white';
	ctx.beginPath();
	ctx.rect(0, 0, $('#eca')[0].width, $('#eca')[0].height);
	ctx.fill();

	// Draw visible tiles
	ctx.save();
	ctx.translate(this.tx, this.ty);
	ctx.scale(this.zoom, this.zoom);
	_.each(this.getVisibleTileIndices(), function(index) {
		var ix = index[0];
		var it = index[1];

		ctx.drawImage(_this.getTile(ix, it), ix * _this.tile_size, it * _this.tile_size);
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
	ctx.fillText(10 * Math.pow(10, -exponent), 0, 10);
	ctx.restore();

	setTimeout(function() {
		_this.run();
	}, 100);
};

Explorer110.prototype.getVisibleTileIndices = function() {
	// p<canvas> = p<ECA> * zoom + t
	// p<ECA> = (p<canvas> - t) / zoom
	var x0 = (-this.tx) / this.zoom / this.tile_size;
	var x1 = ($('#eca')[0].width - this.tx) / this.zoom / this.tile_size;
	var y0 = Math.max(0, (-this.ty) / this.zoom / this.tile_size);
	var y1 = ($('#eca')[0].height - this.ty) / this.zoom / this.tile_size;

	var indices = [];
	_.each(_.range(Math.floor(y0), Math.ceil(y1)), function(iy) {
		_.each(_.range(Math.floor(x0), Math.ceil(x1)), function(ix) {
			indices.push([ix, iy]);
		});
	});
	return indices;
};


new Explorer110().run();
