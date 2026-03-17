"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/shared/page-header";
import { Send, Bot, User, Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal markdown-to-HTML: bold, italic, inline code, line breaks */
function markdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-white/10 text-xs font-mono">$1</code>')
    .replace(/\n/g, "<br />");
}

// ---------------------------------------------------------------------------
// Suggestion chips
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  "Qual campanha tem melhor ROAS real?",
  "Quais termos de busca devo negativar?",
  "Analise meu funil de vendas",
  "Como otimizar meu budget?",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-2 w-2 rounded-full bg-primary/60"
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ message, index }: { message: Message; index: number }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index < 20 ? index * 0.03 : 0 }}
      className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-primary/20 text-primary"
            : "bg-gradient-to-br from-[#6C5CE7] to-[#00D2FF] text-white"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-[var(--bg-tertiary,#1A1A28)] border border-[var(--border-default,#2A2A3E)] text-[var(--text-primary,#F0F0F5)] rounded-tl-sm"
        }`}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div
            className="prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
          />
        )}
      </div>
    </motion.div>
  );
}

function EmptyState({ onSuggestionClick }: { onSuggestionClick: (s: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center h-full gap-6 px-4"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6C5CE7] to-[#00D2FF] shadow-lg shadow-primary/20">
        <Bot className="h-8 w-8 text-white" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-xl font-heading font-bold tracking-tight">
          Chat com IA do GrowthOS
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Pergunte qualquer coisa sobre suas campanhas, funil, ROAS, termos de busca ou budget.
          A IA cruza dados reais da Utmify com métricas do Google Ads para respostas precisas.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        {SUGGESTIONS.map((s) => (
          <motion.button
            key={s}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSuggestionClick(s)}
            className="rounded-full border border-[var(--border-default,#2A2A3E)] bg-[var(--bg-secondary,#12121A)] px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            {s}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AIChatPage() {
  const orgId = useOrgId();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const conversationId = useMemo(() => crypto.randomUUID(), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = (text ?? input).trim();
      if (!messageText || loading) return;
      if (!orgId) {
        toast.error("Organização não encontrada", {
          description: "Selecione uma organização para usar o chat.",
        });
        return;
      }

      const userMessage: Message = { role: "user", content: messageText };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);

      try {
        const supabase = createClient();
        const { data, error } = await supabase.functions.invoke("ai-chat", {
          body: {
            organizationId: orgId,
            message: messageText,
            conversationId,
          },
        });

        if (error) throw error;

        const assistantMessage: Message = {
          role: "assistant",
          content: data?.response ?? "Desculpe, não consegui gerar uma resposta.",
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err: any) {
        toast.error("Erro ao enviar mensagem", {
          description: err?.message || "Tente novamente em instantes.",
        });
        // Remove the user message on failure so they can retry
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, loading, orgId, conversationId]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader
        title="Chat com IA"
        description="Converse com a inteligência artificial sobre seus dados de marketing"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/insights">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
        }
      />

      {/* Chat Container */}
      <Card className="surface-glow flex flex-col flex-1 overflow-hidden" style={{ height: "calc(100vh - 200px)" }}>
        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4">
          <div ref={scrollRef} className="space-y-4 min-h-full flex flex-col">
            {messages.length === 0 && !loading ? (
              <EmptyState onSuggestionClick={handleSuggestionClick} />
            ) : (
              <>
                <AnimatePresence mode="popLayout">
                  {messages.map((msg, idx) => (
                    <MessageBubble key={`${idx}-${msg.role}`} message={msg} index={idx} />
                  ))}
                </AnimatePresence>

                {loading && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6C5CE7] to-[#00D2FF] text-white">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-[var(--bg-tertiary,#1A1A28)] border border-[var(--border-default,#2A2A3E)] px-4 py-3">
                      <TypingIndicator />
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Input Bar */}
        <div className="border-t border-[var(--border-default,#2A2A3E)] bg-[var(--bg-secondary,#12121A)] p-4">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre suas campanhas, ROAS, funil..."
              disabled={loading}
              className="flex-1 bg-[var(--bg-tertiary,#1A1A28)] border-[var(--border-default,#2A2A3E)] focus-visible:ring-primary/50 placeholder:text-muted-foreground/60"
              aria-label="Mensagem para a IA"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              size="icon"
              className="shrink-0 bg-primary hover:bg-primary/90"
              aria-label="Enviar mensagem"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
