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
        const patL = patternFromString($('#ui_initial_left').val());
        const patC = patternFromString($('#ui_initial_center').val());
        const patR = patternFromString($('#ui_initial_right').val());
        this.on_update(x => {
            if (x < 0) {
                return patL[((x % patL.length) + patL.length) % patL.length];
            } else if (x < patC.length) {
                return patC[x];
            } else {
                return patR[(x - patC.length) % patR.length];
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
        this.stb = new STBlocks(new STAbsolute(110));
        this.initialStateView = new InitialStateView({
            on_update: pattern => {
                // TODO: implement
                this.tiles = {};
            },
        });
        this.ecaView = new ECAView({
            stb: this.stb,
        });
        this.ecaView.run();
        this.initialStateView.readValues();
        this.ruleView = new RuleView();
        this.ruleView.on('ruleChange', rule => {
            this.stb = new STBlocks(new STAbsolute(rule));
            this.ecaView.eca = this.eca;
            this.ecaView.stb = this.stb;
        });
        this.setupGUI();
    }

    setupGUI() {
        $(window).resize(_ => {
            this.ecaView.$el[0].width = $('#col_eca').width();
            this.ecaView.$el[0].height = $(window).height() - 150;
        });
    }
}

const explorer = new ECAX();
