// Infinitely large, deferred elementary cellular automaton.
// No GUI code here.
class ECA {
    constructor(rule) {
        this.rule = rule;
        this.initial = x => x === 0;
        this.tile_size = 200;
        this.tiles = {};
    }

    updateTile(ix, it, tr) {
        if (!tr.shouldRun()) {
            return null;
        }

        const states = [];
        if (it === 0) {
            const x0 = (ix - 1) * this.tile_size;
            const x1 = (ix + 2) * this.tile_size;

            let state = Array.from({ length: x1 - x0 }, (_, i) => this.initial(i + x0));
            for (let t = 0; t < this.tile_size; t++) {
                states.push(state.slice(this.tile_size, this.tile_size * 2));
                state = this.step(state);
            }
        } else {
            const tn = this.getTile(ix - 1, it - 1, tr);
            const t0 = this.getTile(ix, it - 1, tr);
            const tp = this.getTile(ix + 1, it - 1, tr);
            if (tn === null || t0 === null || tp === null) {
                return null;
            }

            let state = [...tn[this.tile_size - 1], ...t0[this.tile_size - 1], ...tp[this.tile_size - 1]];
            for (let t = 0; t < this.tile_size; t++) {
                state = this.step(state);
                states.push(state.slice(this.tile_size, this.tile_size * 2));
            }
        }
        return states;
    }

    getTile(ix, it, tr) {
        console.assert(it >= 0);
        const index = [ix, it];
        if (this.tiles[index] === undefined) {
            const tile = this.updateTile(ix, it, tr);
            if (tile !== null) {
                this.tiles[index] = tile;
            }
            return tile;
        }
        return this.tiles[index];
    }

    setInitialState(initial) {
        this.initial = initial;
        this.tiles = {};
    }

    step(state) {
        return state.map((v_c, ix) => {
            const v_l = ix - 1 < 0 ? state[state.length - 1] : state[ix - 1];
            const v_r = ix + 1 >= state.length ? state[0] : state[ix + 1];

            const v_enc = (v_l ? 4 : 0) | (v_c ? 2 : 0) | (v_r ? 1 : 0);

            return (this.rule & (1 << v_enc)) !== 0;
        });
    }

    getTileSize() {
        return this.tile_size;
    }
}
