import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/components/ui/use-toast";

const SUGGESTIONS = [
  "How much did I sell this month?",
  "What's my profit so far this year?",
  "Which inventory is running low?",
  "What are my biggest expenses?",
];

function FunctionDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const status = toolCall.status;
  const failed = ["failed", "error"].includes(status) ||
    (toolCall.results && /error|failed/i.test(String(toolCall.results)));
  const proj = toolCall.display_projection || {};
  const hide = proj.hide_details && proj.details_redacted;
  const label = failed ? proj.error_label || "Failed" :
    ["pending", "running", "in_progress"].includes(status) ? proj.active_label || "Working…" :
    proj.label || "Done";

  let args = toolCall.arguments_string;
  try { args = JSON.stringify(JSON.parse(toolCall.arguments_string), null, 2); } catch (e) {}
  let results = toolCall.results;
  try { results = JSON.stringify(JSON.parse(toolCall.results), null, 2); } catch (e) {}

  return (
    <div className="mt-2 text-xs rounded-xl bg-muted/60 p-2.5 border border-[hsl(var(--border))]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 font-medium text-muted-foreground"
      >
        <Sparkles className="w-3 h-3" />
        <span>{toolCall.name}</span>
        <span className={failed ? "text-destructive" : "text-muted-foreground"}>· {label}</span>
      </button>
      {!hide && expanded && (
        <div className="mt-2 space-y-1.5 font-mono text-[11px] overflow-x-auto">
          {toolCall.arguments_string && (
            <div>
              <p className="text-muted-foreground">Parameters:</p>
              <pre className="whitespace-pre-wrap break-words">{args}</pre>
            </div>
          )}
          {toolCall.results && (
            <div>
              <p className="text-muted-foreground">Result:</p>
              <pre className="whitespace-pre-wrap break-words">{String(results).slice(0, 400)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
        {message.content && (
          isUser ? (
            <div className="px-4 py-2.5 rounded-3xl rounded-br-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[15px]">
              {message.content}
            </div>
          ) : (
            <div className="px-4 py-3 rounded-3xl rounded-bl-lg bg-card border border-[hsl(var(--border))]">
              <ReactMarkdown className="text-[15px] prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                {message.content}
              </ReactMarkdown>
            </div>
          )
        )}
        {message.tool_calls?.map((tc, i) => <FunctionDisplay key={i} toolCall={tc} />)}
      </div>
    </div>
  );
}

export default function Assistant() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    let conv;
    (async () => {
      const list = base44.agents.listConversations({ agent_name: "business_advisor" });
      if (list && list.length > 0) {
        conv = list[0];
      } else {
        conv = base44.agents.createConversation({
          agent_name: "business_advisor",
          metadata: { name: "Business Advisor" },
        });
      }
      setConversation(conv);
      setMessages(conv.messages || []);
    })();
  }, []);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || !conversation || sending) return;
    setInput("");
    setSending(true);
    try {
      await base44.agents.addMessage(conversation, { role: "user", content });
    } catch (e) {
      toast({ title: "Couldn't send", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)]">
      <header className="flex items-center gap-3 mb-3">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full bg-card border border-[hsl(var(--border))] flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full pastel-lavender flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[hsl(var(--primary))]" />
          </div>
          <div>
            <h1 className="font-heading text-lg leading-tight">Business Advisor</h1>
            <p className="text-xs text-muted-foreground">Ask about your sales, expenses & inventory</p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 no-scrollbar pb-2">
        {messages.length === 0 && (
          <div className="space-y-2 pt-6">
            <p className="text-sm text-muted-foreground px-1">Try asking:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="w-full text-left px-4 py-3 rounded-2xl bg-card border border-[hsl(var(--border))] text-sm active:scale-[0.99] transition-transform"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about your business…"
          className="flex-1 h-12 px-4 rounded-full bg-card border border-[hsl(var(--border))] text-base focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          className="w-12 h-12 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}