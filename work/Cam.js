const { ethers } = require('ethers');

const IATokenABI = require("../static/IAmToken/abi.json");
const ICamTokenABI = require("../static/ICamToken/abi.json");

const Utils = require("../utils/Utils.js");


require('dotenv').config();


class Cam {
    constructor(w3, utils) {
        this.w3 = w3;
        this.utils = utils;
        this.workerAddress = process.env.WORKER_ADDRESS;
    }

    async getBaseInfo (camAddress, camAmt) {
        var info = await this.getUnderlyingInfo(camAddress);
        var quantity  = (await this.getBaseAmt(camAddress, camAmt)).mul(995).div(1000);
        return { info , quantity };
    }

    async getEndInfo (camAddress, baseAmt) {
        var info = await this.getUnderlyingInfo(camAddress);
        var quantity = (await this.getCamAmt(camAddress, baseAmt)).mul(995).div(1000);
        return { info , quantity };
    }

    async getUnderlyingInfo (camTokenAddress) {
        var CamContract = new this.w3.eth.Contract(ICamTokenABI, camTokenAddress);
        var ATokenAddress = await CamContract.methods.Token().call();
        var AContract = new this.w3.eth.Contract(IATokenABI, ATokenAddress);
        var UnderlyingAssetAddress = await AContract.methods.UNDERLYING_ASSET_ADDRESS().call();
        var AaveLendingPoolAddress = await CamContract.methods.LENDING_POOL().call();
        
        return { ATokenAddress, UnderlyingAssetAddress, AaveLendingPoolAddress };
    }

    async getBaseAmt (camTokenAddress, camAmt) {
        var info = await this.getUnderlyingInfo(camTokenAddress);
        var CamContract = new this.w3.eth.Contract(ICamTokenABI, camTokenAddress);
        var AContract = new this.w3.eth.Contract(IATokenABI, info.ATokenAddress);
        
        var CamTokenTotalSupply = await CamContract.methods.totalSupply().call();
        var CamContractBalance = await AContract.methods.balanceOf(camTokenAddress).call();
        
        return ethers.BigNumber.from(camAmt).mul(CamContractBalance).div(CamTokenTotalSupply);
    }

    async getCamAmt (camTokenAddress, baseAmt) {
        var info = await this.getUnderlyingInfo(camTokenAddress);
        var CamContract = new window.w3.eth.Contract(ICamTokenABI, camTokenAddress);
        var AContract = new window.w3.eth.Contract(IATokenABI, info.ATokenAddress);
        
        var CamTokenTotalSupply = await CamContract.methods.totalSupply().call();
        var CamContractBalance = await AContract.methods.balanceOf(camTokenAddress).call();
        
        return ethers.BigNumber.from(camAmt).mul(CamTokenTotalSupply).div(CamContractBalance);
    }

    toUnderlying(camAddress, camAmt, info) {
        var leaveCamTokenContractCall = this.utils.maker("leave",["uint256"],[camAmt]);
        var leaveCAM = {Data:leaveCamTokenContractCall, To:camAddress};

        var leaveATokenContractCall = this.utils.maker("withdraw",["address","uint256","address"],[info.info.UnderlyingAssetAddress, info.quantity, this.workerAddress]);
        var leaveAAVE = {Data:leaveATokenContractCall, To:info.info.AaveLendingPoolAddress};
        
        return [leaveCAM, leaveAAVE];
    }
}

module.exports = Cam;