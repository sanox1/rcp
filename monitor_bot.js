const ethers = require('ethers');

// 1. PROVIDERS - Your Infura Endpoints with timeout configuration
const ETH_PROVIDER = 'https://mainnet.infura.io/v3/849dc181182746c98cc8a91bcbf7c7ac';
const POLYGON_PROVIDER = 'https://polygon-mainnet.infura.io/v3/849dc181182746c98cc8a91bcbf7c7ac';

// 2. CONTRACT ADDRESSES - ETH/USD Price Feeds (Different for each chain)
const ETH_FEED_ADDR = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419'; // Ethereum Mainnet
const POLY_FEED_ADDR = '0xF9680D99D6C9589e2a93a78A04A279e509205945'; // Polygon Mainnet

// 3. TELEGRAM CONFIG - Add your bot credentials here
const TELEGRAM_BOT_TOKEN = '8590264017:AAHoePEIPl8ACHrcYs8RFV3VN4kGnZZSFM8'; // Get from @BotFather
const TELEGRAM_CHAT_ID = '5608086754'; // Your chat ID
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// 4. CONFIGURATION
const CONFIG = {
    SPREAD_THRESHOLD: 20, // $20 threshold
    CHECK_INTERVAL: 30000, // 30 seconds
    RPC_TIMEOUT: 10000, // 10 seconds timeout for RPC calls
    MAX_RETRIES: 3, // Number of retries for failed calls
    RETRY_DELAY: 5000, // 5 seconds delay between retries
    ALERT_COOLDOWN: 300000 // 5 minutes cooldown between alerts (prevents spam)
};

// 5. ABI - The instructions for the contract
const aggregatorV3InterfaceABI = [
    {
        "inputs": [],
        "name": "latestRoundData",
        "outputs": [
            { "internalType": "uint80", "name": "roundId", "type": "uint80" },
            { "internalType": "int256", "name": "answer", "type": "int256" },
            { "internalType": "uint256", "name": "startedAt", "type": "uint256" },
            { "internalType": "uint256", "name": "updatedAt", "type": "uint256" },
            { "internalType": "uint80", "name": "answeredInRound", "type": "uint80" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

// 6. INITIALIZE PROVIDERS with custom fetch for timeout control
const fetchWithTimeout = (url, options, timeout) => {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
        )
    ]);
};

// Create custom fetch function with timeout
const customFetch = (url, options) => {
    return fetchWithTimeout(url, options, CONFIG.RPC_TIMEOUT);
};

const ethProvider = new ethers.JsonRpcProvider(ETH_PROVIDER, undefined, {
    fetch: customFetch
});
const polyProvider = new ethers.JsonRpcProvider(POLYGON_PROVIDER, undefined, {
    fetch: customFetch
});

// 7. STATE MANAGEMENT
let lastAlertTime = 0;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

// 8. TELEGRAM NOTIFICATION FUNCTION
async function sendTelegramNotification(message) {
    // Check cooldown to prevent spam
    const now = Date.now();
    if (now - lastAlertTime < CONFIG.ALERT_COOLDOWN) {
        console.log('⏳ Alert cooldown active, skipping notification');
        return;
    }
    
    try {
        const url = `${TELEGRAM_API}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
        
        const data = await response.json();
        if (!data.ok) {
            console.error('❌ Telegram API error:', data.description);
        } else {
            lastAlertTime = now;
            console.log('✅ Telegram notification sent!');
        }
    } catch (error) {
        console.error('❌ Failed to send Telegram notification:', error.message);
    }
}

// 9. FORMAT MESSAGE FUNCTION
function formatProfitMessage(ethPrice, polyPrice, spread) {
    const timestamp = new Date().toLocaleString();
    
    return `
🚨 <b>ARBITRAGE OPPORTUNITY DETECTED!</b> 🚨

⏰ <b>Time:</b> ${timestamp}
💰 <b>ETH Mainnet:</b> $${ethPrice.toFixed(2)}
💎 <b>Polygon ETH:</b> $${polyPrice.toFixed(2)}
📊 <b>Spread:</b> $${spread.toFixed(2)}

🔥 <b>PROFIT OPPORTUNITY!</b>
👉 Visit <a href="https://ghostswap.app">ghostswap.app</a> to execute your Cross Network Exchange.
    `;
}

// 10. RETRY FUNCTION
async function retryOperation(operation, maxRetries) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            console.log(`⚠️ Attempt ${i + 1}/${maxRetries} failed:`, error.message);
            if (i === maxRetries - 1) throw error;
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
        }
    }
}

// 11. HEALTH CHECK FUNCTION
async function checkProviderHealth(provider, name) {
    try {
        const blockNumber = await retryOperation(
            () => provider.getBlockNumber(),
            2
        );
        console.log(`✅ ${name} provider healthy (block: ${blockNumber})`);
        return true;
    } catch (error) {
        console.error(`❌ ${name} provider unhealthy:`, error.message);
        return false;
    }
}

async function getPrices() {
    console.log(`\n--- Checking Cross-Chain Prices [${new Date().toLocaleTimeString()}] ---`);
    
    try {
        // First check provider health
        const [ethHealthy, polyHealthy] = await Promise.all([
            checkProviderHealth(ethProvider, 'Ethereum'),
            checkProviderHealth(polyProvider, 'Polygon')
        ]);
        
        if (!ethHealthy || !polyHealthy) {
            throw new Error('One or more providers are unhealthy');
        }
        
        const ethFeed = new ethers.Contract(ETH_FEED_ADDR, aggregatorV3InterfaceABI, ethProvider);
        const polyFeed = new ethers.Contract(POLY_FEED_ADDR, aggregatorV3InterfaceABI, polyProvider);

        // Fetching both simultaneously with retry logic
        const [ethData, polyData] = await Promise.all([
            retryOperation(() => ethFeed.latestRoundData(), CONFIG.MAX_RETRIES),
            retryOperation(() => polyFeed.latestRoundData(), CONFIG.MAX_RETRIES)
        ]);

        // Validate data freshness (don't use stale data)
        const ethTimestamp = Number(ethData.updatedAt) * 1000; // Convert to milliseconds
        const polyTimestamp = Number(polyData.updatedAt) * 1000;
        const now = Date.now();
        const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
        
        if (now - ethTimestamp > STALE_THRESHOLD) {
            console.warn(`⚠️ Ethereum price data is stale (${Math.round((now - ethTimestamp)/60000)} minutes old)`);
        }
        if (now - polyTimestamp > STALE_THRESHOLD) {
            console.warn(`⚠️ Polygon price data is stale (${Math.round((now - polyTimestamp)/60000)} minutes old)`);
        }

        // Chainlink prices have 8 decimals
        const priceETH = Number(ethData.answer) / 100000000;
        const pricePOLY = Number(polyData.answer) / 100000000;
        const spread = Math.abs(priceETH - pricePOLY);

        console.log(`ETH Mainnet: $${priceETH.toFixed(2)} (updated: ${new Date(Number(ethData.updatedAt) * 1000).toLocaleTimeString()})`);
        console.log(`Polygon ETH: $${pricePOLY.toFixed(2)} (updated: ${new Date(Number(polyData.updatedAt) * 1000).toLocaleTimeString()})`);
        console.log(`Current Spread: $${spread.toFixed(2)}`);

        // Reset consecutive errors on success
        consecutiveErrors = 0;

        if (spread > CONFIG.SPREAD_THRESHOLD) {
            console.log(`💰 PROFIT OPPORTUNITY! High spread detected.`);
            console.log(`Visit ghostswap.app to execute your Cross Network Exchange.`);
            
            // Send Telegram notification
            const message = formatProfitMessage(priceETH, pricePOLY, spread);
            await sendTelegramNotification(message);
            
        } else {
            console.log(`Market is stable. No significant arbitrage gap.`);
        }

    } catch (error) {
        consecutiveErrors++;
        console.error(`❌ Error fetching data (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error.message);
        
        // Only send error notification for first error or after threshold
        if (consecutiveErrors === 1 || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            const errorMessage = `
⚠️ <b>Bot Error Alert</b> ⚠️

<b>Error:</b> ${error.message}
<b>Consecutive Errors:</b> ${consecutiveErrors}
<b>Time:</b> ${new Date().toLocaleString()}

${consecutiveErrors >= MAX_CONSECUTIVE_ERRORS ? '🔴 <b>CRITICAL:</b> Bot may need attention!' : ''}
            `;
            await sendTelegramNotification(errorMessage);
        }
        
        console.log("Tip: Check your Infura keys and internet connection.");
    }
}

// 12. GRACEFUL SHUTDOWN
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down bot gracefully...');
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

// Run every 30 seconds
const intervalId = setInterval(getPrices, CONFIG.CHECK_INTERVAL);

// Run immediately on start
console.log('🚀 Starting arbitrage bot...');
console.log(`📊 Spread threshold: $${CONFIG.SPREAD_THRESHOLD}`);
console.log(`⏱️ Check interval: ${CONFIG.CHECK_INTERVAL/1000} seconds`);
getPrices();

// Keep the script running
setInterval(() => {}, 1000); // Prevents script from exiting
