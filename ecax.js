// [false, true] -> "01"
const patternToString = pat => pat.map(v => v ? '1' : '0').join('');

// "01" -> [false, true]
const patternFromString = s => [...s].map(v => v === '1');

const ecaView = new ECAView();

const app = Vue.createApp({
    data() {
        return {
            ruleText: "110",
            rule: 110,
            ruleValid: true,

            patCText: "1",
            patC: [true],
            patCValid: true,

            patLText: "0",
            patL: [false],
            patLValid: true,

            patRText: "0",
            patR: [false],
            patRValid: true
        };
    },

    watch: {
        ruleText(newValue) {
            const n = parseInt(newValue);
            this.ruleValid = (0 <= n && n < 256 && n.toString() === newValue);
            if (this.ruleValid) {
                this.rule = n;
            }
        },

        patCText(newValue) {
            try {
                const pat = patternFromString(newValue);
                this.patCValid = (pat.length >= 1 && patternToString(pat) === newValue);
                if (this.patCValid) {
                    this.patC = pat;
                }
            } catch {
                this.patCValid = false;
            }
        },

        patLText(newValue) {
            try {
                const pat = patternFromString(newValue);
                this.patLValid = (pat.length >= 1 && patternToString(pat) === newValue);
                if (this.patLValid) {
                    this.patL = pat;
                }
            } catch {
                this.patLValid = false;
            }
        },

        patRText(newValue) {
            try {
                const pat = patternFromString(newValue);
                this.patRValid = (pat.length >= 1 && patternToString(pat) === newValue);
                if (this.patRValid) {
                    this.patR = pat;
                }
            } catch {
                this.patRValid = false;
            }
        },

        rule(newValue) {
            ecaView.updateSTB(new STBlocks(new STAbsolute(newValue, this.patC, this.patL, this.patR)));
        },

        patC(newValue) {
            ecaView.updateSTB(new STBlocks(new STAbsolute(this.rule, newValue, this.patL, this.patR)));
        },

        patL(newValue) {
            ecaView.updateSTB(new STBlocks(new STAbsolute(this.rule, this.patC, newValue, this.patR)));
        },

        patR(newValue) {
            ecaView.updateSTB(new STBlocks(new STAbsolute(this.rule, this.patC, this.patL, newValue)));
        },
    },

    mounted() {
        ecaView.updateSTB(new STBlocks(new STAbsolute(this.rule, this.patC, this.patL, this.patR)));
    }
});

app.mount("#app");
