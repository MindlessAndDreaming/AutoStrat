const { ethers } = require('ethers');

const Ierc20EABI = require("../static/IERC20E/abi.json");

const IMooTokenABI = require("../static/IMooToken/abi.json");
const IMooStrategyABI = require("../static/IMooStrategy/abi.json");

class Moo {
    constructor(w3, utils) {
        this.w3 = w3;
        this.utils = utils;
    }

    async getBaseInfo (mooAddress, mooAmt) {
        var info = await this.getUnderlyingInfo(mooAddress);
        var quantity  = (await this.getBaseAmt(mooAddress, mooAmt)).mul(995).div(1000);
        return { info , quantity };
    }

    async getEndInfo (mooAddress, baseAmt) {
        var info = await this.getUnderlyingInfo(mooAddress);
        var quantity = (await this.getCamAmt(mooAddress, baseAmt)).mul(995).div(1000);
        return { info , quantity };
    }

    async getUnderlyingInfo (MooAddress) {

        var MooContract = new this.w3.eth.Contract(IMooTokenABI, MooAddress);
        var UnderlyingAssetAddress = await MooContract.methods.want().call();
        var StrategyAddress = await MooContract.methods.strategy().call();
        
        return { StrategyAddress, UnderlyingAssetAddress};
    }

    async getBaseAmt (MooAddress, mooAmt) {
        var info = await this.getUnderlyingInfo(MooAddress);
        
        var MooContract = new window.w3.eth.Contract(IMooTokenABI, MooAddress)

        var UnderlyingTokenContract = new window.w3.eth.Contract(Ierc20EABI, info.UnderlyingAssetAddress);
        var StrategyContract = new window.w3.eth.Contract(IMooStrategyABI, info.StrategyAddress);

         
        var underlyingInMooTokenContract = ethers.BigNumber.from(await UnderlyingTokenContract.methods.balanceOf(MooAddress).call());
        var underlyingInMooStrategyContract = ethers.BigNumber.from(await StrategyContract.methods.balanceOf().call());

        var mooTokenTotalSupply = await MooContract.methods.totalSupply().call();
        
        return ethers.BigNumber.from(mooAmt).mul(underlyingInMooTokenContract.add(underlyingInMooStrategyContract)).div(mooTokenTotalSupply);
    }

    async getMooAmt (MooAddress, baseAmt) {
        var info = await this.getUnderlyingInfo(MooAddress);
        
        var MooContract = new window.w3.eth.Contract(IMooTokenABI, MooAddress)

        var UnderlyingTokenContract = new window.w3.eth.Contract(Ierc20EABI, info.UnderlyingAssetAddress);
        var StrategyContract = new window.w3.eth.Contract(IMooStrategyABI, info.StrategyAddress);

         
        var underlyingInMooTokenContract = ethers.BigNumber.from(await UnderlyingTokenContract.methods.balanceOf(MooAddress).call());
        var underlyingInMooStrategyContract = ethers.BigNumber.from(await StrategyContract.methods.balanceOf().call());

        var mooTokenTotalSupply = await MooContract.methods.totalSupply().call();
        
        return ethers.BigNumber.from(baseAmt).mul(mooTokenTotalSupply).div(underlyingInMooTokenContract.add(underlyingInMooStrategyContract));

    }

    toUnderlying(mooAddress, mooAmt, _) {
        
        var leaveMooTokenContractCall = this.maker("withdraw",["uint256"],[mooAmt]);
        var leaveMoo = {Data:leaveMooTokenContractCall, To:mooAddress}
        
        return [leaveMoo];
    }
}

module.exports = Moo;