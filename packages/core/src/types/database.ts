export type UUID = `${string}-${string}-${string}-${string}-${string}`;

/**
 * Interface for database operations
 */
export interface IDatabaseAdapter {
  /** Database instance */
  db: any;

  /** Optional initialization */
  init(): Promise<void>;

  /** Close database connection */
  close(): Promise<void>;

  createUser(user: UserEntity): Promise<boolean>;

  createAndGetUserByAddress(user: UserEntity): Promise<UserEntity | null>;

  getUserById(userId: UUID): Promise<UserEntity | null>;

  createMessages(messages: MessageEntity[]): Promise<boolean>;

  getMessageById(messageId: UUID): Promise<MessageEntity | null>;

  getMessagesByUserId(userId: UUID, take?: number): Promise<MessageEntity[]>;
}

export interface UserEntity {
  /** Unique identifier */
  id?: UUID;

  /** Display name */
  name?: string;

  /** Username */
  username?: string;

  /** Optional additional details */
  metadata?: { [key: string]: any };

  /** Optional email */
  email?: string;

  /** Optional avatar URL */
  avatarUrl?: string;

  address: string;
}

export interface MessageEntity {
  id?: UUID;
  content: string;
  messageType?: 'human' | 'ai';
  userId?: UUID;
  metadata?: { [key: string]: any };
}

export interface ThreadEntity {
  id?: UUID;
  title?: string;
}
