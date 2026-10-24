import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StudyFocusRef } from '../shared/study-presentation';

export interface StudyComposerAnchor {
  sessionId: string;
  messageId?: string;
  boundaryKey: string;
  focus: StudyFocusRef;
  label?: string;
  onRefresh?: () => unknown | Promise<unknown>;
}
interface ComposerDockTarget extends StudyComposerAnchor {
  key: string;
  identity: string;
  element: HTMLDivElement;
  visible: boolean;
}
interface ComposerDockContextValue {
  activeKey?: string;
  referenceFocus?: StudyFocusRef;
  register: (target: ComposerDockTarget) => () => void;
  visibility: (key: string, visible: boolean) => void;
  activate: (key: string) => void;
}
export const ConversationComposerDockContext = createContext<ComposerDockContextValue | undefined>(undefined);

/** A renderer address for the one real composer. It carries no question,
 * answer, saved draft, source permission or independent submission path. */
export function useConversationComposerDock(scope: {
  sessionId?: string; boundaryKey: string; enabled: boolean; latestAssistantMessageId?: string;
  referenceFocus?: StudyFocusRef;
  onRelease?: (element: HTMLDivElement) => void;
  onActivate?: () => void;
}) {
  const targets = useRef(new Map<string, ComposerDockTarget>());
  const onRelease = useRef(scope.onRelease); onRelease.current = scope.onRelease;
  const onActivate = useRef(scope.onActivate); onActivate.current = scope.onActivate;
  const [revision, changed] = useState(0);
  const [requestedKey, request] = useState<string>();
  const [dismissedKey, dismiss] = useState<string>();
  const [dismissedReference, dismissReference] = useState<string>();
  const referenceKey = (focus: StudyFocusRef) => `${scope.sessionId}/${scope.boundaryKey}/${focus.studyId}@${focus.studyRevision}`;
  useLayoutEffect(() => {
    if (!scope.referenceFocus) return;
    // A newly read explicit reference can return to a previously put-aside
    // paper. The same unchanged reference cannot undo a later user dismissal.
    dismiss(undefined); dismissReference(undefined); request(undefined);
  }, [scope.referenceFocus]);
  const register = useCallback((target: ComposerDockTarget) => {
    targets.current.set(target.key, target); changed(value => value + 1);
    return () => {
      if (targets.current.get(target.key) !== target) return;
      onRelease.current?.(target.element);
      targets.current.delete(target.key); changed(value => value + 1);
    };
  }, []);
  const visibility = useCallback((key: string, visible: boolean) => {
    const target = targets.current.get(key);
    if (!target || target.visible === visible) return;
    target.visible = visible; changed(value => value + 1);
  }, []);
  const activate = useCallback((key: string) => {
    onActivate.current?.();
    dismiss(undefined); dismissReference(undefined); request(targets.current.get(key)?.identity);
    requestAnimationFrame(() => targets.current.get(key)?.element.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true }));
  }, []);
  const target = useMemo(() => {
    if (!scope.enabled) return undefined;
    const eligible = [...targets.current.values()].filter(value => value.visible && value.element.isConnected
      && value.sessionId === scope.sessionId && value.boundaryKey === scope.boundaryKey
      && referenceKey(value.focus) !== dismissedReference);
    const reference = scope.referenceFocus;
    const referenced = reference && eligible.find(value => value.identity !== dismissedKey
      && value.focus.studyId === reference.studyId && value.focus.studyRevision === reference.studyRevision
      && value.focus.sceneId === reference.sceneId && value.focus.sceneRevision === reference.sceneRevision);
    return eligible.find(value => value.identity === requestedKey && value.identity !== dismissedKey)
      || referenced || (reference ? undefined : eligible.filter(value => value.messageId === scope.latestAssistantMessageId && value.identity !== dismissedKey).at(-1));
  }, [scope.sessionId, scope.boundaryKey, scope.enabled, scope.latestAssistantMessageId, scope.referenceFocus, requestedKey, dismissedKey, dismissedReference, revision]);
  const returnToChat = useCallback((focus?: StudyFocusRef) => {
    if (target) dismiss(target.identity);
    const reference = focus || target?.focus || scope.referenceFocus;
    if (reference) dismissReference(referenceKey(reference));
    request(undefined);
  }, [target, scope.sessionId, scope.boundaryKey, scope.referenceFocus]);
  const refreshStudy = useCallback(async (studyId: string) => {
    const current = [...targets.current.values()].find(value => value.focus.studyId === studyId
      && value.sessionId === scope.sessionId && value.boundaryKey === scope.boundaryKey);
    await current?.onRefresh?.();
  }, [scope.sessionId, scope.boundaryKey]);
  const value = useMemo(() => ({ activeKey: target?.key, referenceFocus: scope.referenceFocus, register, visibility, activate }),
    [target?.key, scope.referenceFocus, register, visibility, activate]);
  return { target, returnToChat, refreshStudy, value };
}

/** Only a freshly read, currently visible study paper offers a place to write.
 * App moves its existing DOM host here; this slot never owns a second editor. */
export function StudyComposerSlot({ enabled = true, ...anchor }: StudyComposerAnchor & { enabled?: boolean }) {
  const context = useContext(ConversationComposerDockContext);
  const slot = useRef<HTMLDivElement>(null);
  const key = `${anchor.sessionId}/${anchor.messageId || ''}/${anchor.boundaryKey}/${JSON.stringify(anchor.focus)}`;
  const identity = `${anchor.sessionId}/${anchor.messageId || ''}/${anchor.boundaryKey}/${anchor.focus.studyId}`;
  const active = context?.activeKey === key;
  const { register, visibility } = context || {};
  useLayoutEffect(() => {
    if (!enabled || !slot.current || !register || !visibility) return;
    const target: ComposerDockTarget = { ...anchor, key, identity, element: slot.current, visible: false };
    const remove = register(target);
    const paper = slot.current.closest('.study-desk') || slot.current;
    if (typeof IntersectionObserver === 'undefined') visibility(key, true);
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      visibility(key, entries.some(entry => entry.isIntersecting));
    }, { rootMargin: '0px' });
    observer?.observe(paper);
    return () => { observer?.disconnect(); remove(); };
  }, [enabled, key, register, visibility]);
  if (!context || !enabled) return null;
  return <div className={`study-composer-place${active ? ' is-writing' : ''}`}>
    {!active && <button type="button" className="text-button" onClick={() => context.activate(key)}>在这一页接着写</button>}
    <div ref={slot} className="study-composer-slot" />
  </div>;
}
