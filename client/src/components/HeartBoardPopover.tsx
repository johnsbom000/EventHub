import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface BoardWithMembership {
  id: string;
  name: string;
  savedCount: number;
  hasSaved: boolean;
}

/**
 * Pinterest-style popover anchored below/above its trigger.
 * Wrap the trigger + this component in a `relative` container.
 * The popover closes when the user clicks outside it.
 */
export default function HeartBoardPopover({
  listingId,
  onClose,
}: {
  listingId: string;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  useEffect(() => {
    if (showCreate) inputRef.current?.focus();
  }, [showCreate]);

  const { data: boards = [], isLoading } = useQuery<BoardWithMembership[]>({
    queryKey: [`/api/boards/for-listing/${listingId}`],
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/boards/for-listing/${listingId}`] });
    qc.invalidateQueries({ queryKey: ["/api/boards/saved-ids"] });
    qc.invalidateQueries({ queryKey: ["/api/boards"] });
    boards.forEach((b) =>
      qc.invalidateQueries({ queryKey: [`/api/boards/${b.id}/listings`] }),
    );
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ boardId, hasSaved }: { boardId: string; hasSaved: boolean }) => {
      if (hasSaved) {
        await apiRequest("DELETE", `/api/boards/${boardId}/listings/${listingId}`);
      } else {
        await apiRequest("POST", `/api/boards/${boardId}/listings`, { listingId });
      }
    },
    onSuccess: invalidate,
  });

  const createAndSaveMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/boards", { name });
      const board = await res.json();
      await apiRequest("POST", `/api/boards/${board.id}/listings`, { listingId });
    },
    onSuccess: () => {
      invalidate();
      setNewName("");
      setShowCreate(false);
    },
  });

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-[rgba(74,106,125,0.18)] bg-white shadow-xl dark:bg-[#22303c]"
    >
      <p className="border-b border-[rgba(74,106,125,0.1)] px-3.5 py-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[#4a6a7d]">
        Save to event
      </p>

      {isLoading ? (
        <p className="px-3.5 py-3 text-sm text-[#4a6a7d]/60">Loading…</p>
      ) : boards.length === 0 && !showCreate ? (
        <p className="px-3.5 py-3 text-sm text-[#4a6a7d]/60">No events yet</p>
      ) : (
        <ul className="max-h-44 overflow-y-auto py-1">
          {boards.map((board) => (
            <li key={board.id}>
              <button
                type="button"
                onClick={() =>
                  toggleMutation.mutate({ boardId: board.id, hasSaved: board.hasSaved })
                }
                disabled={toggleMutation.isPending}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition hover:bg-[rgba(74,106,125,0.07)] disabled:opacity-60"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    board.hasSaved
                      ? "border-[#e07a6a] bg-[#e07a6a]"
                      : "border-[rgba(74,106,125,0.35)]"
                  }`}
                >
                  {board.hasSaved && <Check className="h-2.5 w-2.5 text-white" />}
                </span>
                <span className="truncate text-[#2a3a42] dark:text-[#f5f0e8]">
                  {board.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCreate ? (
        <div className="border-t border-[rgba(74,106,125,0.1)] px-3 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim())
                createAndSaveMutation.mutate(newName.trim());
              if (e.key === "Escape") setShowCreate(false);
            }}
            placeholder="Event name"
            maxLength={120}
            className="w-full rounded-lg border border-[rgba(74,106,125,0.24)] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[#e07a6a] dark:text-[#f5f0e8]"
          />
          <button
            type="button"
            onClick={() => {
              if (newName.trim()) createAndSaveMutation.mutate(newName.trim());
            }}
            disabled={!newName.trim() || createAndSaveMutation.isPending}
            className="mt-2 w-full rounded-lg bg-[#e07a6a] py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Create &amp; save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex w-full items-center gap-2.5 border-t border-[rgba(74,106,125,0.1)] px-3.5 py-2.5 text-sm font-medium text-[#e07a6a] transition hover:bg-[rgba(224,122,106,0.06)]"
        >
          <Plus className="h-3.5 w-3.5" />
          New event
        </button>
      )}
    </div>
  );
}
