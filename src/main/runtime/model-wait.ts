import { AsyncLocalStorage } from 'node:async_hooks';

type ModelWait = <T>(request: () => Promise<T>) => Promise<T>;
export type ModelWaitScope = { wait?: ModelWait };

// Only a host RPC dispatch installs this context. Model text and tool
// arguments cannot acquire or extend a wait interval.
const modelWait = new AsyncLocalStorage<ModelWaitScope>();

export function withModelRequestWait<T>(request: () => Promise<T>): Promise<T> {
  const wait = modelWait.getStore()?.wait;
  // Existing source-change listeners may schedule a later independent job.
  // Such a timer cannot keep borrowing an RPC that has already ended. Its
  // own caller signal, provider deadline and source checks still apply.
  return wait ? wait(request) : request();
}

export function runWithModelRequestWait<T>(scope: ModelWaitScope, dispatch: () => Promise<T>): Promise<T> {
  return modelWait.run(scope, dispatch);
}
