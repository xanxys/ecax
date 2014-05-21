
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

var ECAX = function() {
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
