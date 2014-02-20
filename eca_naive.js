
// Infinitely large, deferred elementary cellular automaton.
// No GUI code here.
var ECA = function(rule) {
	this.rule = rule;

	this.initial = function(x) {
		return (x == 0);
	};

	// cache tile
	this.tile_size = 200;
	this.tiles = {};
};

// To update a tile (ix, it), we use last values from (ix-1, it) and (ix+1, it).
// e.g. tile_size = 3
// |+++|+++|+++|
// -------------
// |-++|+++|++-|
// |--+|+++|+--|
// |---|+++|---|
ECA.prototype.updateTile = function(ix, it, tr) {
	if(!tr.shouldRun()) {
		return null;
	}

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
		var tn = this.getTile(ix - 1, it - 1, tr);
		var t0 = this.getTile(ix, it - 1, tr);
		var tp = this.getTile(ix + 1, it - 1, tr);
		if(tn === null || t0 === null || tp === null) {
			return null;
		}

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

// If immediate: may return null when it takes time to calculate the tile.
ECA.prototype.getTile = function(ix, it, tr) {
	console.assert(it >= 0);
	var index = [ix, it];
	if(this.tiles[index] === undefined) {
		var tile = this.updateTile(ix, it, tr);
		if(tile !== null) {
			this.tiles[index] = tile;
		}
		return tile;
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
