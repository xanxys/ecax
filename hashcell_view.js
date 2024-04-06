/**
 * Convert number to a string with a unit, while showing at least precision digits.
 * 123, 2 -> 123
 * 123456, 2 -> 123k (not 0.123M)
 * 123456, 4 -> 123.5k
 * -123, 2 -> -123
 * 
 * @param {number} n number to format
 * @param {number} precision number of digits that needs to be represented
 * @returns 
 */
const toSINumber = (n, precision) => {
    if (Math.abs(n) < 1) {
        return n.toFixed(precision);
    }

    const units = ["", "k", "M", "G", "T", "P", "E", "Z", "Y"];
    const sign = n > 0;
    n = Math.abs(n);

    const unit_index = Math.min(Math.floor(Math.log10(n) / 3), units.length - 1);
    const mantissa = n / (10 ** (unit_index * 3)); // must be in [1, 1000)
    const precAfterDot = Math.max(0, precision - Math.floor(Math.log10(mantissa)) - 1);

    return `${sign ? "" : "-"}${mantissa.toFixed(precAfterDot)}${units[unit_index]}`;
};

const BLOCK_WIDTH_PX = 128;
const BLOCK_HEIGHT_PX = 64;
const BLOCK_MIN_BS = 7;

// A window into a HashCell.
const HashCellView = Backbone.View.extend({
    el: '#eca',

    initialize(options) {
        this.eca = options.eca;
        this.stb = options.stb;

        // p<canvas> = p<ECA> * zoom + t
        this.zoom = 3;
        this.tx = $('#col_eca').width() / 2;
        this.ty = 0;

        // block cache
        this.blockImageDataCache = new Map(); // block id -> ImageData
        this.blockImageCache = new Map(); // block id -> BitmapImage

        // cache tile
        this.tile_size = this.eca.getTileSize();
        this.tiles = {};

        // setupGUI
        // adjust canvas size
        this.$el[0].width = $('#col_eca').width();
        this.$el[0].height = $(window).height() - 150;

        this.$el.on('mousewheel', event => {
            event.preventDefault();

            // p = event.offsetX,Y must be preserved.
            // p<canvas> = p<ECA> * zoom + t = p<ECA> * new_zoom + new_t

            const center_x_eca = (event.offsetX - this.tx) / this.zoom;
            const center_y_eca = (event.offsetY - this.ty) / this.zoom;
            this.zoom = Math.min(10, Math.max(1e-4, this.zoom * (1 + event.deltaY * 0.1)));

            this.tx = event.offsetX - center_x_eca * this.zoom;
            this.ty = event.offsetY - center_y_eca * this.zoom;
        });

        let dragging = false;
        let prev_ev = null;
        this.$el.on('mousedown', () => {
            dragging = true;
        });

        this.$el.on('mouseleave', () => {
            dragging = false;
            prev_ev = null;
        });

        this.$el.on('mouseup', () => {
            dragging = false;
            prev_ev = null;
        });

        this.$el.on('mousemove', event => {
            if (!dragging) {
                return;
            }

            if (prev_ev !== null) {
                this.tx += event.clientX - prev_ev.clientX;
                this.ty += event.clientY - prev_ev.clientY;
            }
            prev_ev = event;
        });
    },

    /**
     * 
     * @param {number} blockId 
     * @returns {ImageData} image of size BLOCK_WIDTH_PX x BLOCK_HEIGHT_PX that visually represents the block
     */
    computeBlockImage(blockId) {
        const TRUE_CELL_COL = 100;
        const FALSE_CELL_COL = 255;
        if (this.blockImageDataCache.has(blockId)) {
            return this.blockImageDataCache.get(blockId);
        }

        const block = this.stb.getBlockById(blockId);
        if (block.bs < BLOCK_MIN_BS) {
            throw new Error("Block size is too small to render");
        }

        const imageData = new ImageData(BLOCK_WIDTH_PX, BLOCK_HEIGHT_PX);
        if (block.bs === BLOCK_MIN_BS) {
            // fill pixel-by-pixel
            const cells = new Uint8Array(BLOCK_WIDTH_PX * BLOCK_HEIGHT_PX);
            this._writeBlockCells(cells, BLOCK_WIDTH_PX, BLOCK_HEIGHT_PX, 0, 0, blockId);
            for (let i = 0; i < cells.length; i++) {
                if (cells.buffer[i] > 0) {
                    imageData.data[i * 4 + 0] = TRUE_CELL_COL;
                    imageData.data[i * 4 + 1] = TRUE_CELL_COL;
                    imageData.data[i * 4 + 2] = TRUE_CELL_COL;
                } else {
                    imageData.data[i * 4 + 0] = FALSE_CELL_COL;
                    imageData.data[i * 4 + 1] = FALSE_CELL_COL;
                    imageData.data[i * 4 + 2] = FALSE_CELL_COL;
                }
                imageData.data[i * 4 + 3] = 255; // alpha
            }
        } else {
            // downscale and combine sub-blocks
            const imageUpperL = this.computeBlockImage(block.upperL);
            const imageUpperR = this.computeBlockImage(block.upperR);
            const imageLowerL = this.computeBlockImage(block.lowerL);
            const imageLowerR = this.computeBlockImage(block.lowerR);

            const hw = BLOCK_WIDTH_PX / 2;
            const hh = BLOCK_HEIGHT_PX / 2;

            const parts = [
                { x0: 0, y0: 0, image: imageUpperL },
                { x0: hw, y0: 0, image: imageUpperR },
                { x0: 0, y0: hh, image: imageLowerL },
                { x0: hw, y0: hh, image: imageLowerR },
            ];
            parts.forEach(part => {
                for (let y = 0; y < hh; y++) {
                    for (let x = 0; x < hw; x++) {
                        for (let c = 0; c < 4; c++) {
                            const v00 = part.image.data[((x * 2 + 0) + BLOCK_WIDTH_PX * (y * 2 + 0)) * 4 + c];
                            const v10 = part.image.data[((x * 2 + 1) + BLOCK_WIDTH_PX * (y * 2 + 0)) * 4 + c];
                            const v01 = part.image.data[((x * 2 + 0) + BLOCK_WIDTH_PX * (y * 2 + 1)) * 4 + c];
                            const v11 = part.image.data[((x * 2 + 1) + BLOCK_WIDTH_PX * (y * 2 + 1)) * 4 + c];
                            imageData.data[((part.x0 + x) + BLOCK_WIDTH_PX * (part.y0 + y)) * 4 + c] = Math.floor((v00 + v10 + v01 + v11) / 4);
                        }
                    }
                }
            });
        }
        this.blockImageDataCache.set(blockId, imageData);
        createImageBitmap(imageData).then(bitmap => {
            this.blockImageCache.set(blockId, bitmap);
        });
        return imageData;
    },

    /**
     * Write cells of a block to a specified rectangular region of an array.
     * 
     * @param {array} Uint8Array (0: false, 255: true)
     * @param {number} width width of array
     * @param {number} height height of array
     * @param {number} xofs x offset in array
     * @param {number} yofs y offset in array
     * @param {number} blockId 
     * 
     * array format
     * 0, 1, 2,..., W-1
     * W, W+1, ...
     */
    _writeBlockCells(array, width, height, xofs, yofs, blockId) {
        const block = this.stb.getBlockById(blockId);
        if (block.bs === 1) {
            const ofs = xofs + width * yofs;
            array.buffer[ofs + 0] = block.l ? 255 : 0;
            array.buffer[ofs + 1] = block.r ? 255 : 0;
        } else {
            const halfWidth = 2 ** (block.bs - 1);
            const halfHeight = 2 ** (block.bs - 2);
            this._writeBlockCells(array, width, height, xofs + 0, yofs + 0, block.upperL);
            this._writeBlockCells(array, width, height, xofs + halfWidth, yofs + 0, block.upperR);
            this._writeBlockCells(array, width, height, xofs + 0, yofs + halfHeight, block.lowerL);
            this._writeBlockCells(array, width, height, xofs + halfWidth, yofs + halfHeight, block.lowerR);
        }
    },

    notifyUpdate() {
        this.tiles = {};
    },

    // Get 4 nodes that corresponds to quadrants of node.stAttachments.
    getSTDivisions(node) {
        console.assert(node.level > 3);

        const n0l = node.hashcell.createCanonicalNode(
            node.hashcell.createCanonicalNode(node.l.l.r, node.l.r.l),
            node.hashcell.createCanonicalNode(node.l.r.r, node.r.l.l)
        );
        const n0r = node.hashcell.createCanonicalNode(
            node.hashcell.createCanonicalNode(node.l.r.r, node.r.l.l),
            node.hashcell.createCanonicalNode(node.r.l.r, node.r.r.l)
        );

        // lower half
        const center_q = node.hashcell.createCanonicalNode(node.l.r, node.r.l).stepExp();
        const l_q = node.l.stepExp();
        const r_q = node.r.stepExp();

        const n1l = node.hashcell.createCanonicalNode(l_q, center_q);
        const n1r = node.hashcell.createCanonicalNode(center_q, r_q);

        return [[n0l, n0r], [n1l, n1r]];
    },

    getAttachment(node, tr) {
        if (node.level <= 2) {
            return null;
        }

        if (node.stAttachment !== null) {
            return node.stAttachment;
        }

        if (!tr.shouldRun()) {
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;

        const ctx = canvas.getContext('2d');
        if (node.level > 3) {
            const quads = this.getSTDivisions(node);

            const i0l = this.getAttachment(quads[0][0], tr);
            const i0r = this.getAttachment(quads[0][1], tr);
            const i1l = this.getAttachment(quads[1][0], tr);
            const i1r = this.getAttachment(quads[1][1], tr);
            if (i0l === null || i0r === null || i1l === null || i1r === null) {
                return null;
            }

            ctx.drawImage(i0l, 0, 0, 128, 64);
            ctx.drawImage(i0r, 128, 0, 128, 64);
            ctx.drawImage(i1l, 0, 64, 128, 64);
            ctx.drawImage(i1r, 128, 64, 128, 64);
        } else {
            console.assert(node.level === 3);
            ctx.save();
            ctx.scale(256 / 4, 256 / 4);
            let slice = node.getPattern();
            for (let t = 0; t < 2; t++) {
                for (let x = 0; x < 4; x++) {
                    const v = slice[x + 2];
                    ctx.beginPath();
                    ctx.rect(x, t, 1, 1);
                    ctx.fillStyle = v ? 'rgb(100, 100, 100)' : 'white';
                    ctx.fill();
                }
                slice = node.hashcell.step(slice);
            }
            ctx.restore();
        }
        node.stAttachment = canvas;
        return canvas;
    },

    // If immediate: may return null when it takes time to calculate the tile.
    getTile(ix, it, tr) {
        const index = [ix, it];
        if (this.tiles[index] !== undefined) {
            return this.tiles[index];
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.tile_size;
        canvas.height = this.tile_size;

        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.rect(0, 0, this.tile_size, this.tile_size);
        ctx.fill();

        ctx.save();

        ctx.lineWidth = 0.1;
        ctx.beginPath();
        ctx.moveTo(-500, 0);
        ctx.lineTo(500, 0);
        ctx.strokeStyle = 'gray';
        ctx.stroke();

        const enable_cells = $('#ui_cells').is(':checked');
        const enable_highlight = $('#ui_highlight').is(':checked');

        const data = this.eca.getTile(ix, it, tr);
        const data_l = this.eca.getTile(ix - 1, it, tr);
        const data_r = this.eca.getTile(ix + 1, it, tr);
        if (data === null || data_l === null || data_r === null || !tr.shouldRun()) {
            return null;
        }

        for (let t = 0; t < this.tile_size; t++) {
            const state = data[t];

            if (enable_cells) {
                state.forEach((v, x) => {
                    ctx.beginPath();
                    ctx.rect(x, t, 1, 1);

                    ctx.fillStyle = v ? 'rgb(100, 100, 100)' : 'white';
                    ctx.fill();
                });
            }

            if (enable_highlight) {
                const ext_state = [...data_l[t], ...data[t], ...data_r[t]];

                ext_state.forEach((v, ext_x) => {
                    const x = ext_x - this.tile_size;
                    this.patterns.forEach(entry => {
                        const pattern = entry.pattern;

                        const x_end = x + pattern.length;
                        if (ext_state.slice(x + this.tile_size, x_end + this.tile_size).every((v, i) => v === pattern[i])) {
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
        }
        ctx.restore();
        this.tiles[index] = canvas;
        return canvas;
    },

    redraw() {
        const ctx = this.$el[0].getContext('2d');

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.rect(0, 0, this.$el[0].width, this.$el[0].height);
        ctx.fill();

        // Draw visible tiles
        const tr = new Timeout(0.1);
        ctx.save();
        ctx.translate(this.tx, this.ty);
        ctx.scale(this.zoom, this.zoom);

        // TODO: draw here
        const blocks = this.getVisibleBlocks();
        ctx.imageSmoothingEnabled = this.zoom < 4;
        blocks.forEach(block => {
            ctx.drawImage(block.image, block.x0, block.y0, block.w, block.h);
        });

        /*
        const node_descs = this.getVisibleNodes(tr);
        node_descs.forEach(node_desc => {
            const attachment = this.getAttachment(node_desc.node, tr);

            ctx.save();
            const k = node_desc.width / 256;
            ctx.translate(node_desc.dx, node_desc.dy);
            ctx.scale(k, k);

            if (attachment !== null) {
                ctx.drawImage(attachment, 0, 0);
            } else {
                ctx.fillStyle = "#020F80";
                ctx.fillText("Calculating", 64, 64);
            }
            ctx.restore();
        });
        */
        ctx.restore();

        // Draw ruler (10x10 - 10x100)
        const exponent = Math.floor(Math.log10(this.zoom));
        const fraction = this.zoom / Math.pow(10, exponent);

        ctx.save();
        ctx.translate(0, this.$el[0].height - 20);
        ctx.beginPath();
        ctx.rect(0, 0, 300, 20);
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 15);
        ctx.lineTo(fraction * 10, 15);
        ctx.strokeStyle = '#020F80';
        ctx.stroke();

        const win = this.getWindow();
        ctx.fillStyle = '#020F80';
        const xrange = `x:[${toSINumber(win.x0, 4)},${toSINumber(win.x1, 4)}]`;
        const trange = `t:[${toSINumber(win.y0, 4)},${toSINumber(win.y1, 4)}]`;
        ctx.fillText(`${toSINumber(10 * Math.pow(10, -exponent), 1)}   ${xrange} ${trange}`, 0, 10);
        ctx.restore();

        setTimeout(() => {
            this.redraw();
        }, 100);
    },



    run() {
        this.redraw();
    },

    /**
     * @returns {object[]} [{x0: number, y0: number, w: number, h: number, image: ImageData}]
     */
    getVisibleBlocks() {
        // Select block size such that each block px results in [1, 2) px in rendered canvas.
        // When zoomed in a lot (single cell occupies multiple pixels), BLOCK_MIN_BS is used.
        const targetBs = Math.max(BLOCK_MIN_BS, 1 + Math.floor(Math.log2(BLOCK_WIDTH_PX / this.zoom)));

        const blockWidth = 2 ** targetBs;
        const blockHeight = 2 ** (targetBs - 1);

        const win = this.getWindow();
        const ix0 = Math.floor(win.x0 / blockWidth); // inclusive
        const ix1 = Math.ceil(win.x1 / blockWidth); // non-inclusive
        const iy0 = Math.max(0, Math.floor(win.y0 / blockHeight)); // inclusive
        const iy1 = Math.max(0, Math.ceil(win.y1 / blockHeight)); // non-inclusive

        const result = [];
        for (let iy = iy0; iy < iy1; iy++) {
            for (let ix = ix0; ix < ix1; ix++) {
                const blockId = this.stb.getBlockAt(ix * blockWidth, iy * blockHeight, targetBs).id;
                this.computeBlockImage(blockId);
                const image = this.blockImageCache.get(blockId);
                if (image !== undefined) {
                    result.push({
                        x0: ix * blockWidth,
                        y0: iy * blockHeight,
                        w: blockWidth,
                        h: blockHeight,
                        image: image
                    });
                }
            }
        }
        return result;
    },

    //return [{node:HashCellNode, dx, dy, width}]
    getVisibleNodes(tr) {
        // Select target level low enough so that attachment zoom falls in
        // [1, 2). Which means 2^(level-1) * zoom = attachment.width.
        const target_level = Math.max(0, 2 + Math.floor(Math.log2(256 / this.zoom)));

        const win = this.getWindow();
        const findTargetNodes = (node, dx, dy) => {
            const w = Math.pow(2, node.level - 1);
            const h = w / 2;

            // Discard if there's no overlap with the window.
            if (dx + w < win.x0 || dx > win.x1 || dy + h < win.y0 || dy > win.y1) {
                return [];
            }

            // Return as is if this is small enough.
            if (node.level <= target_level) {
                return [{
                    node: node,
                    dx: dx,
                    dy: dy,
                    width: w,
                }];
            }

            // Still too large; divide into quads and collect.
            const quads = this.getSTDivisions(node);
            let nodes = [];
            for (let iy = 0; iy < 2; iy++) {
                for (let ix = 0; ix < 2; ix++) {
                    nodes = nodes.concat(
                        findTargetNodes(quads[iy][ix], dx + ix * w / 2, dy + iy * h / 2)
                    );
                }
            }
            return nodes;
        };

        // If root is smaller than window, replace root with larger one.
        let root = this.eca.getRoot();
        if (win.x0 < root.dx + Math.pow(2, root.node.level - 2)) {
            this.eca.extendLeft(tr);
        } else if (root.dx + 3 * Math.pow(2, root.node.level - 2) < win.x1) {
            this.eca.extendRight(tr);
        } else if (Math.pow(2, root.node.level - 2) < win.y1) {
            this.eca.extendLeft(tr);  // in this case, left or right doesn't matter.
        }

        return findTargetNodes(root.node, root.dx + Math.pow(2, root.node.level - 2), 0);
    },

    getVisibleTileIndices() {
        const win = this.getWindow();
        const indices = [];
        for (let iy = Math.floor(win.y0 / this.tile_size); iy < Math.ceil(win.y1 / this.tile_size); iy++) {
            for (let ix = Math.floor(win.x0 / this.tile_size); ix < Math.ceil(win.x1 / this.tile_size); ix++) {
                indices.push([ix, iy]);
            }
        }
        return indices;
    },

    /**
     * Get current visible area of ECA, in ECA coordinates (x, t == y).
     * @returns {object} {x0, x1, y0, y1}
     */
    getWindow() {
        // p<canvas> = p<ECA> * zoom + t
        // p<ECA> = (p<canvas> - t) / zoom
        return {
            x0: (-this.tx) / this.zoom,
            x1: (this.$el[0].width - this.tx) / this.zoom,
            y0: Math.max(0, (-this.ty) / this.zoom),
            y1: (this.$el[0].height - this.ty) / this.zoom,
        };
    },
});
