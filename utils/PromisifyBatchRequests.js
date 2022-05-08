const Web3 = require('web3');

class PromisifyBatchRequest {
    constructor(w3) {
        this.batch = new w3.BatchRequest;
        this.requests = [];
    }
    add(_request, ...params) {
        let that = this;
        let request = new Promise((resolve, reject) => {
            that.batch.add(_request.call(null, ...params, (err, data) => {
                if (err)
                    return reject(err);
                resolve(data);
            }));
        });
        this.requests.push(request);
    }
    async execute() {
        this.batch.execute();
        return await Promise.all(this.requests);
    }
}

module.exports = PromisifyBatchRequest;