import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Board {
  id: string;
  name: string;
}

interface EventLinkPickerProps {
  bookingId: string;
  currentEventTitle: string | null | undefined;
}

export default function EventLinkPicker({ bookingId, currentEventTitle }: EventLinkPickerProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: boards = [] } = useQuery<Board[]>({
    queryKey: ["/api/boards"],
    retry: false,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
        setNewName("");
        setError("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (showCreate) inputRef.current?.focus();
  }, [showCreate]);

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["/api/customer/bookings"] }),
      qc.invalidateQueries({ queryKey: [`/api/customer/bookings/${bookingId}`] }),
      qc.invalidateQueries({ queryKey: ["/api/boards"] }),
    ]);

  const linkMutation = useMutation({
    mutationFn: async (customerEventTitle: string) => {
      const res = await apiRequest("PATCH", `/api/customer/bookings/${bookingId}/event`, {
        customerEventTitle,
      });
      return res.json();
    },
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
      setShowCreate(false);
      setNewName("");
      setError("");
    },
    onError: () => setError("Failed to link event. Try again."),
  });

  const createAndLinkMutation = useMutation({
    mutationFn: async (name: string) => {
      // Create the planning board so the booking appears under an event section
      const boardRes = await apiRequest("POST", "/api/boards", { name });
      await boardRes.json();
      // Tag the booking with the new event name
      const patchRes = await apiRequest("PATCH", `/api/customer/bookings/${bookingId}/event`, {
        customerEventTitle: name,
      });
      return patchRes.json();
    },
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
      setShowCreate(false);
      setNewName("");
      setError("");
    },
    onError: () => setError("Failed to create event. Try again."),
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/customer/bookings/${bookingId}/event`, {
        unlink: true,
      });
      return res.json();
    },
    onSuccess: async () => {
      await invalidate();
    },
    onError: () => setError("Failed to unlink. Try again."),
  });

  const isPending =
    linkMutation.isPending || createAndLinkMutation.isPending || unlinkMutation.isPending;

  function handleSelectBoard(board: Board) {
    setError("");
    linkMutation.mutate(board.name);
  }

  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed.length > 120) {
      setError("Event name must be 120 characters or fewer.");
      return;
    }
    setError("");
    createAndLinkMutation.mutate(trimmed);
  }

  return (
    <div className="relative inline-flex items-center gap-2 flex-wrap">
      {/* Current event display + change/unlink */}
      {currentEventTitle ? (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              setShowCreate(false);
              setError("");
            }}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(74,106,125,0.3)] px-3 py-1 text-xs font-medium text-[#4a6a7d] transition hover:bg-[rgba(74,106,125,0.08)] disabled:opacity-50"
          >
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span className="max-w-[140px] truncate">{currentEventTitle}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
          <button
            type="button"
            onClick={() => unlinkMutation.mutate()}
            disabled={isPending}
            aria-label="Remove from event"
            className="inline-flex items-center gap-1 rounded-full border border-[rgba(74,106,125,0.2)] px-2 py-1 text-xs text-[#4a6a7d]/60 transition hover:border-red-300 hover:text-red-400 disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            Remove
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setShowCreate(false);
            setError("");
          }}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[rgba(74,106,125,0.35)] px-3 py-1 text-xs font-medium text-[#4a6a7d]/70 transition hover:border-[rgba(74,106,125,0.6)] hover:text-[#4a6a7d] disabled:opacity-50"
        >
          <CalendarDays className="h-3 w-3" />
          Link to event
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-2xl border border-[rgba(74,106,125,0.18)] bg-white shadow-xl"
        >
          <p className="border-b border-[rgba(74,106,125,0.1)] px-3.5 py-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[#4a6a7d]">
            {currentEventTitle ? "Move to event" : "Link to event"}
          </p>

          {isPending ? (
            <p className="px-3.5 py-3 text-sm text-[#4a6a7d]/60">Saving…</p>
          ) : (
            <>
              {boards.length > 0 ? (
                <ul className="max-h-44 overflow-y-auto py-1">
                  {boards.map((board) => (
                    <li key={board.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectBoard(board)}
                        className={`flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm transition hover:bg-[rgba(74,106,125,0.07)] ${
                          board.name.toLowerCase() === currentEventTitle?.toLowerCase()
                            ? "font-semibold text-[#2a3a42]"
                            : "text-[#4a6a7d]"
                        }`}
                      >
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="truncate">{board.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !showCreate ? (
                <p className="px-3.5 py-2.5 text-sm text-[#4a6a7d]/60">No events yet.</p>
              ) : null}

              {/* Create new event */}
              {showCreate ? (
                <div className="border-t border-[rgba(74,106,125,0.1)] p-3 space-y-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") {
                        setShowCreate(false);
                        setNewName("");
                        setError("");
                      }
                    }}
                    placeholder="Event name"
                    maxLength={120}
                    className="w-full rounded-lg border border-[rgba(74,106,125,0.25)] bg-white px-3 py-1.5 text-sm text-[#2a3a42] placeholder-[#4a6a7d]/40 outline-none focus:border-[#4a6a7d]/50 focus:ring-1 focus:ring-[rgba(74,106,125,0.2)]"
                  />
                  {error ? (
                    <p className="text-xs text-red-500">{error}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={!newName.trim()}
                      className="flex-1 rounded-full bg-[#4a6a7d] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#3a5a6d] disabled:opacity-40"
                    >
                      Create &amp; link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreate(false);
                        setNewName("");
                        setError("");
                      }}
                      className="rounded-full border border-[rgba(74,106,125,0.25)] px-3 py-1.5 text-xs text-[#4a6a7d] transition hover:bg-[rgba(74,106,125,0.07)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-[rgba(74,106,125,0.1)]">
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm text-[#4a6a7d] transition hover:bg-[rgba(74,106,125,0.07)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New event
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
