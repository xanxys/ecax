
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
	this.initial_state = this.generateRepetition('ether', 5).concat(this.generateRepetition('A', 1)).concat(this.generateRepetition('ether', 5));

	var _this = this;
	_.each(this.patterns, function(entry, name) {
		var item = $('<li/>').addClass('list-group-item');
		item.append($('<span/>').text(name).css('color', entry.key_color));
		item.append(' : ' + _this.patternToString(entry.pattern));
		item.append(' N=' + entry.pattern.length);
		$('#ui_patterns').append(item);
	});
	

	this.rule = 110;
	this.timestamp = 0;

	this.zoom = 3;
	this.tx = 0;
	this.ty = 0;

	// cache states
	this.states = [];
	var curr_state = this.initial_state;
	_.each(_.range(100), function(t) {
		this.states.push(curr_state);
		curr_state = this.step(curr_state);
	}, this);
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

ECA.prototype.draw = function() {
	var ctx = $('#eca')[0].getContext('2d');
	
	ctx.fillStyle = 'white';
	ctx.beginPath();
	ctx.rect(0, 0, $('#eca')[0].width, $('#eca')[0].height);
	ctx.fill();

	ctx.save();
	ctx.scale(this.zoom, this.zoom);
	ctx.translate(this.tx, this.ty);

	ctx.lineWidth = 0.1;
	ctx.beginPath();
	ctx.moveTo(-500, 0);
	ctx.lineTo(500, 0);
	ctx.strokeStyle = 'gray';
	ctx.stroke();

	var _this = this;
	_.each(this.states, function(state, t) {
		if($('#ui_cells').is(':checked')) {
			_.each(state, function(v, x) {
				ctx.beginPath();
				ctx.rect(x, t, 1, 1);

				ctx.fillStyle = v ? 'rgb(100, 100, 100)' : 'white';
				ctx.fill();
			});
		}
		

		if($('#ui_highlight').is(':checked')) {
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
	});

	ctx.restore();

	setTimeout(function() {
		_this.draw();
	}, 50);
};

// adjust canvas size
$('#eca')[0].width = $('#col_eca').width();
$('#eca')[0].height = $(window).height() - 150;

var eca = new ECA();
eca.draw();

$('#eca').mousewheel(function(event) {
	eca.zoom = Math.max(0.2, eca.zoom + event.deltaY * 0.1);
});

var dragging = false;
var prev_ev = null;
$('#eca').mousedown(function(event) {
	dragging = true;
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
		eca.tx += (event.clientX - prev_ev.clientX) / eca.zoom;
		eca.ty += (event.clientY - prev_ev.clientY) / eca.zoom;
	}
	prev_ev = event;
});
