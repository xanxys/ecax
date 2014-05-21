
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


var RuleView = Backbone.View.extend({
	el: '#ui_rule',
	events: {
		'keyup': 'modifyRule',
	},

	initialize: function() {


	},

	modifyRule: function() {
		var rule = parseInt(this.$el.val());

		// Note "==" (checking validity of integer)
		this.$el.parent().removeClass('has-error has-success');
		if(0 <= rule && rule < 256 && rule == this.$el.val()) {
			this.$el.parent().addClass('has-success');
			this.trigger('ruleChange', rule);
			/*
			this.eca = new HashCell(rule);
			this.hashcell_view.eca = this.eca;
			*/
		} else {
			this.$el.parent().addClass('has-error');
		}
	}
});


// Create state diagram of (infinite) repetition of length n pattern.
// The graph consists of 2^n nodes and directed links denotes
// state transition.
// All nodes have at least one outgoing edge.
// Nodes with no incoming edge are Garden of Eden pattern.
var analyze = function(rule, n) {
	var numberToPattern = function(x) {
		return _.map(_.range(n), function(i) {
			return ((x >> (n - i -1)) & 1) !== 0;
		});
	};

	var eca = new ECA(rule);

	var graph = {};
	_.each(_.range(0, Math.pow(2, n)), function(i) {
		var seed = numberToPattern(i);
		var pattern = function(x) {
			return seed[((x % n) + n) % n];
		};
		eca.setInitialState(pattern);
		var to = eca.getTile(0, 0, new Tracker(0.1))[1].slice(0, n);

		graph[patternToString(seed)] = patternToString(to);
	});
	return graph;
};

// :: Map a b -> Map b [a]
var transposeMap = function(dict) {
	var inv_dict = {};
	_.each(dict, function(value, key) {
		inv_dict[key] = [];
	});
	_.each(dict, function(value, key) {
		inv_dict[value].push(key);
	});
	return inv_dict;
};


var ECAX = function() {
	/*
	analyze(110, 1);
	analyze(110, 2);
	*/

	var _this = this;
	this.eca = new HashCell(110);

	var _this = this;
	this.initial_state_view = new InitialStateView({
		on_update: function(pattern) {
			_this.eca.setInitialState(pattern);
			_this.tiles = {};
		}
	});

	this.hashcell_view = new HashCellView({
		eca: this.eca,
		debug: false
	});
	this.hashcell_view.run();

	this.initial_state_view.readValues();
	this.rule_view = new RuleView();
	this.rule_view.on('ruleChange', function(rule) {
		_this.eca = new HashCell(rule);
		_this.hashcell_view.eca = _this.eca;
	});
	this.setupGUI();
};

ECAX.prototype.setupGUI = function() {
	var _this = this;
	$(window).resize(function(event) {
		_this.hashcell_view.$el[0].width = $('#col_eca').width();
		_this.hashcell_view.$el[0].height = $(window).height() - 150;
	});
};

var explorer = new ECAX();
