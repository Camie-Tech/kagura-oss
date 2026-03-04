import type { EventEmitter } from '@kagura-run/core'

export function createConsoleEventEmitter(): EventEmitter {
  return {
    emit(event) {
      const type = event?.type
      const data = event?.data

      if (type === 'step') {
        const phase = data?.phase as string | undefined
        const idx = (data?.stepIndex as number | undefined) ?? 0
        const total = (data?.totalSteps as number | undefined) ?? 0
        const desc = data?.description as string | undefined
        if (phase === 'started') {
          // eslint-disable-next-line no-console
          console.log(`[kagura] step ${idx + 1}/${total} started: ${desc || ''}`)
        } else if (phase === 'completed') {
          // eslint-disable-next-line no-console
          console.log(`[kagura] step ${idx + 1}/${total} completed`)
        }
        return
      }

      if (type === 'status') {
        const phase = data?.phase as string | undefined
        if (phase === 'started') {
          // eslint-disable-next-line no-console
          console.log(`[kagura] run started: ${String(data?.runId || '')}`)
        } else if (phase === 'iteration_started') {
          // eslint-disable-next-line no-console
          console.log(`[kagura] iteration started`) 
        }
        return
      }

      if (type === 'pause') {
        // eslint-disable-next-line no-console
        console.log(`[kagura] run paused: ${String(data?.message || '')}`)
        return
      }

      if (type === 'completed') {
        // eslint-disable-next-line no-console
        console.log(`[kagura] run completed: ${String(data?.status || '')}`)
        return
      }

      if (type === 'screenshot') {
        // eslint-disable-next-line no-console
        console.log(`[kagura] screenshot: ${data?.screenshotUrl}`)
        return
      }

      if (type === 'error') {
        // eslint-disable-next-line no-console
        console.error(`[kagura] error: ${data?.message}`)
        return
      }

      // fallback
      // eslint-disable-next-line no-console
      console.log(`[kagura] event ${String(type)}:`, data)
    },
  }
}
