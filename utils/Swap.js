const Utils = require('./Utils');

require('dotenv').config();

class Swap {
    constructor (w3, utils) {
        this.w3 = w3;
        this.utils = utils;
        this.workerAddress = process.env.WORKER_ADDRESS;
    }
    static quickswapRouter ="0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
    static maticMai ="0xa3fa99a148fa48d14ed51d610c367c61876997f1";
    static maticUsdc ="0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    
    static paths = {
        "0xD6DF932A45C0f255f85145f286eA0b292B21C90B" : {
            router: this.quickswapRouter,
            path: [
                "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", // matic aave
                "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // matic weth 
                this.maticUsdc, 
                this.maticMai
            ]
        },
        "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" : {
            router: this.quickswapRouter,
            path: [
                "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // matic weth 
                this.maticUsdc, 
                this.maticMai
            ]
        }
    }

    callSwap(
        swapRouterAddress, 
        tokensToSwap,
        tokenAddress,
        minimumReceived,
        pathArray,
    ){
         var swapApprovalCall = this.utils.maker("approve",["address", "uint256"],[swapRouterAddress, tokensToSwap]);
         var approval = { Data:swapApprovalCall, To:tokenAddress};

         var swapCall = this.utils.maker(
             "swapExactTokensForTokens",
             ["uint256", "uint256", "address[]", "address", "uint256"],
             [tokensToSwap, minimumReceived, pathArray, this.workerAddress, Math.floor(Date.now() / 1000) + 600  ]
         );
         var swap = { Data:swapCall, To:swapRouterAddress };
         return [approval, swap];
    }
}

module.exports = Swap;