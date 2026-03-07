/**
 * Exploration Events — Event emitter for exploration progress updates
 *
 * Provides typed event handling for exploration progress.
 * Consumers implement EventEmitter adapter (CLI = console, web = SSE).
 */

import type { EventEmitter as CoreEventEmitter, CoreEvent } from '../adapters.js'
import type { ExplorationSiteMap } from '../types.js'

// ── Exploration Event Types ──────────────────────────────────────────────

export type ExplorationEventType =
  | 'exploration_started'
  | 'page_discovered'
  | 'form_discovered'
  | 'flow_detected'
  | 'navigation'
  | 'auth_required'
  | 'exploration_progress'
  | 'exploration_completed'
  | 'exploration_error'

export interface ExplorationEventData {
  explorationId: string
  type: ExplorationEventType
  message?: string
  url?: string
  pageCount?: number
  siteMap?: ExplorationSiteMap
  error?: string
}

// ── Typed Emission Helpers ───────────────────────────────────────────────

function emitExplorationEvent(
  emitter: CoreEventEmitter,
  explorationId: string,
  type: ExplorationEventType,
  data: Partial<ExplorationEventData> = {}
): void {
  const event: CoreEvent = {
    type: 'status',
    timestamp: Date.now(),
    data: {
      phase: type,
      explorationId,
      ...data,
    },
  }
  emitter.emit(event)
}

export function emitExplorationStarted(
  emitter: CoreEventEmitter,
  explorationId: string,
  targetUrl: string
): void {
  emitExplorationEvent(emitter, explorationId, 'exploration_started', {
    url: targetUrl,
    message: `Starting exploration of ${targetUrl}`,
  })
}

export function emitPageDiscovered(
  emitter: CoreEventEmitter,
  explorationId: string,
  url: string,
  pageCount: number
): void {
  emitExplorationEvent(emitter, explorationId, 'page_discovered', {
    url,
    pageCount,
    message: `Discovered page: ${url}`,
  })
}

export function emitFormDiscovered(
  emitter: CoreEventEmitter,
  explorationId: string,
  url: string,
  inputCount: number
): void {
  emitExplorationEvent(emitter, explorationId, 'form_discovered', {
    url,
    message: `Discovered form with ${inputCount} inputs on ${url}`,
  })
}

export function emitFlowDetected(
  emitter: CoreEventEmitter,
  explorationId: string,
  flowName: string
): void {
  emitExplorationEvent(emitter, explorationId, 'flow_detected', {
    message: `Detected flow: ${flowName}`,
  })
}

export function emitAuthRequired(
  emitter: CoreEventEmitter,
  explorationId: string,
  url: string
): void {
  emitExplorationEvent(emitter, explorationId, 'auth_required', {
    url,
    message: `Authentication required at ${url}`,
  })
}

export function emitExplorationProgress(
  emitter: CoreEventEmitter,
  explorationId: string,
  pageCount: number,
  siteMap: ExplorationSiteMap
): void {
  emitExplorationEvent(emitter, explorationId, 'exploration_progress', {
    pageCount,
    siteMap,
    message: `Explored ${pageCount} pages`,
  })
}

export function emitExplorationCompleted(
  emitter: CoreEventEmitter,
  explorationId: string,
  siteMap: ExplorationSiteMap
): void {
  emitExplorationEvent(emitter, explorationId, 'exploration_completed', {
    pageCount: siteMap.pages.length,
    siteMap,
    message: `Exploration completed: ${siteMap.pages.length} pages discovered`,
  })
}

export function emitExplorationError(
  emitter: CoreEventEmitter,
  explorationId: string,
  error: string
): void {
  emitExplorationEvent(emitter, explorationId, 'exploration_error', {
    error,
    message: `Exploration error: ${error}`,
  })
}
