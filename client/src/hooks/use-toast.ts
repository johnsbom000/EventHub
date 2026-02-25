import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toFriendlyErrorText(text: string): string {
  let cleaned = text.trim();
  if (!cleaned) return "Something went wrong. Please try again.";

  // Remove technical prefixes and status-code noise.
  cleaned = cleaned.replace(/^\s*\d{3}\s*:\s*/g, "");
  cleaned = cleaned.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+\/\S+\s+failed:\s*/i, "");

  // Keep only first line if backend returned stack/trace text.
  const firstLine = cleaned.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  cleaned = firstLine || cleaned;

  // Unwrap common JSON error wrappers.
  if ((cleaned.startsWith("{") && cleaned.endsWith("}")) || (cleaned.startsWith("[") && cleaned.endsWith("]"))) {
    try {
      const parsed = JSON.parse(cleaned);
      const extracted =
        (typeof parsed?.error === "string" && parsed.error) ||
        (typeof parsed?.message === "string" && parsed.message) ||
        "";
      if (extracted) cleaned = extracted.trim();
    } catch {
      // ignore parse failure
    }
  }

  const lower = cleaned.toLowerCase();

  if (/unauthorized|forbidden|\b401\b|\b403\b/.test(lower)) {
    return "Please sign in and try again.";
  }

  const failedToMatch = cleaned.match(/^failed to\s+(.+)$/i);
  if (failedToMatch?.[1]) {
    const action = failedToMatch[1].replace(/[.]+$/g, "").trim();
    if (action) return `We couldn't ${action}. Please try again.`;
  }

  const looksTechnical =
    /\b(api|status|exception|stack|undefined|null|json|syntaxerror|typeerror|referenceerror|networkerror)\b/i.test(
      cleaned
    ) ||
    /\b\d{3}\b/.test(cleaned) ||
    /\/api\//i.test(cleaned) ||
    cleaned.length > 180;

  if (looksTechnical) {
    return "Something went wrong. Please try again.";
  }

  return cleaned;
}

function sanitizeToastContent<T extends { title?: React.ReactNode; description?: React.ReactNode; variant?: ToastProps["variant"] }>(
  input: T
): T {
  if (input.variant !== "destructive") return input;

  let nextTitle = input.title;
  let nextDescription = input.description;

  if (typeof input.title === "string") {
    const lowerTitle = input.title.toLowerCase().trim();
    if (/unauthorized|forbidden|\b401\b|\b403\b/.test(lowerTitle)) {
      nextTitle = "Please sign in";
    } else if (/error|exception/.test(lowerTitle)) {
      nextTitle = "Something went wrong";
    } else if (lowerTitle.startsWith("failed to ")) {
      const action = input.title.slice("Failed to ".length).trim().replace(/[.]+$/g, "");
      nextTitle = action ? `Couldn't ${action}` : "Something went wrong";
    }
  }

  if (typeof input.description === "string") {
    nextDescription = toFriendlyErrorText(input.description);
  }

  return {
    ...input,
    title: nextTitle,
    description: nextDescription,
  };
}

function toast({ ...props }: Toast) {
  const id = genId()
  const sanitizedProps = sanitizeToastContent(props)

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...sanitizeToastContent(props), id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...sanitizedProps,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
