'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { extractErrorMessage } from './error-message'

export interface UseApiMutationOptions<TArgs, TResult> {
  mutationFn: (args: TArgs) => Promise<TResult>
  successMessage?: string | ((result: TResult, args: TArgs) => string | undefined) | null
  errorMessage?: string | ((err: unknown) => string)
  loadingMessage?: string
  onSuccess?: (result: TResult, args: TArgs) => void | Promise<void>
  onError?: (err: unknown) => void
  silent?: boolean
}

export interface UseApiMutationResult<TArgs, TResult> {
  mutate: (args: TArgs) => Promise<TResult | undefined>
  mutateAsync: (args: TArgs) => Promise<TResult>
  isPending: boolean
  error: unknown
  reset: () => void
}

export function useApiMutation<TArgs = void, TResult = unknown>(
  options: UseApiMutationOptions<TArgs, TResult>,
): UseApiMutationResult<TArgs, TResult> {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const mountedRef = useRef(true)
  const optsRef = useRef(options)
  optsRef.current = options

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    if (mountedRef.current) {
      setError(null)
      setIsPending(false)
    }
  }, [])

  const run = useCallback(async (args: TArgs): Promise<TResult> => {
    const opts = optsRef.current
    if (mountedRef.current) {
      setIsPending(true)
      setError(null)
    }
    let toastId: string | number | undefined
    if (opts.loadingMessage && !opts.silent) {
      toastId = toast.loading(opts.loadingMessage)
    }
    try {
      const result = await opts.mutationFn(args)
      if (opts.onSuccess) {
        await opts.onSuccess(result, args)
      }
      if (!opts.silent) {
        const msg =
          typeof opts.successMessage === 'function'
            ? opts.successMessage(result, args)
            : opts.successMessage
        if (msg) {
          if (toastId !== undefined) toast.success(msg, { id: toastId })
          else toast.success(msg)
        } else if (toastId !== undefined) {
          toast.dismiss(toastId)
        }
      } else if (toastId !== undefined) {
        toast.dismiss(toastId)
      }
      return result
    } catch (err) {
      if (mountedRef.current) setError(err)
      if (!opts.silent) {
        const msg =
          typeof opts.errorMessage === 'function'
            ? opts.errorMessage(err)
            : (opts.errorMessage ?? extractErrorMessage(err))
        if (toastId !== undefined) toast.error(msg, { id: toastId })
        else toast.error(msg)
      } else if (toastId !== undefined) {
        toast.dismiss(toastId)
      }
      opts.onError?.(err)
      throw err
    } finally {
      if (mountedRef.current) setIsPending(false)
    }
  }, [])

  const mutate = useCallback(
    async (args: TArgs): Promise<TResult | undefined> => {
      try {
        return await run(args)
      } catch {
        return undefined
      }
    },
    [run],
  )

  const mutateAsync = useCallback((args: TArgs) => run(args), [run])

  return { mutate, mutateAsync, isPending, error, reset }
}
