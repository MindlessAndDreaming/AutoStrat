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

agenda.define("Do Work", async (job) => {
    try {
        QiDao.work();
    } catch (error) {
        console.log(error);
    }
});

(async function () {
    // IIFE to give access to async/await
    await agenda.start();
    await agenda.every("10 minutes", "Do Work");
})();