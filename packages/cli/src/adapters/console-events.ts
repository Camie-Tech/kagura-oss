import type { EventEmitter } from '@kagura-run/core'

export function createConsoleEventEmitter(): EventEmitter {
  return {
    emit(event) {
      const type = event?.type
      const data = event?.data

      if (type === 'step') {
        const phase = data?.phase
        const idx = data?.stepIndex
        const total = data?.totalSteps
        const desc = data?.description
        if (phase === 'started') {
          // eslint-disable-next-line no-console
          console.log(`[kagura] step ${idx + 1}/${total} started: ${desc}`)
        } else if (phase === 'completed') {
          // eslint-disable-next-line no-console
          console.log(`[kagura] step ${idx + 1}/${total} completed`) 
        }
        return
      }

      if (type === 'run') {
        const phase = data?.phase
        if (phase === 'started') {
          // eslint-disable-next-line no-console
          console.log(`[kagura] run started: ${data?.runId}`)
        } else if (phase === 'paused') {
          // eslint-disable-next-line no-console
          console.log(`[kagura] run paused: ${data?.message}`)
        } else if (phase === 'completed') {
          // eslint-disable-next-line no-console
          console.log(`[kagura] run completed: ${data?.status || ''}`)
        }
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
