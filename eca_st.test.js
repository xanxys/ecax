QUnit.module('LRUMap', hooks => {
    QUnit.test('size1-set/size', assert => {
        const m = new LRUMap(1);
        assert.equal(0, m.size());

        m.set('a', 1);
        assert.equal(1, m.size()); // size increases

        m.set('a', 2);
        assert.equal(1, m.size()); // size remains the same for overwrite

        m.set('b', 3);
        assert.equal(1, m.size()); // size remains the same for eviction
    });
    QUnit.test('size1-set/get', assert => {
        const m = new LRUMap(1);
        m.set('a', 1);
        assert.equal(1, m.get('a'));

        m.set('a', 2);
        assert.equal(2, m.get('a')); // overwrite & readback

        m.set('b', 3);
        assert.equal(undefined, m.get('a')); // must be evicted
        assert.equal(3, m.get('b')); // new entry
    });
    QUnit.test('size2-set/size', assert => {
        const m = new LRUMap(2);
        assert.equal(0, m.size());

        m.set('a', 1);
        assert.equal(1, m.size()); // size increases
        m.set('a', 2);
        assert.equal(1, m.size()); // size remains the same for overwrite

        m.set('b', 3);
        assert.equal(2, m.size()); // size increases
        m.set('b', 4);
        assert.equal(2, m.size()); // size remains the same for overwrite

        m.set('c', 5);
        assert.equal(2, m.size()); // size remains the same for eviction
    });
    QUnit.test('size2-set-recency', assert => {
        const m = new LRUMap(2);
        m.set('a', 1);
        m.set('b', 2);
        // recency is: b > a
        m.set('c', 3);
        assert.equal(undefined, m.get('a')); // a must be evicted
    });
    QUnit.test('size2-set/get-recency', assert => {
        const m = new LRUMap(2);
        m.set('a', 1);
        m.set('b', 2);
        m.get('a');
        m.get('b');
        // recency is: b > a
        m.set('c', 3);
        assert.equal(undefined, m.get('a')); // a must be evicted
    });
    QUnit.test('size3-mixed-recency', assert => {
        const m = new LRUMap(3);
        m.set('a', 1);
        m.set('b', 2);
        m.set('c', 3);
        m.get('b');
        m.set('a', 4);
        m.get('c');
        // recency is: c > a > b
        m.set('d', 5);
        assert.equal(undefined, m.get('b')); // b must be evicted
        // recency is: d > c > a
        m.set('e', 6);
        assert.equal(undefined, m.get('a')); // a must be evicted
    });
});