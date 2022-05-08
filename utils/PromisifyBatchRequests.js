class PromisifyBatchRequest {
    constructor(w3) {
        this.w3 = w3;
        this.batch = new w3.BatchRequest;
        this.requests = [];
    }
    add(_request, ...params) {
        let that = this;
        let request = new Promise((resolve, reject) => {
            that.batch.add(_request.call(null, ...params, async (err, data) => {
                if (err) {
                    console.log(err);
                    return reject(err)
                };

                let transactionReceipt = null
                while (transactionReceipt == null) {
                    transactionReceipt = await new that.w3.eth.getTransactionReceipt(data);
                    await sleep(2500);
                }
                
                resolve(transactionReceipt);
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