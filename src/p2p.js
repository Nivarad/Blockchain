const topology = require("fully-connected-topology");
const { Blockchain, Transaction } = require("./blockchain");
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");
const mempPoolJSON = require("./transactions.json");
const fs = require("fs");
const { fileURLToPath } = require("url");
const blockChain = new Blockchain();
const { stdin, exit, argv } = process;
const { log } = console;
const { me, peers } = extractPeersAndMyPort();
const sockets = {};
var doOnce = false;
log("---------------------");
log("me - ", me);
log("peers - ", peers);
log("connecting to peers...");

const myIp = toLocalIp(me);
const peerIps = getPeerIps(peers);
let myWalletAddress;

// Init private keys for all nodes
let nodePrivateKeys = new Map();
nodePrivateKeys.set(
  "1000",
  "1f8b805f18072e4208f0db82be10434f7bcab3e1bcea0bde0695b4dc37c35bbc"
);
nodePrivateKeys.set(
  "2000",
  "eb202c3fa25792e9d5c805b82cd3cbaa5aeacc063a12d27a3a18c04065e8ac3d"
);
nodePrivateKeys.set(
  "3000",
  "875e4c78d8cfcd06b4a07d7e11c7504f6ab608472eb5849cd3eadc383706b6c2"
);

//connect to peers
topology(myIp, peerIps).on("connection", (socket, peerIp) => {
  
  const myPort = extractPortFromIp(myIp);
  const peerPort = extractPortFromIp(peerIp);
  const myKey = ec.keyFromPrivate(nodePrivateKeys.get(myPort));
  myWalletAddress = myKey.getPublic("hex");

  if (!doOnce && myPort == "1000") {
    // mining some empty blocks to generate coins into the the blockchain - 800 coins overall
    for (let index = 0; index < 40; index++) {
      blockChain.minePendingTransactions(myWalletAddress);
    }
    // Add first transactions from MemPool
    const jsonString = fs.readFileSync("./transactions.JSON");
    const jsonParsed = JSON.parse(jsonString);
    const transactionsArr = jsonParsed.transactionsArray;
    //create a transaction for all transactions in memepool (Json string)
    for (let i = 0; i < transactionsArr.length; i = i +4) {
      for (let j = i; j <= i + 3; j++) {
        
        const txn = transactionsArr[j];
        if(txn!=undefined){
            const transaction = new Transaction(txn.fromAddress, txn.toAddress, txn.amount);
            transaction.setSignature(txn.signature);
            transaction.setDate(txn.timestamp);
            blockChain.addTransaction(transaction);
          }
      
      }
      blockChain.minePendingTransactions(myWalletAddress);
    }
    blockChain.minePendingTransactions(myWalletAddress);
    blockChain.minePendingTransactions(myWalletAddress);
    doOnce = true;
    //start mining every 7 seconds
    const myTimeout = setTimeout(function () {
      const wallet = myWalletAddress;
           const miningInterval = setInterval(() => {
             blockChain.minePendingTransactions(myWalletAddress);
             writeLengthToFile(blockChain.chain.length);
          }, 7000);
     }, 3000);
    // write blockchain.length into file length.txt
    writeLengthToFile(blockChain.chain.length);

    

    
  }
 
  log('connected to - ', peerPort);
  sockets[peerPort] = socket;
  //Stream of data from the terminal 
  stdin.on('data', (data) => {
    const message = data.toString().trim();
    //exit command in terminal
    if (message === 'exit') {
      log('Exiting channel...');
      exit(0);
    }
    
    const receiverPeer = extractReceiverPeer(message);
    if (sockets[receiverPeer]) {
      if (peerPort === receiverPeer) {
        amount = extractMessageToSpecificPeer(message);
        // calculating transaction fee - Burned coins sent to "burned address"
        //console.log(blockChain.chain.length);
        let lengthFile = readLength();
        
        //console.log(lengthFile);
        const transFEE = 1 * lengthFile;
      
        // miner fee for transaction urgency 
        const minerFee = 1;
        //total amount of coins that will be transacted 
        const totalAmount =
          parseInt(transFEE) + parseInt(minerFee) + parseInt(amount);
        
        // If wallet have enough money to send, and pay for fees

        log(
          `You will pay a total of ${totalAmount} on this transaction burnFee=${transFEE} minerFee=${minerFee} , transaction will be filled only if you have money , if not only miner fee will be deducted from wallet`);

        // Notify receiver that somebody sent him money (money will be at his disposal only after mining the transaction)
        sockets[receiverPeer].write(formatMessage(amount));
        // Initiate transaction for peer
        const transaction = new Transaction(
          myWalletAddress,
          ec.keyFromPrivate(nodePrivateKeys.get(receiverPeer)).getPublic("hex"),
          parseInt(amount)
        );

        // construct transaction for burning -  by sending them to "Burning Address"
        const burnTransaction = new Transaction(
          myWalletAddress,
          "Burning Address",
          transFEE
        );

        // construct transaction for miners fee
        const minerFeeTransaction = new Transaction(
          myWalletAddress,
          ec.keyFromPrivate(nodePrivateKeys.get("1000")).getPublic("hex"),
          minerFee
        );

        // Sign transactions with your private key
        transaction.signTransaction(myKey);
        burnTransaction.signTransaction(myKey);
        minerFeeTransaction.signTransaction(myKey);
        
       //If transaction is not from full node - Send transaction to the Full node As JSON object (1000)  
        if (myPort != 1000) {
          
          let arr = [];
          arr.push(transaction);
          arr.push(burnTransaction);
          arr.push(minerFeeTransaction);
          sockets[1000].write(JSON.stringify(arr));
        }
        // The full node itself made a transaction
        else {
          
            blockChain.addTransaction(transaction);
            blockChain.addTransaction(burnTransaction);
            blockChain.addTransaction(minerFeeTransaction);
         
        }
      }
    } else {
      /* 
                Only miner can mine or check balances of other wallets
            */      
      if (peerPort == "2000"&& myPort == "1000") {
        // Making sure it happens only once!
        if (message == "mine")
          blockChain.minePendingTransactions(myWalletAddress);
          writeLengthToFile(blockChain.chain.length);
        // Write in the miner's console "coins +(peerPrt)" and it will return the wallets balance. (For example "coins 2000")
        if (message.startsWith("coins")) {
          walletToCheck = sliceWalletToCheck(message);
          console.log(
            `This wallet has ${blockChain.getBalanceOfAddress(
              ec
                .keyFromPrivate(nodePrivateKeys.get(walletToCheck))
                .getPublic("hex")
            )} coins !`
          );
        }
        
           //transaction can be checked if found on the blockchain with the command in terminal "check tx" +signature      
        if (message.startsWith("check tx")) {
          signatureToCheck = sliceSignatureToCheck(message);
          //console.log(signatureToCheck);
          blockChain.findTransactionInBlockChain(signatureToCheck);
        }
        
        //command on terminal "total coins" will check amount of coins on the blockchain - burned coins not included        
        if (message.startsWith("total coins")) {
          let total = blockChain.minedCoins() - blockChain.burnedCoins();
          log(`Total coins in Blockchain = ${total}`);
        }
        
         //command on terminal "total burned coins" will check amount of burned coins on the blockchain that was send to burn address
        if (message.startsWith("total burned coins")) {
          let total = blockChain.burnedCoins();
          log(`Total burned coins in Blockchain = ${total}`);
        }
        /*
                 If you want to check how many mined coins are in blockChain, write on the Full node's console "total mined coins"
                */
        if (message.startsWith("total mined coins")) {
          let total = blockChain.minedCoins();
          log(`Total mined coins in Blockchain = ${total}`);
        }
        
      }
    }
  });
  socket.on("data", (data) => {
    const message = data.toString().trim();
    // If message from peers starts with "{" & I'm a miner, than its a JSON data representing an array of transaction that will be added to the blockchain
    // The else & if is making sure it happends only once
    if (peerPort == "2000"&& myPort == "1000") {
      addAndCheckTransactions(message, data);
    } else if (peerPort == "3000"&& myPort == "1000") {
      addAndCheckTransactions(message, data);
    }
    // Notify the reciver that he received some coins (this is a pending transaction and will update on mine)
    if (!message.startsWith("{") && !message.startsWith("["))
      log(data.toString("utf8"));
  });
});

function addAndCheckTransactions(message, data) {
  if (message.startsWith('{') || message.startsWith('[')) {
    const parsedData = JSON.parse(data);
    let transactionArr = [];
    let totalAmountForTnx = 0;
    parsedData.forEach((txn) => {
      const transaction = new Transaction(
        txn.fromAddress,
        txn.toAddress,
        txn.amount
      );
      transaction.setSignature(txn.signature);
      transaction.setDate(txn.timestamp);
      transactionArr.push(transaction);
      totalAmountForTnx += parseInt(txn.amount);
    });

    let walletToCheck = transactionArr[0].fromAddress;

    // Check if the buyer wallet has enough money for transaction
    let totalCoinsForWallet = blockChain.getBalanceOfAddress(walletToCheck);
    let pendingBalance = 0;
    blockChain.pendingTransactions.forEach((pTx) => {
      if (pTx.fromAddress == walletToCheck) pendingBalance += pTx.amount;
    });
    let totalAfterMining = totalCoinsForWallet - pendingBalance;
    if (totalAfterMining < totalAmountForTnx) {
      log(
        `Transaction of wallet ${walletToCheck} was declined! err = NOT ENOUGH MONEY`
      );
    }
    // if wallet has enough coins than transaction will be filled - if not only the miner transaction will be filled for confirming it
    else {
      transactionArr.forEach((transaction) => {
        blockChain.addTransaction(transaction);
      });
    }
  }
}

//extract ports from process arguments, {me: first_port, peers: rest... }
function extractPeersAndMyPort() {
  return {
    me: argv[2],
    peers: argv.slice(3, argv.length),
  };
}

//'4000' -> '127.0.0.1:4000'
function toLocalIp(port) {
  return `127.0.0.1:${port}`;
}

//['4000', '1000'] -> ['127.0.0.1:4000', '127.0.0.1:1000']
function getPeerIps(peers) {
  return peers.map((peer) => toLocalIp(peer));
}

//'hello' -> 'myPort:hello'
function formatMessage(message) {
  return `${message} coins sent to you from - > ${me}`;
}

//'127.0.0.1:4000' -> '4000'
function extractPortFromIp(peer) {
  return peer.toString().slice(peer.length - 4, peer.length);
}

//'4000>hello' -> '4000'
function extractReceiverPeer(message) {
  return message.slice(0, 4);
}
function sliceWalletToCheck(message) {
  return message.slice(6, message.length);
}
function sliceSignatureToCheck(message) {
  return message.slice(9, message.length);
}
//'4000>hello' -> 'hello'
function extractMessageToSpecificPeer(message) {
  return message.slice(5, message.length);
}
function writeLengthToFile(content) {
  fs.writeFileSync('./length.txt', ''+content, err => {
      if (err) {
        console.error(err)
      return
  }
  //file written successfully
})
}

function readLength() {
  //console.log(fs.readFileSync('./length.txt'));
  return Number(fs.readFileSync('./length.txt'));
}

