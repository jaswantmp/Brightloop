import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { AIAnswer, AIStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui-bits";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const PROMPT_CHIPS = [
  "Summarize our current recurring revenue",
  "How many invoices are overdue and what is the total balance?",
  "Which plans bring the most revenue?",
  "What payments arrived recently?",
];

// AI finance assistant. The model only sees a read-only, role-scoped snapshot
// computed by the backend — there is no SQL or unrestricted data surface.
export default function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => apiGet<AIStatus>("/ai/status"),
  });

  const ask = useMutation({
    mutationFn: (question: string) => apiPost<AIAnswer>("/ai/assistant", { question }),
    onSuccess: (res) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            res.answer ??
            res.error ??
            "The assistant could not answer right now — please try again.",
        },
      ]);
    },
    onError: (e: Error) => {
      setMessages((prev) => [...prev, { role: "assistant", text: `Request failed: ${e.message}` }]);
    },
  });

  function send(question: string) {
    if (!question.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    ask.mutate(question);
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">AI finance assistant</h2>
        <p className="mt-1 text-sm text-slate-500">
          Answers are grounded in a read-only snapshot of your authorized records — no other
          customers' data is ever included.
        </p>
      </div>

      {status && !status.configured ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          data-testid="ai-not-configured"
        >
          <p className="font-medium">AI assistant is not configured</p>
          <p className="mt-1 text-xs">
            Set <span className="font-mono">OPENAI_API_KEY</span> (and optionally{" "}
            <span className="font-mono">OPENAI_MODEL</span>) in the backend environment to enable
            it. Nothing is sent anywhere until then.
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm" data-testid="ai-chat-panel">
        <div className="flex min-h-80 flex-col gap-3 border-b border-slate-200 p-5" data-testid="ai-messages">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">
              Ask a question about subscriptions, invoices, payments or revenue. Try one of the
              suggestions below.
            </p>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg border px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "self-end border-slate-200 bg-slate-50 text-slate-900"
                    : "self-start border-slate-200 bg-white text-slate-700"
                }`}
                data-testid={m.role === "user" ? `ai-msg-user-${i}` : `ai-msg-assistant-${i}`}
              >
                {m.text}
              </div>
            ))
          )}
          {ask.isPending ? <p className="text-xs text-slate-400">Thinking…</p> : null}
        </div>

        <form
          className="flex items-center gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your finances…"
            data-testid="ai-prompt-input"
          />
          <Button type="submit" disabled={ask.isPending || !input.trim()} data-testid="ai-send-button">
            Send
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="ai-prompt-chips">
        {PROMPT_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => send(chip)}
            disabled={!status?.configured}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      {!status && (
        <EmptyState title="Checking AI availability…" testid="ai-status-loading" />
      )}
    </div>
  );
}
