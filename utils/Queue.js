class Queue {
    constructor () {
        this.q = []
    }

    add(txList) {
        var newTxLists = [...this.q, ...txList];
        this.q = newTxLists
    }
}


module.exports = Queue;