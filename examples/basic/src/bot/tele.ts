// import { settings } from '@binkai/core';
// import { Message } from 'node-telegram-bot-api';

// import { config_agent_with_tools } from './base';
// import { ConversationHistory } from './history';

// // Check TELEGRAM_BOT_TOKEN
// const token = settings.get('TELEGRAM_BOT_TOKEN');
// if (!token) {
//   throw new Error('TELEGRAM_BOT_TOKEN is required');
// }

// // Initialize Telegram bot with options to avoid conflict
// const telegramAPI = require('node-telegram-bot-api');
// const bot = new telegramAPI(token, {
//   polling: true,
//   request: {
//     agentOptions: {
//       keepAlive: true,
//       family: 4,
//     },
//   },
// });

// // Handle polling error
// bot.on('polling_error', (error: any) => {
//   console.error('Polling error:', error);
//   // If encountering conflict error, stop polling and retry after 5 seconds
//   if (error.message.includes('409 Conflict')) {
//     bot.stopPolling();
//     setTimeout(() => {
//       bot.startPolling();
//     }, 5000); // Retry after 5 seconds
//   }
// });

// // Handle when bot stops polling
// bot.on('stop_polling', () => {
//   console.log('Bot stopped polling');
// });

// // Handle when bot starts polling
// bot.on('start_polling', () => {
//   console.log('Bot started polling');
// });

// async function main() {
//   const history = new ConversationHistory();
//   // const chatThreadMap = new Map<number, UUID>();

//   // Handle messages from Telegram
//   bot.on('message', async (msg: Message) => {
//     const chatId = msg.chat.id;
//     const messageText = msg.text;

//     if (!chatId) return;

//     if (!messageText) return;
//     // Base initialization
//     const agent = await config_agent_with_tools();
//     // Check if it's a command already handled by other handlers
//     if (messageText.startsWith('/')) return;

//     try {
//       // Send "typing" indicator
//       bot.sendChatAction(chatId, 'typing');

//       const history_conversation = history.getConversationHistory(chatId);

//       const response = await agent.execute({
//         input: messageText,
//         history: history_conversation,
//       });

//       await bot.sendMessage(chatId, response);
//       history.addUserMessage(msg.message_id, messageText);
//       history.addAIResponse(chatId, response);
//     } catch (error: any) {
//       console.error('❌ Error:', error.message);
//       await bot.sendMessage(chatId, error.message);
//       history.addAIResponse(chatId, error.message);
//     }
//   });

//   // Handle /start command
//   bot.onText(/\/start/, async (msg: Message) => {
//     const chatId = msg.chat.id;
//     await bot.sendMessage(
//       chatId,
//       'Hello! I am BinkAI Bot. I can help you:\n\n' +
//         '1. Interact with blockchain\n' +
//         '2. Perform swap transactions\n' +
//         '3. Answer your questions\n\n' +
//         '*Swap transaction instructions:*\n' +
//         '- To buy tokens: `Buy [amount] [source token] to [destination token] on OkuSwap with [slippage]% slippage on [chain]`\n' +
//         '- Example: `Buy 0.001 BNB to USDC on OkuSwap with 1% slippage on bnb chain`\n\n' +
//         '*Important notes:*\n' +
//         '- OkuSwap only supports swap transactions with a fixed input amount\n' +
//         '- Slippage should be set between 0.5% to 5% to ensure transaction success\n' +
//         '- The amount of tokens should be suitable for your wallet balance\n\n' +
//         '*Supported tokens:*\n' +
//         '- BNB Chain: BNB, USDT, USDC, BUSD, CAKE\n' +
//         '- Ethereum: ETH, USDT, USDC, DAI\n\n' +
//         'Use the /tokens command to view the full list of supported tokens\n' +
//         'Use the /clear command to clear chat history\n\n' +
//         'Please ask me a question or request!',
//       { parse_mode: 'Markdown' },
//     );
//   });

//   // Handle /clear command to delete chat history
//   bot.onText(/\/clear/, async (msg: Message) => {
//     const chatId = msg.chat.id;
//     history.clearConversationHistory(chatId);
//     await bot.sendMessage(chatId, 'Your chat history has been cleared!');
//   });

//   // Handle /help command to provide help information
//   bot.onText(/\/help/, async (msg: Message) => {
//     const chatId = msg.chat.id;
//     await bot.sendMessage(
//       chatId,
//       '*BinkAI Bot usage guide:*\n\n' +
//         '*Available commands:*\n' +
//         '- /start - Start using the bot\n' +
//         '- /tokens - View the list of supported tokens\n' +
//         '- /clear - Clear chat history\n' +
//         '- /status - Check the status of the bot\n' +
//         '- /help - Display this help information\n\n' +
//         '*How to perform swap transactions:*\n' +
//         '1. Syntax: `Buy [amount] [source token] to [destination token] on OkuSwap with [slippage]% slippage on [chain]`\n' +
//         '2. Example: `Buy 0.001 BNB to USDC on OkuSwap with 1% slippage on bnb chain`\n\n' +
//         '*Common error handling:*\n' +
//         '- If the transaction fails, try increasing the slippage (e.g., from 1% to 2-3%)\n' +
//         '- Ensure your wallet balance is sufficient for the transaction\n' +
//         '- Check if the token you want to swap is supported\n\n' +
//         'If you need further assistance, please describe your issue and I will try to help!',
//       { parse_mode: 'Markdown' },
//     );
//   });

//   // Handle /example command to provide examples
//   bot.onText(/\/example/, async (msg: Message) => {
//     const chatId = msg.chat.id;
//     await bot.sendMessage(
//       chatId,
//       '*Examples of using BinkAI Bot:*\n\n' +
//         '*1. Swap transactions on BNB Chain:*\n' +
//         '- `Buy 0.001 BNB to USDC on OkuSwap with 1% slippage on bnb chain`\n' +
//         '- `Buy 10 USDT to CAKE on OkuSwap with 0.5% slippage on bnb chain`\n' +
//         '- `Buy 5 BUSD to BNB on OkuSwap with 2% slippage on bnb chain`\n\n' +
//         '*2. Swap transactions on Ethereum:*\n' +
//         '- `Buy 0.001 ETH to USDC on OkuSwap with 1% slippage on ethereum chain`\n' +
//         '- `Buy 10 USDT to DAI on OkuSwap with 0.5% slippage on ethereum chain`\n\n' +
//         '*3. Token information:*\n' +
//         '- `Give me information about the USDC token on BNB Chain`\n' +
//         '- `What is the address of the CAKE token?`\n\n' +
//         '*4. Blockchain questions:*\n' +
//         '- `What is the current price of BNB?`\n' +
//         '- `How do I create a wallet on BNB Chain?`\n' +
//         '- `Explain slippage in swap transactions`\n\n' +
//         'Try one of the examples above or ask your own question!',
//       { parse_mode: 'Markdown' },
//     );
//   });

//   console.log('🤖 Telegram Bot is running...');
// }

// main().catch(error => {
//   console.error('❌ Error:', error);
//   process.exit(1);
// });
