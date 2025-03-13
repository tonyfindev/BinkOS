// import fs from 'fs';
// import { v4 as uuidv4 } from 'uuid';
// import { MessageEntity, UUID } from '@binkai/core';

// export class ConversationHistory {
//   private conversations: Record<number, MessageEntity[]> = {}; // chatId -> messages
//   private readonly maxHistoryPerChat = 100;
//   private storageFile = 'conversation_history.json';

//   constructor() {
//     this.loadFromDisk();
//   }

//   addUserMessage(chatId: number, content: string, userId?: string): UUID {
//     if (!this.conversations[chatId]) {
//       this.conversations[chatId] = [];
//     }

//     const messageId = uuidv4();
//     const threadId = this.getThreadId(chatId);

//     const message: MessageEntity = {
//       id: messageId,
//       content,
//       message_type: 'human',
//       user_id: userId as UUID,
//       thread_id: threadId,
//       metadata: {
//         telegram_chat_id: chatId,
//         timestamp: Date.now(),
//       },
//     };

//     this.conversations[chatId].push(message);
//     this._trimHistory(chatId);
//     this.saveToDisk();

//     return messageId;
//   }

//   addAIResponse(chatId: number, content: string): UUID {
//     if (!this.conversations[chatId]) {
//       this.conversations[chatId] = [];
//     }

//     const messageId = uuidv4();
//     const threadId = this.getThreadId(chatId);

//     const message: MessageEntity = {
//       id: messageId,
//       content,
//       message_type: 'ai',
//       thread_id: threadId,
//       metadata: {
//         telegram_chat_id: chatId,
//         timestamp: Date.now(),
//       },
//     };

//     this.conversations[chatId].push(message);
//     this._trimHistory(chatId);
//     this.saveToDisk();

//     return messageId;
//   }

//   private getThreadId(chatId: number): UUID {
//     if (this.conversations[chatId] && this.conversations[chatId].length > 0) {
//       const threadId = this.conversations[chatId][0].thread_id;
//       if (threadId) return threadId;
//     }

//     return uuidv4() as UUID;
//   }

//   private _trimHistory(chatId: number): void {
//     if (this.conversations[chatId].length > this.maxHistoryPerChat) {
//       this.conversations[chatId] = this.conversations[chatId].slice(-this.maxHistoryPerChat);
//     }
//   }

//   getConversationHistory(chatId: number, limit = 10): MessageEntity[] {
//     if (!this.conversations[chatId]) return [];
//     return this.conversations[chatId].slice(-limit);
//   }

//   private saveToDisk(): void {
//     try {
//       fs.writeFileSync(this.storageFile, JSON.stringify(this.conversations));
//     } catch (error) {
//       console.error('Failed to save conversation history:', error);
//     }
//   }

//   private loadFromDisk(): void {
//     try {
//       if (fs.existsSync(this.storageFile)) {
//         const data = fs.readFileSync(this.storageFile, 'utf8');
//         this.conversations = JSON.parse(data);
//       }
//     } catch (error) {
//       console.error('Failed to load conversation history:', error);
//     }
//   }

//   clearConversationHistory(chatId: number): void {
//     if (this.conversations[chatId]) {
//       this.conversations[chatId] = [];
//       this.saveToDisk();
//     }
//   }
// }
