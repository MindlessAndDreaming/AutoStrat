
require('dotenv').config();
const { ethers } = require('ethers');
const workerABI = require("../static/Worker/abi.json");
const ierc721EABI = require("../static/IERC721E/abi.json");
const ierc20EABI = require("../static/IERC20E/abi.json");

class Utils {
    constructor (w3) {
        this.w3 = w3;
        this.nonce = -1;
        this.gasPrice = ethers.utils.parseUnits("50", "gwei");
        this.gasLimit = w3.utils.toHex('1111111');
        this.queue = [];
        this.batch = null;
        this.workerAddress = process.env.WORKER_ADDRESS;
        this.wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC); 
    }

    async getStarterNonce() {
        this.nonce = await this.w3.eth.getTransactionCount(this.wallet.address);
    }

    maker(functionName, argTypesArray, argsArray) {
        var functionInputs = [];
        for(let i=0; i<argTypesArray.length; i++){
            functionInputs.push({
                type: argTypesArray[i],
                name: ""
            });
        }
        var encodedFunctionCall = this.w3.eth.abi.encodeFunctionCall({
            name: functionName,
            type: 'function',
            inputs: functionInputs,
        }, argsArray);

        return encodedFunctionCall;
    }

    async addLocalCall(ContractMethod, recipient) {
        this.initBatch();
        var request = await this.signRequest(ContractMethod, recipient); 
        this.batch.add(request);
    }

    queueWorkerCall(Data, To) {
        this.queue.push({ To, Data });
    }

    async signRequest(ContractMethod, recipient) {

        var tx = {
            nonce: this.nonce,
            from: this.wallet.address,
            to: recipient,
            gasPrice: this.gasPrice,
            gas: 1111111,
            data: ContractMethod.encodeABI()
        };
        
        const signedTx = await this.w3.eth.accounts.signTransaction(tx, this.wallet.privateKey);
        console.log(this.nonce);
        this.nonce += 1;
        return this.w3.eth.sendSignedTransaction.request(signedTx.rawTransaction, "receipt", console.log ); 
    }

    async addWorkerCalls(transactionList) {
        this.initBatch();
        if(transactionList.length > 0){
            var Worker = new this.w3.eth.Contract(workerABI, this.workerAddress);
            var method = Worker.methods.execute(transactionList);
            var request = await this.signRequest(method, this.workerAddress);

            this.batch.add(request);
        }
        return this.batch;
    }

    async execute() {
        try {
            if (this.batch !== null) this.batch.execute();
        } catch (error) {
            console.log(error)
        }
    }

    initBatch(){
        if(this.batch === null ){
            this.batch = new this.w3.BatchRequest();
        }
    }

    async provideERC721ForTransaction(erc721Address, erc721Id){
        var ERC721 = new this.w3.eth.Contract(ierc721EABI, erc721Address);
        var erc721approval = ERC721.methods.approve(this.workerAddress, erc721Id);
        await this.addLocalCall(erc721approval, erc721Address);

        var encodedFunctionCall = this.maker( "safeTransferFrom", ["address", "address", "uint256"], [this.wallet.address, this.workerAddress, erc721Id]);
        return [{ Data: encodedFunctionCall, To: erc721Address }];
    }

    returnERC721ToUser(erc721Address, erc721Id) {
        var transferCall = this.maker("transferFrom",["address", "address", "uint256"],[this.workerAddress, this.wallet.address, erc721Id]);
        return [{ Data:transferCall,  To:erc721Address}];
    }

    sendERC20ToUser(erc20Address, quantity) {
        var transferCall = this.maker("transfer",["address", "uint256"],[this.wallet.address, quantity]);
        return [{ Data:transferCall,  To:erc20Address}];
    }


}

module.exports = Utils;