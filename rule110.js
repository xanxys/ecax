
var ECA = function() {

	/*
	this.state = _.map(_.range(500), function(i) {
		return (i == 250);

		
	});
*/
	
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
	this.state = this.generateRepetition('ether', 5).concat(this.generateRepetition('A', 1)).concat(this.generateRepetition('ether', 5));

	var _this = this;
	_.each(this.patterns, function(entry, name) {
		var item = $('<li/>');
		item.append($('<span/>').text(name).css('color', entry.key_color));
		item.append(' : ' + _this.patternToString(entry.pattern));
		item.append(' N=' + entry.pattern.length);
		$('#ui_patterns').append(item);
	});
	

	this.rule = 110;
	this.timestamp = 0;
};

ECA.prototype.patternToString = function(pat) {
	return _.map(pat, function(v) {
		return v ? '1' : '0';
	}).join('');
};

ECA.prototype.patternFromString = function(s) {
	return _.map(s, function(v) {
		return v == '1';
	});
};

ECA.prototype.generateRepetition = function(name, n) {
	var result = [];
	_.each(_.range(n), function() {
		result = result.concat(this.patterns[name].pattern);
	}, this);
	return result;
};

ECA.prototype.step = function() {
	var _this = this;
	new_state = _.map(this.state, function(v_c, ix) {
		var v_l = (ix - 1 < 0) ? _this.state[_this.state.length - 1] : _this.state[ix - 1];
		var v_r = (ix + 1 >= _this.state.length) ? _this.state[0] : _this.state[ix + 1];

		// Encode current neighbors to [0, 8) value.
		var v_enc = (v_l ? 4 : 0) | (v_c ? 2 : 0) | (v_r ? 1 : 0);

		// Lookup
		return (_this.rule & (1 << v_enc)) != 0;
	});
	this.state = new_state;
	this.timestamp += 1;
};

ECA.prototype.draw = function() {
	var ctx = $('#eca')[0].getContext('2d');
	ctx.save();
	ctx.scale(3, 3);

	var _this = this;
	_.each(_.range(500), function(t) {
		_.each(_this.state, function(v, x) {
			ctx.beginPath();
			ctx.rect(x, t, 1, 1);

			ctx.fillStyle = v ? 'rgb(100, 100, 100)' : 'white';
			ctx.fill();
		});

		_.each(_this.state, function(v, x) {
			_.each(_this.patterns, function(entry) {
				var pattern = entry.pattern;

				var x_end = x + pattern.length;
				if(_.isEqual(_this.state.slice(x, x_end), pattern)) {
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

		_this.step();
	});

	ctx.restore();
};


var eca = new ECA();

$('#ui_draw').click(function() {
	
	eca.draw();

});
