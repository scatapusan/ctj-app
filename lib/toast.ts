import { toast as sonnerToast, type ExternalToast } from "sonner"

type ToastAction = {
  label: string
  onClick: () => void
}

type ToastOptions = {
  description?: string
  action?: ToastAction
  duration?: number
}

function build(opts?: ToastOptions): ExternalToast | undefined {
  if (!opts) return undefined
  return {
    description: opts.description,
    duration: opts.duration,
    action: opts.action
      ? { label: opts.action.label, onClick: opts.action.onClick }
      : undefined,
  }
}

export const toast = {
  success(message: string, opts?: ToastOptions) {
    sonnerToast.success(message, build(opts))
  },
  error(message: string, opts?: ToastOptions) {
    sonnerToast.error(message, build(opts))
  },
  warning(message: string, opts?: ToastOptions) {
    sonnerToast.warning(message, build(opts))
  },
  info(message: string, opts?: ToastOptions) {
    sonnerToast(message, build(opts))
  },
}
