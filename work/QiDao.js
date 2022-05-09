"use strict";

const Web3 = require('web3');

const Swap = require("../utils/Swap.js");
const Cam = require("../work/Cam.js");
const Moo = require("../work/Moo.js");
const Queue = require("../utils/Queue.js");
const Utils = require("../utils/Utils.js");

const ierc20EABI = require("../static/IERC20E/abi.json");

const data = require("../static/data.json");
const vaultABI = require("../static/Vault/abi.json");

const { ethers } = require('ethers');

class QiDao {
    static vaults = data.vaults; 

    static async work() {
        for(let i = 0; i < QiDao.vaults.length; i++) {
            try {
                var vault = QiDao.vaults[i];
                var api_url = Utils.getAPIURL(vault.chainId);
                
                const w3 = new Web3(new Web3.providers.HttpProvider(api_url));
                const utils = new Utils(w3);
                await utils.initialize();
    
                const swap = new Swap(w3, utils);
                
                var qidao = new QiDao(w3, utils, swap);
                await qidao.initialize();
                await qidao.maintainVault(vault);    
            } catch (error) {
                console.log(error);
            }   
        }
    } 

    constructor (w3, utils, swap) {
        this.w3 = w3;
        this.utils = utils;
        this.swap = swap;
    }

    async initialize() {
        switch(this.utils.chainId) {
            case 137:
                this.cam = new Cam(this.w3, this.utils);
            case 250:
                this.moo = new Moo(this.w3, this.utils);
        }
    }

    async vaultInfo (vault) {
        var vaultContract = new this.w3.eth.Contract(vaultABI, vault.address);
        var debt = await vaultContract.methods.vaultDebt(vault.id).call();
        var cdr = await vaultContract.methods.checkCollateralPercentage(vault.id).call();
        var perc_diff;
        if (ethers.BigNumber.from(cdr).gt(vault.maxCDR)) {
            perc_diff  = ethers.BigNumber.from(cdr).sub(vault.maxCDR);
        } else if (ethers.BigNumber.from(cdr).add(3).lt(vault.minCDR)) {
            perc_diff  = ethers.BigNumber.from(cdr).sub(vault.minCDR);
        } else {
            perc_diff = ethers.BigNumber.from(0);
        }

        var diff = perc_diff.mul(debt).div(cdr);
        return diff;
    } 

    // deprecated
    async maintain() {
        // wait for the batch to be built
        for(let i = 0; i < QiDao.vaults.length; i++) {
            var vault = QiDao.vaults[i];
            var diff = await this.vaultInfo(vault);
             
            var maiAmt = ethers.BigNumber.from(diff);
            
            console.log("working on:", vault.address, vault.id, ethers.utils.formatEther(maiAmt),"MAI");

            if (maiAmt.lt(0)) {
                await this.sellCollateralForMai(vault, diff);
            } else if (maiAmt.gt(0)) {
                await this.borrowMai(vault, diff);
            }
        }

        this.utils.execute();
    }

    async maintainVault(vault) {
        var diff = await this.vaultInfo(vault);
            
        var maiAmt = ethers.BigNumber.from(diff);
        
        console.log("working on:", vault.name, vault.id, ethers.utils.formatEther(maiAmt),"MAI:", new Date().toString());
        
        
        if (maiAmt.lt(0)) {
            await this.sellCollateralForMai(vault, diff);
        } else if (maiAmt.gt(0)) {
            await this.borrowMai(vault, diff);
        }
    
        var txs = await this.utils.execute();
        for(let i=0; i < txs.length; i++) console.log("hash:", txs[i].transactionHash, "status:", txs[i].status);

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
            collateralToWithdraw = ethers.BigNumber.from(totalCollateralAmt).sub(minCollateralAmt);
            console.log(collateralToWithdraw.lt(payableCollateralAmt));
            maiAmt = collateralToWithdraw.mul(ethers.BigNumber.from(10).pow(priceDecimals)).div(maiPerToken)
        } else {
            collateralToWithdraw =  payableCollateralAmt;
        }
        
        var info = await this.process(vault.vaultType)(collateralAddress, collateralToWithdraw);
        var underlyingInfo = await this.utils.erc20Info(info.info.UnderlyingAssetAddress);

        console.log("liquidating:", vault.name, "vault:", ethers.utils.formatUnits(info.quantity, underlyingInfo.decimals), underlyingInfo.name, "for", ethers.utils.formatEther(maiAmt), "MAI")
        
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
                UnderlyingAssetAddress: collateralAddress,
            },
            quantity : collateralToWithdraw
        }
    }

    process(vaultType) {
        const processors = {
            "single" : this.getBaseInfo.bind(this),
            "camvault" : this.cam.getBaseInfo.bind(this.cam),
            "moosingle" : this.moo.getBaseInfo.bind(this.moo)
        }

        return processors[vaultType];
    }

    toUnderlying(vaultType) {
        const processors = {
            "camvault" : this.cam.toUnderlying.bind(this.cam),
            "moosingle" : this.moo.toUnderlying.bind(this.moo)
        }

        return processors[vaultType];
    }



    async borrowMai(vault, amt) {
        var vaultInstance = new this.w3.eth.Contract(vaultABI, vault.address);
        var MaiAddress = await vaultInstance.methods.mai().call();
        var maicontract = new this.w3.eth.Contract(ierc20EABI, MaiAddress);
        var balance = ethers.BigNumber.from(await maicontract.methods.balanceOf(vault.address).call());

        if (balance.sub(1).gt(0)) {
            if(balance.lt(amt)) {
                amt = balance.sub(1)
            }

            console.log("borrowing from:", vault.name, "vault", ethers.utils.formatEther(amt), "MAI")

            var queue = new Queue();
            // give the worker permission and ask the worker to take the vault
            queue.add(await this.utils.provideERC721ForTransaction(vault.address, vault.id));
            // borrowMai
            queue.add(this.queueBorrowMai(vault.address, vault.id, amt));
            //send Mai To The Wallet Address
            queue.add(this.utils.sendERC20ToUser(MaiAddress, amt));
            //return vault
            queue.add(this.utils.returnERC721ToUser(vault.address, vault.id));
            return await this.utils.addWorkerCalls(queue.q); 
        }
    }

    queueWithdrawCollateral(vaultAddress , vaultId, quantity) {
        var withdrawForSaleCall = this.utils.maker("withdrawCollateral",["uint256", "uint256"],[vaultId, quantity]);
        return [ {Data:withdrawForSaleCall, To:vaultAddress} ];
    }

    queueBorrowMai(vaultAddress, vaultId, quantity) {
        var borrowTokenCall = this.utils.maker("borrowToken",["uint256", "uint256"],[vaultId, quantity]);
        return [ {Data:borrowTokenCall, To:vaultAddress} ];
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