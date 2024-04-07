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

    const unitIndex = Math.min(Math.floor(Math.log10(n) / 3), units.length - 1);
    const mantissa = n / (10 ** (unitIndex * 3)); // must be in [1, 1000)
    const precAfterDot = Math.max(0, precision - Math.floor(Math.log10(mantissa)) - 1);

    return `${sign ? "" : "-"}${mantissa.toFixed(precAfterDot)}${units[unitIndex]}`;
};


const BLOCK_WIDTH_PX = 128;
const BLOCK_HEIGHT_PX = 64;
const BLOCK_MIN_BS = 7;

// A window into ECA spacetime.
class ECAView {
    constructor() {
        this.$el = $("#eca");
        this.stb = null;

        // p<canvas> = p<ECA> * zoom + t
        this.zoom = 3;
        this.tx = $('#col_eca').width() / 2;
        this.ty = 0;

        // block cache
        this.blockImageDataCache = new LRUMap(50_000);  // block id -> ImageData. 50k blocks is about 1.6GB of image data.

        // setupGUI
        // adjust canvas size
        this.canvasWidth = $('#col_eca').width();
        this.canvasHeight = $(window).height() - 150;
        this.$el[0].width = this.canvasWidth;
        this.$el[0].height = this.canvasHeight;

        this.bufferCanvasNumBlocksW = Math.ceil(this.canvasWidth / BLOCK_WIDTH_PX) + 1;
        this.bufferCanvasNumBlocksH = Math.ceil(this.canvasHeight / BLOCK_HEIGHT_PX) + 1;
        this.bufferCanvas = new OffscreenCanvas(this.bufferCanvasNumBlocksW * BLOCK_WIDTH_PX, this.bufferCanvasNumBlocksH * BLOCK_HEIGHT_PX);

        this.$el.on('mousewheel', event => {
            event.preventDefault();

            // p = event.offsetX,Y must be preserved.
            // p<canvas> = p<ECA> * zoom + t = p<ECA> * new_zoom + new_t

            const centerXECA = (event.offsetX - this.tx) / this.zoom;
            const centerYECA = (event.offsetY - this.ty) / this.zoom;
            this.zoom = Math.min(10, Math.max(1e-12, this.zoom * (1 + event.deltaY * 0.1)));

            this.tx = event.offsetX - centerXECA * this.zoom;
            this.ty = event.offsetY - centerYECA * this.zoom;
        });

        let dragging = false;
        let prevEv = null;
        this.$el.on('mousedown', () => {
            dragging = true;
        });

        this.$el.on('mouseleave', () => {
            dragging = false;
            prevEv = null;
        });

        this.$el.on('mouseup', () => {
            dragging = false;
            prevEv = null;
        });

        this.$el.on('mousemove', event => {
            if (!dragging) {
                return;
            }

            if (prevEv !== null) {
                this.tx += event.clientX - prevEv.clientX;
                this.ty += event.clientY - prevEv.clientY;
            }
            prevEv = event;
        });

        this._run();
    }

    /** Sets new STBlocks */
    updateSTB(stb) {
        this.stb = stb;
        this.blockImageDataCache.clear();
    }

    /**
     * 
     * @param {number} blockId 
     * @returns {ImageData} image of size BLOCK_WIDTH_PX x BLOCK_HEIGHT_PX that visually represents the block
     */
    _computeBlockImage(blockId, timeout) {
        const TRUE_CELL_COL = 100;
        const FALSE_CELL_COL = 255;
        const cache = this.blockImageDataCache.get(blockId);
        if (cache !== undefined) {
            return cache;
        }

        const block = this.stb.getBlockById(blockId, timeout);
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
            const imageUpperL = this._computeBlockImage(block.upperL, timeout);
            const imageUpperR = this._computeBlockImage(block.upperR, timeout);
            const imageLowerL = this._computeBlockImage(block.lowerL, timeout);
            const imageLowerR = this._computeBlockImage(block.lowerR, timeout);

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
        return imageData;
    }

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
    }

    _redraw() {
        if (this.stb === null) {
            setTimeout(() => {
                this._redraw();
            }, 100);
            return;
        }

        const t = Date.now() / 1000;
        if (this.lastStat === undefined || t > this.lastStat + 5) {
            const strel = this.stb.strel;
            const stabs = this.stb.st;
            console.log(`EV: ${this.blockImageDataCache.size()} blocks / STA: ${stabs.sliceCache.size()} slices / STR: ${strel.slicesIK.size} slices + ${strel.nexts.size} nexts`)
            this.lastStat = t;
        }


        const ctx = this.$el[0].getContext('2d');

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.rect(0, 0, this.$el[0].width, this.$el[0].height);
        ctx.fill();

        // Draw ECA.
        const tr = new Timeout(0.1);
        ctx.save();
        ctx.translate(this.tx, this.ty);
        ctx.scale(this.zoom, this.zoom);
        const bufferOffset = this._updateOffscreenBuffer(0.05);
        ctx.imageSmoothingEnabled = this.zoom < 4;
        ctx.drawImage(this.bufferCanvas, bufferOffset.x0, bufferOffset.y0, bufferOffset.w, bufferOffset.h);
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

        const win = this._getWindow();
        ctx.fillStyle = '#020F80';
        const xrange = `x:[${toSINumber(win.x0, 4)},${toSINumber(win.x1, 4)}]`;
        const trange = `t:[${toSINumber(win.y0, 4)},${toSINumber(win.y1, 4)}]`;
        ctx.fillText(`${toSINumber(10 * Math.pow(10, -exponent), 1)}   ${xrange} ${trange}`, 0, 10);
        ctx.restore();

        setTimeout(() => {
            this._redraw();
        }, 100);
    }

    _run() {
        this._redraw();
    }

    /**
     * @returns {object} {x0:number, y0:number, w:number, h:number} Rectangle in ECA coordinates where offscreenBuffer should be drawn.
     */
    _updateOffscreenBuffer(timeoutSec) {
        // Select block size such that each block px results in [1, 2) px in rendered canvas.
        // When zoomed in a lot (single cell occupies multiple pixels), BLOCK_MIN_BS is used.
        const targetBs = Math.max(BLOCK_MIN_BS, 1 + Math.floor(Math.log2(BLOCK_WIDTH_PX / this.zoom)));

        const blockWidth = 2 ** targetBs;
        const blockHeight = 2 ** (targetBs - 1);

        const win = this._getWindow();
        const ix0 = Math.floor(win.x0 / blockWidth); // inclusive
        const ix1 = Math.ceil(win.x1 / blockWidth); // non-inclusive
        const iy0 = Math.max(0, Math.floor(win.y0 / blockHeight)); // inclusive
        const iy1 = Math.max(0, Math.ceil(win.y1 / blockHeight)); // non-inclusive

        const blocks = [];
        const timeout = new Timeout(timeoutSec);
        try {
            for (let iy = iy0; iy < iy1; iy++) {
                for (let ix = ix0; ix < ix1; ix++) {
                    const blockId = this.stb.getBlockAt(ix * blockWidth, iy * blockHeight, targetBs, timeout).id;
                    this._computeBlockImage(blockId, timeout);
                    blocks.push({
                        dix: ix - ix0,
                        diy: iy - iy0,
                        imageData: this.blockImageDataCache.get(blockId)
                    });
                }
            }
        } catch (e) {
            if (e instanceof TimeoutError) {
                // do nothing
            } else {
                throw e;
            }
        }

        // render
        const ctxBuf = this.bufferCanvas.getContext("2d");
        ctxBuf.fillStyle = "#edf5f4"; // "being-computed" color
        ctxBuf.fillRect(0, 0, this.bufferCanvasNumBlocksW * BLOCK_WIDTH_PX, this.bufferCanvasNumBlocksH * BLOCK_HEIGHT_PX);

        blocks.forEach(block => {
            ctxBuf.putImageData(block.imageData, block.dix * BLOCK_WIDTH_PX, block.diy * BLOCK_HEIGHT_PX);
        });

        return {
            x0: ix0 * blockWidth,
            y0: iy0 * blockHeight,
            w: this.bufferCanvasNumBlocksW * blockWidth,
            h: this.bufferCanvasNumBlocksH * blockHeight
        };
    }

    /**
     * Get current visible area of ECA, in ECA coordinates (x, t == y).
     * @returns {object} {x0, x1, y0, y1}
     */
    _getWindow() {
        // p<canvas> = p<ECA> * zoom + t
        // p<ECA> = (p<canvas> - t) / zoom
        return {
            x0: (-this.tx) / this.zoom,
            x1: (this.canvasWidth - this.tx) / this.zoom,
            y0: Math.max(0, (-this.ty) / this.zoom),
            y1: (this.canvasHeight - this.ty) / this.zoom,
        };
    }
}
