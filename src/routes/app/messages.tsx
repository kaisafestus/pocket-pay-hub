import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Phone, MoreVertical, Search } from "lucide-react";
import messagesIcon from "@/assets/messages-icon.png";

export const Route = createFileRoute("/app/messages")({ component: MessagesScreen });

type Message = {
  id: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  created_at: string;
  read: boolean;
};

function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: messages } = useQuery({
    queryKey: ["messages", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });
      return (data ?? []) as Message[];
    },
    refetchInterval: 4000,
  });

  // Mark unread as read
  useEffect(() => {
    if (!messages || !user) return;
    const unread = messages.filter((m) => !m.read).map((m) => m.id);
    if (unread.length > 0) {
      void supabase.from("messages").update({ read: true }).in("id", unread);
    }
  }, [messages, user]);

  // Auto-scroll to newest
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0d1418] text-zinc-100">
      {/* Header — Android SMS style */}
      <header className="sticky top-0 z-20 bg-[#1a2329] border-b border-black/40">
        <div className="mx-auto max-w-md flex items-center gap-3 px-3 py-2.5">
          <button
            onClick={() => router.history.back()}
            className="h-9 w-9 grid place-items-center rounded-full hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="h-9 w-9 rounded-full bg-[#fbbf24] grid place-items-center shadow overflow-hidden">
            <img src={messagesIcon} alt="M-PESA" className="h-7 w-7 object-contain" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium leading-tight truncate">M-PESA</p>
            <p className="text-[11px] text-zinc-400 leading-tight">Short code</p>
          </div>

          <button className="h-9 w-9 grid place-items-center rounded-full hover:bg-white/10">
            <Search className="h-[18px] w-[18px]" />
          </button>
          <button className="h-9 w-9 grid place-items-center rounded-full hover:bg-white/10">
            <Phone className="h-[18px] w-[18px]" />
          </button>
          <button className="h-9 w-9 grid place-items-center rounded-full hover:bg-white/10">
            <MoreVertical className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-md px-3 py-4 space-y-3">
          {(!messages || messages.length === 0) && (
            <p className="text-center text-sm text-zinc-500 py-12">
              No messages yet. Make a transaction to receive M-PESA notifications.
            </p>
          )}

          {messages?.map((m, i) => {
            const prev = messages[i - 1];
            const showDate =
              !prev ||
              new Date(prev.created_at).toDateString() !==
                new Date(m.created_at).toDateString();
            return (
              <div key={m.id}>
                {showDate && <DateChip date={m.created_at} />}
                <MessageBubble m={m} />
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom notice — like the screenshot */}
      <div className="bg-[#1a2329] border-t border-black/40 px-4 py-3 text-center text-[12px] text-zinc-400">
        You can't reply to this short code.{" "}
        <a href="#" className="text-[#4fc3f7]">Learn more</a>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  return (
    <div className="flex flex-col items-start max-w-[88%]">
      <div className="rounded-2xl rounded-tl-sm bg-[#1f2c33] text-zinc-100 px-3.5 py-2.5 text-[14.5px] leading-[1.45] shadow-sm">
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        {m.link_url && (
          <a
            href={m.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1 text-[#4fc3f7] underline underline-offset-2 break-all"
          >
            {m.link_label ?? m.link_url}
          </a>
        )}
        {m.link_url && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/25 px-2 py-1.5">
            <img src={messagesIcon} alt="" className="h-6 w-6 rounded object-contain bg-[#fbbf24] p-0.5" />
            <span className="text-[11px] text-zinc-300 truncate">
              {(m.link_label ?? "").replace(/^https?:\/\//, "")}
            </span>
          </div>
        )}
      </div>
      <span className="mt-1 ml-2 text-[10.5px] text-zinc-500">
        {formatTime(m.created_at)}
      </span>
    </div>
  );
}

function DateChip({ date }: { date: string }) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  let label: string;
  if (d.toDateString() === today.toDateString()) label = "Today";
  else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
  else label = d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="flex justify-center my-3">
      <span className="px-3 py-1 rounded-full bg-black/40 text-[11px] text-zinc-300">{label}</span>
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit", hour12: true });
}