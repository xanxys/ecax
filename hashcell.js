class Timeout {
    /**
     * Construct timeout, count start immediately.
     * @param {number} duration timeout duration in seconds
     */
    constructor(duration) {
        this.timeout = duration + Date.now() / 1000;
    }

    shouldRun() {
        const t = Date.now() / 1000;
        return t < this.timeout;
    }
}


/**
 * Space-time fragments of ECA with specific rule.
 * Since this only cares about fragments, it doesn't care about initial conditions or coodinate system.
 */
class STRelative {
    /**
     * 
     * @param {number} rule rule number (0~255)
     */
    constructor(rule) {
        this.rule = rule;

        // slice key: "bs:left_id:right_id"
        // slicesKI & slicesIK are always kept in sync.
        this.sliceId0 = 0;
        this.sliceId1 = 1;
        this.nextSliceId = 2; // reserve 0 & 1 for debuggability
        this.slicesKI = new Map(); // slice key -> slice id
        this.slicesIK = new Map(); // slice id -> slice key

        // when "curr" is of size bs (2^bs cells),
        // "next" is a slice of size bs-1, determined by stepping "curr" by 2^(bs-2) steps.
        //    
        // |---curr---| bs   (t = k)
        //    |next|    bs-1 (t = k + 2^(bs-2))
        //
        // curr size must be bs >= 2 (4 cells or more).
        this.nexts = new Map(); // "curr" slice id -> "next" slice id
    }

    // TODO: needs stopper (this can explode for random ECA)
    /**
     * Get "next" slice of the tile with given "curr".
     * curr must contains 4 or more cells.
     * next is half width of curr, and curr_size / 4 steps ahead of curr.
     * 
     * @param {number} curr "curr" slice id
     * @returns {number} "next" slice id
     */
    getNext(currId) {
        if (this.nexts.has(currId)) {
            return this.nexts.get(currId);
        }
        if (currId === this.sliceId0 || currId === this.sliceId1) {
            throw new Error("curr must contains 4 cells or more.");
        }
        const currKey = this.slicesIK.get(currId);
        if (currKey === undefined) {
            throw new Error(`Unknown slice ${currId}`);
        }

        const [currBs, currLId, currRId] = STRelative._unkey(currKey);
        const currLKey = this.slicesIK.get(currLId);
        const currRKey = this.slicesIK.get(currRId);
        const [, llId, lrId] = STRelative._unkey(currLKey);
        const [, rlId, rrId] = STRelative._unkey(currRKey);
        let next;
        if (currBs === 2) {
            // primitive: 2 rule applications
            const ll = llId === this.sliceId1;
            const lr = lrId === this.sliceId1;
            const rl = rlId === this.sliceId1;
            const rr = rrId === this.sliceId1;

            const nextLId = this._step(ll, lr, rl) ? this.sliceId1 : this.sliceId0;
            const nextRId = this._step(lr, rl, rr) ? this.sliceId1 : this.sliceId0;
            next = this._getId(currBs - 1, nextLId, nextRId);
        } else {
            // composite: 3 half-steps + 2 half-steps
            const mL = this.getNext(currLId);
            const mC = this.getNext(this._getId(currBs - 1, lrId, rlId));
            const mR = this.getNext(currRId);

            const nL = this.getNext(this._getId(currBs - 1, mL, mC));
            const nR = this.getNext(this._getId(currBs - 1, mC, mR));
            next = this._getId(currBs - 1, nL, nR);
        }
        this.nexts.set(currId, next);
        return next;
    }

    /**
     * Return slice id for a single cell.
     * 
     * @param {boolean} state cell state
     * @returns {number} slice id
     */
    getPrimitive(state) {
        return state ? this.sliceId1 : this.sliceId0;
    }

    /**
     * Get slice id by combining two slices of the same size.
     * 
     * @param {number} leftId 
     * @param {number} rightId 
     * @returns {number} slice id
     */
    getComposite(leftId, rightId) {
        if (leftId === this.sliceId0 || leftId === this.sliceId1) {
            if (rightId !== this.sliceId0 && rightId !== this.sliceId1) {
                throw new Error("Slice bs must match");
            }
            return this._getId(1, leftId, rightId);
        }

        if (!this.slicesIK.has(leftId) || !this.slicesIK.has(rightId)) {
            throw new Error(`Unknown input slice id in ${leftId} and/or ${rightId}`);
        }

        const lBs = STRelative._unkey(this.slicesIK.get(leftId))[0];
        const rBs = STRelative._unkey(this.slicesIK.get(rightId))[0];
        if (lBs !== rBs) {
            throw new Error("Slice bs must match");
        }
        return this._getId(lBs + 1, leftId, rightId);
    }

    getBlockSize(sliceId) {
        if (sliceId === this.sliceId0 || sliceId === this.sliceId1) {
            return 0;
        }
        return STRelative._unkey(this.slicesIK.get(sliceId))[0];
    }

    /**
     * 
     * @param {number} sliceId 
     * @returns {number} slice id
     */
    getLeft(sliceId) {
        if (sliceId === this.sliceId0 || sliceId === this.sliceId1) {
            throw new Error("Primitive slice has no left");
        }
        const [, lid,] = STRelative._unkey(this.slicesIK.get(sliceId));
        return lid;
    }

    getRight(sliceId) {
        if (sliceId === this.sliceId0 || sliceId === this.sliceId1) {
            throw new Error("Primitive slice has no left");
        }
        const [, , rid] = STRelative._unkey(this.slicesIK.get(sliceId));
        return rid;
    }

    /**
     * Constructs a key string.
     * @param {number} bs block size (>= 1)
     * @param {number} lid left slice id (block size must be bs-1)
     * @param {number} rid right slice id (block size must be bs-1)
     * @returns {string} key
     */
    static _key(bs, lid, rid) {
        // 10b, 20b, 20b
        return ((bs * 1024 * 1024 * 1024 * 1024) + (lid * 1024 * 1024) + rid); // use *, because << is limited to 32 bit
    }

    /**
     * Deconstructs a key string.
     * @param {string} key 
     * @returns {[number, number, number]} [bs, lid, rid]
     */
    static _unkey(key) {
        const v = key;
        return [Math.floor(v / (1024 * 1024 * 1024 * 1024)), Math.floor(v / (1024 * 1024)) & 0xfffff, v & 0xfffff];
    }

    /** Returns a slice id for a given composite slice. */
    _getId(bs, lid, rid) {
        const key = STRelative._key(bs, lid, rid);
        let id = this.slicesKI.get(key);
        if (id !== undefined) {
            return id;
        }
        id = this.nextSliceId;
        if (id >= 1024 * 1024) {
            throw new Error("Too many slices; cannot issue more.");
        }
        this.nextSliceId += 1;
        this.slicesKI.set(key, id);
        this.slicesIK.set(id, key);
        return id;
    }

    /**
     * Step a cell by a single time step.
     * 
     * @param {boolean} l left neighbor cell state
     * @param {boolean} c center cell state
     * @param {boolean} r right neighbor cell state
     * @returns {boolean} center cell state at next step
     */
    _step(l, c, r) {
        // Encode current neighbors to [0, 8) value.
        const vEncoded = (l ? 4 : 0) | (c ? 2 : 0) | (r ? 1 : 0);
        // Lookup
        return (this.rule & (1 << vEncoded)) !== 0;
    }
}


/**
 * Entire space-time of ECA with specific rule & initial condition.
 * Coordinate system (x, t). x: integer, t: natural number (>=0)
 */
class STAbsolute {
    /**
     * If initLCyc or initRCyc is not provided, it's assumed to be 0.
     * All the infinite input cells are specified like this:
     * ..., initLCyc, initLCyc, initC, initRCyc, initRCyc, ...
     * initC[0] corresponds to (0, 0).
     * 
     * @param {number} rule ECA rule number (0~255)
     * @param {boolean[]} initC center part of initial cells. initC[0] corresponds to (0, 0).
     * @param {boolean[]} initLCyc left part of initial cells, cyclic. initLCyc[-1] corresponds to (-1, 0).
     * @param {boolean[]} initRCyc right part of initial cells, cyclic. initRCyc[0] corresponds to (initC.length, 0).
     */
    constructor(rule, initC, initLCyc, initRCyc) {
        this.stRelative = new STRelative(rule);
        this.initC = initC || [true];
        this.initLCyc = initLCyc || [false];
        this.initRCyc = initRCyc || [false];

        // this.initSlices = new Map(); // key (format: ???) -> slice id
        this.sliceCache = new Map(); // key (format: "x:t:bs") -> slice id
    }

    // TODO: needs stopper (this can explode for random ECA)
    /**
     * Get slice corresponding to [x, x + 2^bs - 1] at t.
     * 
     * @param {number} x
     * @param {number} t
     * @param {number} bs
     * @returns {number} slice id
     */
    getSliceAt(x, t, bs) {
        if (t < 0) {
            throw new Error("t must be >= 0");
        }

        const key = `${x}:${t}:${bs}`;
        const slice = this.sliceCache.get(key);
        if (slice !== undefined) {
            return slice;
        }

        // TODO:
        // This code works, but inefficient.
        // current code eventually evaluates all cells individually at t=0.
        // by handling t == 0 & bs > 0 case specially by using modulo, it can be exponentially fast.
        let result;
        if (bs === 0) {
            if (t === 0) {
                const n = this.initC.length;
                let v;
                if (x < 0) {
                    const k = this.initLCyc.length;
                    v = ((x % k) + k) % k;
                } else if (x < n) {
                    v = this.initC[x];
                } else {
                    const k = this.initRCyc.length;
                    v = this.initRCyc[(x - n) % k];
                }
                result = this.stRelative.getPrimitive(v);
            } else {
                result = this.stRelative.getLeft(this.getSliceAt(x, t, 1));
            }
        } else {
            const d = 2 ** (bs - 1);
            if (t - d >= 0) {
                result = this.stRelative.getNext(this.getSliceAt(x - d, t - d, bs + 1));
            } else {
                // overshoots: divide and continue
                result = this.stRelative.getComposite(this.getSliceAt(x, t, bs - 1), this.getSliceAt(x + d, t, bs - 1));
            }
        }
        this.sliceCache.set(key, result);
        return result;
    }
}


/**
 * Wrapper of STAbsolute that expose rectangular tiles for easier visualization.
 */
class STBlocks {
    /**
     * @typedef block is a spatio-temporal region of cells, completely determined by curr (top edge).
     * block consists of 2x2 sub-blocks, useful for visualization of space-time.
     * 
     * @property {number} id block id
     * @property {number} bs block size
     * 
     * @property {boolean} l left cell state (bs == 1)
     * @property {boolean} r right cell state (bs == 1)
     * 
     * @property {block} upperL (bs > 1)
     * @property {block} upperR (bs > 1)
     * @property {block} lowerL (bs > 1)
     * @property {block} lowerR (bs > 1)
     */

    /**
     * 
     * @param {STAbsolute} st space-time
     */
    constructor(st) {
        this.st = st;
        this.strel = st.stRelative;
    }

    /**
     * Get block whose origin is (x, t).
     * block width: 2^bs, height: 2^(bs-1)
     * 
     * @param {number} x
     * @param {number} t
     * @param {number} bs >= 1
     * @returns {block}
     */
    getBlockAt(x, t, bs) {
        if (bs < 1) {
            throw new Error("bs must be >= 1");
        }
        const slice = this.st.getSliceAt(x - 2 ** (bs - 1), t, bs + 1);  // this slice causally determines represents the block.
        return this.getBlockById(slice);
    }

    /** 
     * @param {number} blockId
     * @returns {block} block with given id
     */
    getBlockById(blockId) {
        const bs = this.strel.getBlockSize(blockId); // must be >= 2.
        if (bs === 2) {
            const lr = this.strel.getRight(this.strel.getLeft(blockId));
            const rl = this.strel.getLeft(this.strel.getRight(blockId));
            return {
                id: blockId,
                bs: bs - 1,
                l: lr === this.st.stRelative.sliceId1,
                r: rl === this.st.stRelative.sliceId1,
            };
        } else {
            const ss = this._decompose8(blockId);
            const upperL = this._compose4(ss[1], ss[2], ss[3], ss[4]);
            const upperR = this._compose4(ss[3], ss[4], ss[5], ss[6]);

            const midL = this.strel.getNext(this._compose4(ss[0], ss[1], ss[2], ss[3]));
            const midC = this.strel.getNext(this._compose4(ss[2], ss[3], ss[4], ss[5]));
            const midR = this.strel.getNext(this._compose4(ss[4], ss[5], ss[6], ss[7]));
            const lowerL = this.strel.getComposite(midL, midC);
            const lowerR = this.strel.getComposite(midC, midR);

            return {
                id: blockId,
                bs: bs - 1,
                upperL, upperR, lowerL, lowerR,
            };
        }
    }

    _compose4(a, b, c, d) {
        return this.st.stRelative.getComposite(
            this.st.stRelative.getComposite(a, b),
            this.st.stRelative.getComposite(c, d)
        );
    }

    _decompose8(slice) {
        const result = [];
        for (let i = 0; i < 8; i++) {
            const sub0 = (i & 4) === 0 ? this.st.stRelative.getLeft(slice) : this.st.stRelative.getRight(slice);
            const sub1 = (i & 2) === 0 ? this.st.stRelative.getLeft(sub0) : this.st.stRelative.getRight(sub0);
            const sub2 = (i & 1) === 0 ? this.st.stRelative.getLeft(sub1) : this.st.stRelative.getRight(sub1);
            result.push(sub2);
        }
        return result;
    }
}



// Hashlife for ECA.
// When traversed, the universe will look like a binary tree;
// however, nodes with same pattern are shared.
class HashCell {
    constructor(rule) {
        this.rule = rule;
        this.new_id = 0;
        this.cache = {};
        this.setInitialState(x => x === 0);

        this.tile_size = 256;
        this.extension_op = null;
    }

    step(state) {
        return state.map((v_c, ix) => {
            const v_l = ix - 1 < 0 ? state[state.length - 1] : state[ix - 1];
            const v_r = ix + 1 >= state.length ? state[0] : state[ix + 1];

            // Encode current neighbors to [0, 8) value.
            const v_enc = (v_l ? 4 : 0) | (v_c ? 2 : 0) | (v_r ? 1 : 0);

            // Lookup
            return (this.rule & (1 << v_enc)) !== 0;
        });
    }

    /**
     * @callback initialState
     * @param {number} index
     * @returns {boolean} cell value
     */
    /**
     * 
     * @param {initialState} initial
     */
    setInitialState(initial) {
        this.initial = initial;

        // [-2^(level-1), 2^(level-1))
        const level = 10;
        this.dx = - (2 ** (level - 1));
        this.root = this.createFromInitial(this.dx, level);
    }

    // This is original version of createFromInitialInterleaved.
    // Create HashCellNode that spans [dx, dx + 2^level).
    createFromInitial(dx, level) {
        if (level === 0) {
            return this.createCanonicalNode(this.initial(dx));
        } else {
            return this.createCanonicalNode(
                this.createFromInitial(dx, level - 1),
                this.createFromInitial(dx + 2 ** (level - 1), level - 1)
            );
        }
    }

    // This version will take at most O(level) time.
    createFromInitialInterleaved(dx, level, tr) {
        let index = dx;
        const incomplete = [];

        if (this.partial_tree !== undefined && this.partial_tree !== null) {
            if (dx !== this.partial_tree.dx || level !== this.partial_tree.level) {
                throw new Error("Calculation parameter changed while in calculation");
            }
            index = this.partial_tree.index;
            incomplete.push(...this.partial_tree.incomplete);
        }

        while (index < dx + 2 ** level) {
            if (!tr.shouldRun()) {
                this.partial_tree = {
                    // For sanity check.
                    dx,
                    level,

                    // Current state
                    index,
                    incomplete: [...incomplete],
                };
                return null;
            }

            incomplete.push(this.createCanonicalNode(this.initial(index)));
            index += 1;

            // Merge until no subtree is complete: O(level) time
            while (incomplete.length >= 2) {
                const curr = incomplete.pop();
                const prev = incomplete.pop();

                if (prev.level === curr.level) {
                    incomplete.push(this.createCanonicalNode(prev, curr));
                } else {
                    // Revert pop*2.
                    incomplete.push(prev);
                    incomplete.push(curr);
                    break;
                }
            }
        }
        console.assert(incomplete.length === 1);
        this.partial_tree = null;
        return incomplete[0];
    }

    getRoot() {
        return {
            dx: this.dx,
            node: this.root,
        };
    }

    extendLeft(tr) {
        // Ignore operation if another extension is ongoing.
        if (this.extension_op !== "extendLeft" && this.extension_op !== null) {
            return;
        }

        this.extension_op = "extendLeft";
        const new_dx = this.dx - 2 ** this.root.level;
        const subtree = this.createFromInitialInterleaved(new_dx, this.root.level, tr);

        if (subtree !== null) {
            this.root = this.createCanonicalNode(subtree, this.root);
            this.dx = new_dx;
            this.extension_op = null;
        }
    }

    extendRight(tr) {
        // Ignore operation if another extension is ongoing.
        if (this.extension_op !== "extendRight" && this.extension_op !== null) {
            return;
        }

        this.extension_op = "extendRight";
        const new_dx = this.dx + 2 ** this.root.level;
        const subtree = this.createFromInitialInterleaved(new_dx, this.root.level, tr);

        if (subtree !== null) {
            this.root = this.createCanonicalNode(this.root, subtree);
            this.extension_op = null;
        }
    }

    getTileSize() {
        return this.tile_size;
    }

    // DEPRECATED
    getTile(ix, it, tr) {
        console.assert(it >= 0);
        const index = [ix, it];

        const x = ix * this.tile_size;
        const find = (node, dx) => {
            if (x < dx) {
                return null;
            } else if (x >= dx + 2 ** node.level) {
                return null;
            } else if (x < dx + 2 ** (node.level - 1)) {
                if (2 ** node.level === this.tile_size) {
                    return node;
                } else {
                    return find(node.l, dx);
                }
            } else {
                return find(node.r, dx + 2 ** (node.level - 1));
            }
        };

        const node_slice = find(this.root, -(2 ** (this.root.level - 1)));
        if (node_slice === null) {
            return null;
        } else {
            const slice = node_slice.getPattern();
            return Array(this.tile_size).fill(slice);
        }
    }

    // Behaviorally same as new HashCellNode(this, ...).
    // This method ensured the created HashCellNode is shared to maximum extent.
    createCanonicalNode(arg0, arg1) {
        const node = new HashCellNode(this, arg0, arg1);
        const node_existing = this.cache[node.hash()];
        if (node_existing === undefined) {
            // Register new node and return.
            this.cache[node.hash()] = node;
            return node;
        } else {
            // Return existing node (newly issued id will be discarded)
            return node_existing;
        }
    }

    issueId() {
        const id = this.new_id;
        this.new_id += 1;
        return id;
    }
}

// Immutable node representing 2^n slice of the universe.
// A 2^(n-1) * 2^(n-2) spatio-temporal region is completely tied to
// each HashCellNode.
//
// This constructor is overloaded:
// * single-value: hc, value
// * others: hc, left, right
class HashCellNode {
    constructor(hc, arg0, arg1) {
        this.hashcell = hc;
        this.id = hc.issueId();
        if (arg1 === undefined) {
            this.level = 0;
            this.pattern = [arg0];
        } else {
            this.l = arg0;
            this.r = arg1;
            this.level = arg0.level + 1;
            console.assert(this.l.level === this.r.level);
            console.assert(this.level >= 1);

            if (this.level <= 2) {
                this.pattern = [...this.l.pattern, ...this.r.pattern];
            }
        }
        this.next = null;
        this.nextExp = null;

        this.stAttachment = null;
    }

    // Assuming the nodes are canonical, return a unique hash.
    hash() {
        if (this.level === 0) {
            return `${this.pattern[0]}`;
        } else {
            return `${this.l.id}:${this.r.id}`;
        }
    }

    // Return a smaller node after 1 step.
    // this = |* *|* *|
    // ret  =   |+ +|
    step() {
        console.assert(this.level >= 2);
        if (this.next !== null) {
            return this.next;
        }

        if (this.level === 2) {
            const new_pattern = this.hashcell.step(this.pattern);
            this.next = this.hashcell.createCanonicalNode(
                this.hashcell.createCanonicalNode(new_pattern[1]),
                this.hashcell.createCanonicalNode(new_pattern[2])
            );
        } else {
            // We want to do this:
            // this = |0 1 2 3|4 5 6 7|
            // ret  =     |a b c d|
            //
            // We generate two shifted nodes and step them:
            // |a b| = |1 2 3 4|.step
            // |c d| = |3 4 5 6|.step
            const l_part = this.hashcell.createCanonicalNode(this.l.l.r, this.l.r.l);
            const r_part = this.hashcell.createCanonicalNode(this.r.r.l, this.r.l.r);
            const center = this.hashcell.createCanonicalNode(this.l.r.r, this.r.l.l);

            const l_shifted = this.hashcell.createCanonicalNode(l_part, center);
            const r_shifted = this.hashcell.createCanonicalNode(center, r_part);

            this.next = this.hashcell.createCanonicalNode(l_shifted.step(), r_shifted.step());
        }
        return this.next;
    }

    // Return a smaller node after 2^(level-2) step.
    // this = |* *|* *|
    // ret  =   |+ +|
    stepExp() {
        console.assert(this.level >= 2);
        if (this.nextExp !== null) {
            return this.nextExp;
        }

        if (this.level === 2) {
            const new_pattern = this.hashcell.step(this.pattern);
            this.nextExp = this.hashcell.createCanonicalNode(
                this.hashcell.createCanonicalNode(new_pattern[1]),
                this.hashcell.createCanonicalNode(new_pattern[2])
            );
        } else {
            // We want to do this:
            // this = |0 1 2 3|4 5 6 7|
            // ret  =     |a b c d|
            // Basically we need to run 2 consecutive stepExp at level - 1.
            //
            // 1st:
            // |1 2| = |0 1 2 3|.stepExp
            // |3 4| = |2 3 4 5|.stepExp
            // |5 6| = |4 5 6 7|.stepExp
            // 2nd:
            // |a b| = |1 2 3 4|.stepExp
            // |c d| = |3 4 5 6|.stepExp
            const l_part = this.l.stepExp();
            const r_part = this.r.stepExp();
            const center = this.hashcell.createCanonicalNode(this.l.r, this.r.l).stepExp();

            const l_shifted = this.hashcell.createCanonicalNode(l_part, center).stepExp();
            const r_shifted = this.hashcell.createCanonicalNode(center, r_part).stepExp();

            this.nextExp = this.hashcell.createCanonicalNode(l_shifted, r_shifted);
        }
        return this.nextExp;
    }

    getPattern() {
        if (this.pattern !== undefined) {
            return this.pattern;
        } else {
            return [...this.l.getPattern(), ...this.r.getPattern()];
        }
    }
}
