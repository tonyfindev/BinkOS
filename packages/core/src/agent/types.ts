import { IWallet } from '../wallet/types';
import { NetworkName } from '../network/types';
import { BaseMessage } from '@langchain/core/messages';
import { NetworksConfig } from '../network/types';

export interface AgentConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentExecuteParams {
  network: NetworkName;
  input: string;
  history?: BaseMessage[];
}

export interface IAgent {
  execute(params: AgentExecuteParams): Promise<string>;
  getWallet(): IWallet;
  getNetworks(): NetworksConfig['networks'];
} 