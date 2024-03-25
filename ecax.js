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
        // Note "==" (checking validity of integer)
        this.$el.parent().removeClass('has-error has-success');
        if (0 <= rule && rule < 256 && rule == this.$el.val()) {
            this.$el.parent().addClass('has-success');
            this.trigger('ruleChange', rule);
            /* this.eca = new HashCell(rule);
            this.hashcell_view.eca = this.eca; */
        } else {
            this.$el.parent().addClass('has-error');
        }
    },
});

// Create state diagram of (infinite) repetition of length n pattern.
// The graph consists of 2^n nodes and directed links denotes
// state transition.
// All nodes have at least one outgoing edge.
// Nodes with no incoming edge are Garden of Eden pattern.
const analyze = (rule, n) => {
    const numberToPattern = x =>
        Array.from({ length: n }, (_, i) => ((x >> (n - i - 1)) & 1) !== 0);

    const eca = new ECA(rule);
    const graph = {};
    for (let i = 0; i < 2 ** n; i++) {
        const seed = numberToPattern(i);
        const pattern = x => seed[((x % n) + n) % n];
        eca.setInitialState(pattern);
        const to = eca.getTile(0, 0, new Tracker(0.1))[1].slice(0, n);
        graph[patternToString(seed)] = patternToString(to);
    }
    return graph;
};

// :: Map a b -> Map b [a]
const transposeMap = dict => {
    const inv_dict = {};
    for (const key in dict) {
        inv_dict[key] = [];
    }
    for (const key in dict) {
        inv_dict[dict[key]].push(key);
    }
    return inv_dict;
};

const ECAX = function () {
    /* analyze(110, 1);
    analyze(110, 2); */
    const _this = this;
    this.eca = new HashCell(110);
    this.initial_state_view = new InitialStateView({
        on_update(pattern) {
            _this.eca.setInitialState(pattern);
            _this.tiles = {};
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
        _this.eca = new HashCell(rule);
        _this.hashcell_view.eca = _this.eca;
    });
    this.setupGUI();
};

ECAX.prototype.setupGUI = function () {
    $(window).resize(event => {
        this.hashcell_view.$el[0].width = $('#col_eca').width();
        this.hashcell_view.$el[0].height = $(window).height() - 150;
    });
};

const explorer = new ECAX();
