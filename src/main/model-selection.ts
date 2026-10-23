import { DeepSeekClient } from './provider';
import { AppServerLunaClient } from './luna-provider';
import { withModelRequestWait } from './runtime/model-wait';

export type ModelClient = Pick<DeepSeekClient, 'complete' | 'assistantMessage' | 'invalidateBoundary' | 'providerMetadata'>;
/** Host launch choice only. Saved settings and renderer input cannot select it. */
export const usingLunaTestTransport = () => process.env.ZAICHANG_MODEL_TRANSPORT === 'luna-app-server-test';
/** A launch-only test transport uses the existing account, not a DeepSeek key. */
export const modelTransportReady = (key: string) => usingLunaTestTransport() || !!key;
export function createModelClient(key: string, model: string): ModelClient {
  const client = usingLunaTestTransport() ? new AppServerLunaClient() : new DeepSeekClient(key, model);
  return {
    complete: (...args) => withModelRequestWait(() => client.complete(...args)),
    assistantMessage: result => client.assistantMessage(result),
    invalidateBoundary: () => client.invalidateBoundary(),
    providerMetadata: options => client.providerMetadata(options),
  };
}
