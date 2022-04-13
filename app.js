"use strict";

require('dotenv').config();

const QiDao = require("./work/QiDao.js");
const Swap = require("./utils/Swap.js");
const Utils = require("./utils/Utils.js");

const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const Agenda = require("agenda");

const mongoConnectionString = "mongodb://127.0.0.1/agenda";

const agenda = new Agenda({ db: { address: mongoConnectionString } });

agenda.defaultConcurrency(1);

agenda.define("Work QiDao Vaults B", async (job) => {
    try {
        
        const api_url = process.env.ALCHEMY_POLYGON_ACCESS_URL; 
        const w3 = createAlchemyWeb3(api_url);
        const utils = new Utils(w3);
        const swap = new Swap(w3, utils);
        await utils.getStarterNonce();

        var qidao = new QiDao(w3, utils, swap);
        qidao.maintain();   
    } catch (error) {
        console.log(error);
    }
});

(async function () {
    // IIFE to give access to async/await
    await agenda.start();
    await agenda.every("10 minutes", "Work QiDao Vaults B");
})();