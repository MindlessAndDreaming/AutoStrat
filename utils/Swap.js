const Utils = require('./Utils');

require('dotenv').config();

class Swap {
    constructor (w3, utils) {
        this.w3 = w3;
        this.utils = utils;
    }

    static quickswapRouter ="0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
    static sushiRouter ="0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
    static spookyRouter ="0xF491e7B69E4244ad4002BC14e878a34207E38c29";
    
    static maticMai ="0xa3fa99a148fa48d14ed51d610c367c61876997f1";
    static maticUsdc ="0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    
    static ftmMai ="0xfB98B335551a418cD0737375a2ea0ded62Ea213b";
    static ftmUsdc ="0x04068DA6C83AFCFA0e13ba15A6696662335D5B75";
    
    static paths = {
        "0xD6DF932A45C0f255f85145f286eA0b292B21C90B" : { // matic aave
            router: this.quickswapRouter,
            path: [
                "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", // matic aave
                "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // matic weth 
                this.maticUsdc, 
                this.maticMai
            ]
        },
        "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" : { //matic weth
            router: this.quickswapRouter,
            path: [
                "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // matic weth 
                this.maticUsdc, 
                this.maticMai
            ]
        },
        "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" : { //wmatic
            router: this.quickswapRouter,
            path: [
                "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // wmatic 
                this.maticUsdc, 
                this.maticMai
            ]
        },
        "0x1a3acf6D19267E2d3e7f898f42803e90C9219062" : {//fxs
            router: this.sushiRouter,
            path: [
                "0x1a3acf6D19267E2d3e7f898f42803e90C9219062", // fxs
                this.maticUsdc,
                this.maticMai 
            ]
        },
        "0xd6070ae98b8069de6B494332d1A1a81B6179D960" : { // ftm bifi
            router: this.spookyRouter,
            path: [
                "0xd6070ae98b8069de6B494332d1A1a81B6179D960", // ftm bifi
                "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", // wftm
                this.ftmUsdc,
                this.ftmMai 
            ]
        },
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
             [tokensToSwap, minimumReceived, pathArray, this.utils.workerAddress, Math.floor(Date.now() / 1000) + 600  ]
         );
         var swap = { Data:swapCall, To:swapRouterAddress };
         return [approval, swap];
    }
}

module.exports = Swap;