class Timeout {
    /**
     * Construct timeout, count start immediately.
     * @param {number} duration timeout duration in seconds
     */
    constructor(duration) {
        this.timeout = duration + Date.now() / 1000;
    }

    checkTime() {
        const t = Date.now() / 1000;
        if (t >= this.timeout) {
            throw new TimeoutError();
        }
    }
}

class TimeoutError {
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

    /**
     * Get "next" slice of the tile with given "curr".
     * curr must contains 4 or more cells.
     * next is half width of curr, and curr_size / 4 steps ahead of curr.
     * 
     * @param {number} curr "curr" slice id
     * @param {Timeout} timeout timeout checker. throws TimeoutError when time is up.
     * @returns {number} "next" slice id
     */
    getNext(currId, timeout) {
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

        if (timeout !== undefined) {
            timeout.checkTime();
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

        this.sliceCache = new Map(); // key (format: "x:t:bs") -> slice id
    }

    /**
     * Get slice corresponding to [x, x + 2^bs - 1] at t.
     * 
     * @param {number} x
     * @param {number} t
     * @param {number} bs
     * @param {Timeout} timeout timeout checker. throws TimeoutError when time is up.
     * @returns {number} slice id
     */
    getSliceAt(x, t, bs, timeout) {
        if (t < 0) {
            throw new Error("t must be >= 0");
        }

        const key = this._key(x, t, bs);
        const slice = this.sliceCache.get(key);
        if (slice !== undefined) {
            return slice;
        }

        if (timeout !== undefined) {
            timeout.checkTime();
        }

        // Basic computation strategy: reduce to slices at t == 0 (which is given by initial condition).
        let result;
        if (bs === 0) {
            if (t === 0) {
                result = this.stRelative.getPrimitive(this._getInitCellAt(x));
            } else {
                // to go up in time, make slice bigger by chosing arbitrary parent.
                result = this.stRelative.getLeft(this.getSliceAt(x, t, 1));
            }
        } else {
            const d = 2 ** (bs - 1);
            if (t - d >= 0) {
                // Compute target by first computing "parent" slie and get its "next".
                result = this.stRelative.getNext(this.getSliceAt(x - d, t - d, bs + 1, timeout), timeout);
            } else {
                // If "parent" exists in t < 0, divide in half (thus making parents closer in time) and compute them recursively.
                result = this.stRelative.getComposite(this.getSliceAt(x, t, bs - 1, timeout), this.getSliceAt(x + d, t, bs - 1, timeout));
            }
        }
        this.sliceCache.set(key, result);
        return result;
    }

    _getInitCellAt(x) {
        const n = this.initC.length;
        if (x < 0) {
            const k = this.initLCyc.length;
            return this.initLCyc[((x % k) + k) % k];
        } else if (x < n) {
            return this.initC[x];
        } else {
            const k = this.initRCyc.length;
            return this.initRCyc[(x - n) % k];
        }
    }

    /**
     * Returns cache key for getSliceAt(x, t, bs).
     * @param {number} x 
     * @param {number} t 
     * @param {number} bs
     * @returns {string} cache key 
     */
    _key(x, t, bs) {
        // use cyclicity to re-use cache if possible.
        if (t === 0) {
            const width = 2 ** bs;
            const x0 = x;
            const x1 = x + width; // exclusive

            if (x1 <= 0) {
                // slice is in completely left-periodic region.
                x = (x1 % this.initLCyc.length) - width;
            } else if (x0 >= this.initC.length) {
                // slice is in completely right-periodic region.
                x = (x - this.initC.length) % this.initRCyc.length + this.initC.length;
            }
        }

        // generic fallback
        return `${x}:${t}:${bs}`;
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
     * @param {Timeout} timeout timeout checker. throws TimeoutError when time is up.
     * @returns {block}
     */
    getBlockAt(x, t, bs, timeout) {
        if (bs < 1) {
            throw new Error("bs must be >= 1");
        }
        const slice = this.st.getSliceAt(x - 2 ** (bs - 1), t, bs + 1, timeout);  // this slice causally determines represents the block.
        return this.getBlockById(slice, timeout);
    }

    /** 
     * @param {number} blockId
     * @param {Timeout} timeout timeout checker. throws TimeoutError when time is up.
     * @returns {block} block with given id
     */
    getBlockById(blockId, timeout) {
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

            const midL = this.strel.getNext(this._compose4(ss[0], ss[1], ss[2], ss[3]), timeout);
            const midC = this.strel.getNext(this._compose4(ss[2], ss[3], ss[4], ss[5]), timeout);
            const midR = this.strel.getNext(this._compose4(ss[4], ss[5], ss[6], ss[7]), timeout);
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
