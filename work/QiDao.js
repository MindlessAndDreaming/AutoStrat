"use strict";

const Swap = require("../utils/Swap.js");
const Cam = require("../work/Cam.js");
const Queue = require("../utils/Queue.js");
const Utils = require("../utils/Utils.js");

const data = require("../static/data.json");
const vaultABI = require("../static/Vault/abi.json");

const { ethers } = require('ethers');

class QiDao {
    static vaults = data.vaults; 

    constructor (w3, utils, swap) {
        this.w3 = w3;
        this.utils = utils;
        this.swap = swap;
        this.cam = new Cam(w3, utils);
    }

    async vaultInfo (vaultAddress, vaultId, { high = 177, low = 166 } = {}) {
        var vault = new this.w3.eth.Contract(vaultABI, vaultAddress);
        var debt = await vault.methods.vaultDebt(vaultId).call();
        var cdr = await vault.methods.checkCollateralPercentage(vaultId).call();
        var perc_diff;
        if (ethers.BigNumber.from(cdr).gt(high)) {
            perc_diff  = ethers.BigNumber.from(high).sub(cdr);
        } else if (ethers.BigNumber.from(cdr).add(2).lt(low)) {
            perc_diff  = ethers.BigNumber.from(cdr).sub(low);
        } else {
            perc_diff = ethers.BigNumber.from(0);
        }

        var diff = perc_diff.mul(debt).div(cdr);
        return diff;
    } 

    async maintain() {
        // wait for the batch to be built

        for(let i = 0; i < QiDao.vaults.length; i++) {
            var vault = QiDao.vaults[i];
            var diff = await this.vaultInfo(vault.address, vault.id);
            
            var maiAmt = ethers.BigNumber.from(diff);
            if (maiAmt.lt(0)) {
                console.log(vault);
                await this.sellCollateralForMai(vault, diff);
            } else if (maiAmt.gt(0)) {
                await this.borrowMai(vault, diff);
            }
        }

        this.utils.execute();
    }

    async getPriceSourceDecimals (vaultInstance) {
        try {
            return await vaultInstance.methods.collateralDecimals().call();
        } catch (error) {
            try {
                return await vaultInstance.methods.priceSourceDecimals().call();
            } catch (error) {
                return 8;
            }
        }  
    }

    async sellCollateralForMai(vault, uMaiAmt) {
        var maiAmt = uMaiAmt.abs();
        // withdraw collateral from vault
        var vaultInstance = new this.w3.eth.Contract(vaultABI, vault.address);
        // calculate how much collateral we need to withdraw
        var priceDecimals = await this.getPriceSourceDecimals(vaultInstance);
        var maiPerToken = await vaultInstance.methods.getEthPriceSource().call();

        var totalCollateralAmt = await vaultInstance.methods.vaultCollateral(vault.id).call();
        var totalDebt = await vaultInstance.methods.vaultDebt(vault.id).call();
        var payableCollateralAmt = maiAmt.mul(ethers.BigNumber.from(10).pow(priceDecimals)).div(maiPerToken);
        

        // get withdrawable collateral
        var minCDR = await vaultInstance.methods._minimumCollateralPercentage().call();
        var collateralAddress =  await vaultInstance.methods.collateral().call();
        var debtValueInCollateral = ethers.BigNumber.from(totalDebt).mul(ethers.BigNumber.from(10).pow(priceDecimals)).div(maiPerToken)
        var minCollateralAmt = debtValueInCollateral.mul(ethers.BigNumber.from(minCDR).add(4)).div(100);
        
        var collateralToWithdraw; 

        if(ethers.BigNumber.from(totalCollateralAmt).sub(payableCollateralAmt).lt(minCollateralAmt)) {
            collateralToWithdraw =  ethers.BigNumber.from(totalCollateralAmt).sub(minCollateralAmt);
            maiAmt = collateralToWithdraw.mul(ethers.BigNumber.from(10).pow(priceDecimals)).div(maiPerToken)
        } else {
            collateralToWithdraw =  payableCollateralAmt;
        }
        
        var info = await this.process(vault.vaultType)(collateralAddress, collateralToWithdraw);
        
        console.log(info.quantity.toString())
        console.log(maiAmt.toString())
        
        
        var queue = new Queue();
        // give the worker permission and ask the worker to take the vault
        queue.add(await this.utils.provideERC721ForTransaction(vault.address, vault.id));
        
        // withdraw collateral from the vault
        queue.add(this.queueWithdrawCollateral(vault.address, vault.id, collateralToWithdraw));
        
        if (vault.vaultType !== "single") {
            // free collateral for swapping
            queue.add(this.toUnderlying(vault.vaultType)(collateralAddress, collateralToWithdraw, info));            
        }

        //swap base collateral for mai
        queue.add(this.swap.callSwap(
            Swap.paths[info.info.UnderlyingAssetAddress].router, 
            info.quantity,
            info.info.UnderlyingAssetAddress,
            maiAmt.mul(95).div(100),
            Swap.paths[info.info.UnderlyingAssetAddress].path,
         ));

        // use received mai to payback loan
        queue.add(this.queuePayback(
            vault.id,
            vault.address,
            maiAmt.mul(95).div(100),
            await vaultInstance.methods.mai().call()
        ));

        //return vault
        queue.add(this.utils.returnERC721ToUser(vault.address, vault.id));
        return await this.utils.addWorkerCalls(queue.q);
    }

    async getBaseInfo(collateralAddress, collateralToWithdraw) {
        return {
            info: {
                underlyingAssetAddress: collateralAddress,
            },
            quantity : collateralToWithdraw
        }
    }

    process(vaultType) {
        const processors = {
            "single" : this.getBaseinfo,
            "camvault" : this.cam.getBaseInfo.bind(this.cam)
        }

        return processors[vaultType];
    }

    toUnderlying(vaultType) {
        const processors = {
            "camvault" : this.cam.toUnderlying.bind(this.cam)
        }

        return processors[vaultType];
    }



    async borrowMai(vault, amt) {
        
    }

    queueWithdrawCollateral(vaultAddress , vaultId, quantity) {
        var withdrawForSaleCall = this.utils.maker("withdrawCollateral",["uint256", "uint256"],[vaultId, quantity]);
        return [ {Data:withdrawForSaleCall, To:vaultAddress} ];
    }

    queuePayback(vaultId, vaultAddress, quantity, maiAddress) {
        var payBackApprovalCall = this.utils.maker("approve",["address", "uint256"],[vaultAddress, quantity]);
        var approval = { Data:payBackApprovalCall, To:maiAddress };

        var payBackCall = this.utils.maker("payBackToken",["uint256", "uint256"],[vaultId, quantity]);
        var payback = { Data:payBackCall, To:vaultAddress };
        
        return [ approval, payback ];
    }
}


module.exports = QiDao;