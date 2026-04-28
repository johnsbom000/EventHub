import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { BookMarked, Plus, Trash2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

interface Board {
  id: string;
  name: string;
  savedCount: number;
  createdAt: string;
}

export default function PlanningBoards() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: boards = [], isLoading } = useQuery<Board[]>({
    queryKey: ["/api/boards"],
    enabled: isAuthenticated,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/boards", { name });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/boards"] });
      setNewName("");
      setShowCreate(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (boardId: string) => {
      await apiRequest("DELETE", `/api/boards/${boardId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/boards"] });
      setDeletingId(null);
    },
  });

  if (!isAuthenticated) {
    return (
      <>
        <Navigation />
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <BookMarked className="h-12 w-12 text-[#4a6a7d]/40" />
          <h1 className="font-heading text-2xl font-semibold text-[#2a3a42]">Your Planning Boards</h1>
          <p className="max-w-sm text-[#4a6a7d]">
            Sign in to save vendor listings to boards and organize your event planning.
          </p>
          <Button
            onClick={() => loginWithRedirect()}
            className="rounded-full bg-[#e07a6a] px-6 text-white hover:bg-[#c9685a]"
          >
            Sign in
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-semibold text-[#2a3a42]">Planning Boards</h1>
            <p className="mt-1 text-[#4a6a7d]">Save listings to boards for each event you're planning.</p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-full bg-[#e07a6a] px-5 text-white hover:bg-[#c9685a]"
          >
            <Plus className="h-4 w-4" />
            New board
          </Button>
        </div>

        {showCreate && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[rgba(74,106,125,0.2)] bg-white p-4 shadow-sm dark:bg-[#22303c]">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim());
                if (e.key === "Escape") { setShowCreate(false); setNewName(""); }
              }}
              placeholder="Board name (e.g. Summer Wedding)"
              maxLength={120}
              className="flex-1 bg-transparent text-[#2a3a42] outline-none placeholder:text-[#4a6a7d]/50 dark:text-[#f5f0e8]"
            />
            <button
              type="button"
              onClick={() => { if (newName.trim()) createMutation.mutate(newName.trim()); }}
              disabled={!newName.trim() || createMutation.isPending}
              className="rounded-full bg-[#e07a6a] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewName(""); }}
              className="text-sm text-[#4a6a7d] hover:text-[#2a3a42]"
            >
              Cancel
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl bg-[rgba(74,106,125,0.08)]"
              />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <BookMarked className="h-10 w-10 text-[#4a6a7d]/30" />
            <p className="text-[#4a6a7d]">No boards yet. Create one to start saving listings.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board) => (
              <div
                key={board.id}
                className="group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-[rgba(74,106,125,0.14)] bg-white p-5 shadow-[0_4px_24px_rgba(74,106,125,0.08)] transition hover:shadow-[0_4px_28px_rgba(74,106,125,0.16)] dark:bg-[#22303c]"
                onClick={() => setLocation(`/boards/${board.id}`)}
              >
                <div>
                  <BookMarked className="mb-3 h-6 w-6 text-[#e07a6a]" />
                  <h2 className="font-heading text-xl font-semibold leading-snug text-[#2a3a42] dark:text-[#f5f0e8]">
                    {board.name}
                  </h2>
                  <p className="mt-1 text-sm text-[#4a6a7d]">
                    {board.savedCount} {board.savedCount === 1 ? "listing" : "listings"} saved
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (deletingId === board.id) {
                      deleteMutation.mutate(board.id);
                    } else {
                      setDeletingId(board.id);
                    }
                  }}
                  className="mt-4 flex items-center gap-1.5 self-end text-xs text-[#4a6a7d]/60 transition hover:text-red-500"
                  aria-label={deletingId === board.id ? "Confirm delete board" : "Delete board"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletingId === board.id ? "Confirm?" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
