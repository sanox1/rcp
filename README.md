monitor_bot.js is a crypto arbitrage script that you can run with node.js and ethers (type npm install ethers after you've installed node.js).  It spots price difference between ETH on etherium and polygon chains. It sends notification to a bot you created in telegram. Edit spread > 20 if you want to win at least 20$ when the bot spots such a difference.

1.Create a Telegram bot via @BotFather to get a bot token
2.Get your chat ID (you can message your bot and use https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates) "chat": { "id": THIS IS IT, "first_name": "somename", "username": "someuser", "type": "private" } 
3.Start the script with 'node monitor_bot.js'
