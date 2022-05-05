
require('dotenv').config();
const { ethers } = require('ethers');
const workerABI = require("../static/Worker/abi.json");
const ierc721EABI = require("../static/IERC721E/abi.json");
const ierc20EABI = require("../static/IERC20E/abi.json");

class Utils {
    static getAPIURL(chainId) {
        switch(chainId) {
            case 137:
                return process.env.POLYGON_ACCESS_URL;
            case 250:
                return process.env.FANTOM_ACCESS_URL;
        }
    }

    constructor (w3) {
        this.w3 = w3;
        this.nonce = -1;
        this.gasLimit = w3.utils.toHex('1111111');
        this.queue = [];
        this.batch = null;
        this.wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC); 
    }

    async setStarterNonce() {
        this.nonce = await this.w3.eth.getTransactionCount(this.wallet.address);
    }

    getWorkerAddress() {
        switch(this.chainId) {
            case 137:
                return process.env.WORKER_ADDRESS;
            case 250:
                return process.env.FANTOM_WORKER_ADDRESS;
        }
    }

    async setWorkerAddress() {
        this.workerAddress = this.getWorkerAddress();
    }

    async initialize() {
        this.chainId = await this.w3.eth.getChainId();
        await this.setStarterNonce();
        await this.setWorkerAddress();
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

    sleep(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    async afterTransaction(err, result) {
        if(err){console.log(err)}
        else {console.log("confirmed:", result)}
    }

    async signRequest(ContractMethod, recipient) {

        let gasPrice = ethers.BigNumber.from(await this.w3.eth.getGasPrice()).mul(3).div(2);

        var tx = {
            nonce: this.nonce,
            from: this.wallet.address,
            to: recipient,
            gasPrice,
            gas: 1111111,
            data: ContractMethod.encodeABI()
        };
        
        const signedTx = await this.w3.eth.accounts.signTransaction(tx, this.wallet.privateKey);
        this.nonce += 1;
        return this.w3.eth.sendSignedTransaction.request(signedTx.rawTransaction, this.afterTransaction.bind(this) );
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

    async erc20Info(erc20Address){
        var ERC20 = new this.w3.eth.Contract(ierc20EABI, erc20Address);
        var name;
        var decimals;

        name = await ERC20.methods.name().call();
        decimals = await ERC20.methods.decimals().call();  
        
        
        return { name, decimals} ;
    }

}

module.exports = Utils;