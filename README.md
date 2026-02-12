monitor_bot.js is a crypto arbitrage telegram bot that you can run with node.js and ethers (type npm install ethers after you've installed node.js).
It spots price difference between ETH on etherium and polygon chains. Edit spread > 20 if you want to win at least 20$ when the bot spots such a difference.

- Create a Telegram bot via @BotFather to get a bot token
- Get your chat ID (you can message your bot and use https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates)
  "chat": {
    "id": THIS IS IT,
    "first_name": "somename",
    "username": "someuser",
    "type": "private"
}
-start the script with 'node monitor_bot.js'
