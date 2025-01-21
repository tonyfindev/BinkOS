import { z } from 'zod';
import { IAgent } from '../types';
import { NetworkName } from '../../network/types';

export function createNetworkSchema(agent: IAgent) {
  const networks = Object.keys(agent.getNetworks());
  return z.enum(networks as [NetworkName, ...NetworkName[]]).describe(
    `The network to interact with (${networks.join(', ')})`
  );
} 