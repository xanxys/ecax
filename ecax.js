// [false, true] -> "01"
const patternToString = pat => pat.map(v => v ? '1' : '0').join('');

// "01" -> [false, true]
const patternFromString = s => [...s].map(v => v === '1');

const InitialStateView = Backbone.View.extend({
    el: 'body',
    events: {
        'keyup #ui_initial_left': 'readValues',
        'keyup #ui_initial_center': 'readValues',
        'keyup #ui_initial_right': 'readValues',
    },
    initialize(options) {
        this.on_update = options.on_update;
    },
    readValues() {
        const pat_l = patternFromString($('#ui_initial_left').val());
        const pat_c = patternFromString($('#ui_initial_center').val());
        const pat_r = patternFromString($('#ui_initial_right').val());
        this.on_update(x => {
            if (x < 0) {
                return pat_l[((x % pat_l.length) + pat_l.length) % pat_l.length];
            } else if (x < pat_c.length) {
                return pat_c[x];
            } else {
                return pat_r[(x - pat_c.length) % pat_r.length];
            }
        });
    },
});

const RuleView = Backbone.View.extend({
    el: '#ui_rule',
    events: {
        keyup: 'modifyRule',
    },
    initialize() { },
    modifyRule() {
        const rule = parseInt(this.$el.val());
        this.$el.parent().removeClass('has-error has-success');
        if (0 <= rule && rule < 256 && rule.toString() === this.$el.val()) {
            this.$el.parent().addClass('has-success');
            this.trigger('ruleChange', rule);
        } else {
            this.$el.parent().addClass('has-error');
        }
    },
});


class ECAX {
    constructor() {
        this.eca = new HashCell(110);
        this.initial_state_view = new InitialStateView({
            on_update: pattern => {
                this.eca.setInitialState(pattern);
                this.tiles = {};
            },
        });
        this.hashcell_view = new HashCellView({
            eca: this.eca,
            debug: false,
        });
        this.hashcell_view.run();
        this.initial_state_view.readValues();
        this.rule_view = new RuleView();
        this.rule_view.on('ruleChange', rule => {
            this.eca = new HashCell(rule);
            this.hashcell_view.eca = this.eca;
        });
        this.setupGUI();
    }

    setupGUI() {
        $(window).resize(_ => {
            this.hashcell_view.$el[0].width = $('#col_eca').width();
            this.hashcell_view.$el[0].height = $(window).height() - 150;
        });
    }
}

const explorer = new ECAX();
