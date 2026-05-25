import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckSquare } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type CustomerNotification = {
 id: string;
 title: string | null;
 message: string | null;
 link: string | null;
 read: boolean | null;
 createdAt: string | null;
 type?: string | null;
};

const NOTIFICATIONS_KEY = ["/api/customer/notifications"];

export default function CustomerNotifications() {
 const queryClient = useQueryClient();
 const { toast } = useToast();
 const [readTab, setReadTab] = useState<"unread" | "read">("unread");
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

 const { data: notifications = [], isLoading } = useQuery<CustomerNotification[]>({
  queryKey: NOTIFICATIONS_KEY,
 });

 const markRead = useMutation({
  mutationFn: async (id: string) => {
   const res = await apiRequest("PATCH", `/api/customer/notifications/${id}/read`);
   return res.json();
  },
  onMutate: async (id: string) => {
   await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
   const previous = queryClient.getQueryData<CustomerNotification[]>(NOTIFICATIONS_KEY);
   queryClient.setQueryData<CustomerNotification[]>(NOTIFICATIONS_KEY, (old = []) =>
    old.map((n) => (n.id === id ? { ...n, read: true } : n)),
   );
   return { previous };
  },
  onError: (_err, _id, context) => {
   if (context?.previous !== undefined) {
    queryClient.setQueryData(NOTIFICATIONS_KEY, context.previous);
   }
   toast({ title: "Couldn't mark as read", variant: "destructive" });
  },
  onSettled: () => {
   queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
   queryClient.invalidateQueries({ queryKey: ["/api/customer/notifications/unread-count"] });
  },
 });

 const bulkMarkRead = useMutation({
  mutationFn: async (ids: string[]) => {
   const res = await apiRequest("PATCH", "/api/customer/notifications/bulk/read", { ids });
   return res.json();
  },
  onMutate: async (ids: string[]) => {
   await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
   const previous = queryClient.getQueryData<CustomerNotification[]>(NOTIFICATIONS_KEY);
   const idSet = new Set(ids);
   queryClient.setQueryData<CustomerNotification[]>(NOTIFICATIONS_KEY, (old = []) =>
    old.map((n) => (idSet.has(n.id) ? { ...n, read: true } : n)),
   );
   return { previous };
  },
  onError: (_err, _ids, context) => {
   if (context?.previous !== undefined) {
    queryClient.setQueryData(NOTIFICATIONS_KEY, context.previous);
   }
   toast({ title: "Couldn't mark as read", variant: "destructive" });
  },
  onSuccess: () => {
   setSelectedIds(new Set());
   toast({ title: "Marked as read" });
  },
  onSettled: () => {
   queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
   queryClient.invalidateQueries({ queryKey: ["/api/customer/notifications/unread-count"] });
  },
 });

 const unread = notifications.filter((n) => n.read === false || n.read === null);
 const read = notifications.filter((n) => n.read === true);
 const visible = readTab === "unread" ? unread : read;
 const unreadTotal = unread.length;

 const allVisibleIds = visible.map((n) => n.id);
 const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
 const someSelected = allVisibleIds.some((id) => selectedIds.has(id));
 const selectedCount = allVisibleIds.filter((id) => selectedIds.has(id)).length;

 const toggleSelectAll = () => {
  setSelectedIds(allSelected ? new Set() : new Set(allVisibleIds));
 };
 const toggleSelectOne = (id: string) => {
  setSelectedIds((prev) => {
   const next = new Set(prev);
   next.has(id) ? next.delete(id) : next.add(id);
   return next;
  });
 };

 return (
  <div className="max-w-3xl space-y-6">
   <div>
    <h1 className="text-3xl font-bold mb-2">Notifications</h1>
   </div>

   {/* Unread / Read tab toggle */}
   <div className="flex items-center gap-1 border-b">
    <button
     type="button"
     onClick={() => { setReadTab("unread"); setSelectedIds(new Set()); }}
     className={`px-4 py-2 text-sm font-medium transition-colors relative ${
      readTab === "unread" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
     }`}
    >
     Unread
     {unreadTotal > 0 && (
      <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground leading-none">
       {unreadTotal}
      </span>
     )}
     {readTab === "unread" && (
      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
     )}
    </button>
    <button
     type="button"
     onClick={() => { setReadTab("read"); setSelectedIds(new Set()); }}
     className={`px-4 py-2 text-sm font-medium transition-colors relative ${
      readTab === "read" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
     }`}
    >
     Read
     {readTab === "read" && (
      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
     )}
    </button>
   </div>

   <section className="px-1">
    {isLoading ? (
     <div className="text-center py-12 text-muted-foreground">Loading notifications…</div>
    ) : visible.length === 0 ? (
     <div className="text-center py-12">
      <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">
       {readTab === "unread" ? "All caught up" : "No read notifications"}
      </h3>
      <p className="text-muted-foreground">
       {readTab === "unread"
        ? "You have no unread notifications."
        : "Notifications you've read will appear here."}
      </p>
     </div>
    ) : (
     <div className="space-y-2">
      {/* Select-all / bulk action bar */}
      <div className="flex items-center justify-between gap-3 py-1">
       <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-muted-foreground">
        <input
         type="checkbox"
         checked={allSelected}
         ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
         onChange={toggleSelectAll}
         className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
        />
        {someSelected ? `${selectedCount} selected` : "Select all"}
       </label>
       {someSelected && readTab === "unread" && (
        <Button
         type="button"
         size="sm"
         variant="outline"
         disabled={bulkMarkRead.isPending}
         onClick={() => bulkMarkRead.mutate(Array.from(selectedIds).filter((id) => allVisibleIds.includes(id)))}
        >
         <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
         Mark as read
        </Button>
       )}
      </div>

      {visible.map((notification) => {
       const created = notification.createdAt ? new Date(notification.createdAt) : null;
       const timeLabel = created
        ? created.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "";
       const isUnread = notification.read === false || notification.read === null;
       const isChecked = selectedIds.has(notification.id);

       return (
        <div
         key={notification.id}
         className={`w-full rounded-lg border p-4 transition-colors ${
          isChecked
           ? "bg-primary/5 border-primary/30"
           : isUnread
            ? "bg-muted/30"
            : "bg-background"
         }`}
        >
         <div className="flex items-start gap-3">
          <input
           type="checkbox"
           checked={isChecked}
           onChange={() => toggleSelectOne(notification.id)}
           className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 accent-primary cursor-pointer"
          />
          <div className="flex-1 min-w-0">
           <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
             <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full shrink-0 ${isUnread ? "bg-primary" : "bg-transparent"}`} />
              <div className="font-medium truncate">{notification.title || "Notification"}</div>
             </div>
             {notification.message ? (
              <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
               {notification.message}
              </div>
             ) : null}
            </div>
            <div className="shrink-0 text-sm text-muted-foreground">{timeLabel}</div>
           </div>
           {(isUnread || notification.link) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
             {isUnread ? (
              <Button
               type="button"
               size="sm"
               variant="outline"
               onClick={() => markRead.mutate(notification.id)}
               disabled={markRead.isPending}
              >
               Mark as read
              </Button>
             ) : null}
             {notification.link ? (
              <Button type="button" size="sm" variant="outline" asChild>
               <Link href={notification.link}>View details</Link>
              </Button>
             ) : null}
            </div>
           )}
          </div>
         </div>
        </div>
       );
      })}
     </div>
    )}
   </section>
  </div>
 );
}
