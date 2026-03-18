"use client";

import { useState, useRef, useEffect } from "react";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const supabase = createClient();

interface Message {
  role: "user" | "ai";
  text: string;
}

export function ChatBar() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || !orgId) return;
    setInput("");
    setPanelOpen(true);
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setIsTyping(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          organizationId: orgId,
          message: msg,
          conversationId,
        },
      });

      if (error) throw error;

      if (data?.conversationId) {
        setConversationId(data.conversationId);
      }

      setMessages((prev) => [
        ...prev,
        { role: "ai", text: data?.message || "Sem resposta." },
      ]);

      // If actions were created, refresh the decisions list
      if (data?.actionsCreated > 0) {
        queryClient.invalidateQueries({ queryKey: ["ai-decisions"] });
        queryClient.invalidateQueries({ queryKey: ["ai-stats"] });
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `Erro: ${err?.message || "Não foi possível conectar ao agente IA. Verifique se a ANTHROPIC_API_KEY está configurada no Supabase."}` },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Agent Panel (expanded chat) */}
      {panelOpen && (
        <div className="absolute bottom-[52px] right-3 md:right-6 w-[calc(100vw-24px)] md:w-[360px] max-h-[450px] bg-s1 border border-border rounded-lg shadow-[0_8px_32px_rgba(0,0,0,.5)] flex flex-col z-50 animate-fade-up">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-sm bg-purple-dim text-primary flex items-center justify-center text-xs font-bold font-heading">✦</div>
              <span className="text-sm font-medium text-t1">Agente GrowthOS</span>
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
            </div>
            <button onClick={() => setPanelOpen(false)} className="text-t3 hover:text-t1 text-sm cursor-pointer">✕</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin min-h-[200px]">
            {messages.length === 0 && (
              <div className="text-center text-t3 text-sm py-8 space-y-2">
                <p>Pergunte sobre suas campanhas, vendas ou métricas.</p>
                <p className="text-xs text-t4">Exemplos:</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {["Qual campanha tem melhor ROAS?", "Pause campanhas sem venda", "Resumo do dia"].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="text-2xs px-2 py-1 rounded-[6px] border border-border text-t3 hover:border-primary hover:text-primary transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}>
                <div className={cn(
                  "w-[26px] h-[26px] rounded-sm flex items-center justify-center text-sm font-bold font-heading shrink-0",
                  msg.role === "ai" ? "bg-purple-dim text-primary" : "bg-s3 text-t2"
                )}>
                  {msg.role === "ai" ? "✦" : "Vc"}
                </div>
                <div className={cn(
                  "max-w-[260px] px-3 py-2.5 text-base text-t1 leading-relaxed whitespace-pre-wrap",
                  msg.role === "ai"
                    ? "bg-s2 border border-border rounded-[12px] rounded-bl-[3px]"
                    : "bg-purple-dim border border-primary/30 rounded-[12px] rounded-br-[3px]"
                )}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-2">
                <div className="w-[26px] h-[26px] rounded-sm bg-purple-dim text-primary flex items-center justify-center text-sm font-bold font-heading shrink-0">✦</div>
                <div className="flex gap-1 items-center px-3 py-2.5">
                  <span className="w-[5px] h-[5px] rounded-full bg-t3 animate-blink" />
                  <span className="w-[5px] h-[5px] rounded-full bg-t3 animate-blink" style={{ animationDelay: "0.2s" }} />
                  <span className="w-[5px] h-[5px] rounded-full bg-t3 animate-blink" style={{ animationDelay: "0.4s" }} />
                </div>
              </div>
            )}
          </div>

          {/* Panel input */}
          <div className="p-3 border-t border-border flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte ao agente..."
              className="flex-1 bg-s2 border border-input rounded-[9px] px-3 py-2 text-base text-t1 placeholder:text-t4 focus:outline-none focus:border-primary/45"
            />
            <button
              onClick={sendMessage}
              disabled={isTyping}
              className="bg-primary rounded-[9px] px-4 py-2 text-base font-medium text-white shadow-[0_4px_12px_hsl(var(--purple-glow))] hover:bg-primary/85 active:scale-[.97] transition-all cursor-pointer disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Chat bar */}
      <div className="bg-s1 border-t border-border px-3 md:px-6 py-2.5 md:py-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] flex items-center gap-2 md:gap-3 shrink-0 relative">
        <div
          onClick={() => setPanelOpen(!panelOpen)}
          className="flex items-center gap-2 bg-purple-dim border border-primary/28 rounded-sm px-3 py-[7px] text-sm text-primary font-medium whitespace-nowrap cursor-pointer hover:bg-primary/16 transition-colors"
        >
          <span>✦</span>
          <span className="hidden sm:inline">Agente GrowthOS</span>
          <span className="sm:hidden">IA</span>
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte ao agente..."
          className="flex-1 bg-s2 border border-input rounded-[9px] px-3.5 py-2 text-base text-t1 placeholder:text-t4 focus:outline-none focus:border-primary/45 transition-colors"
        />
        <button
          onClick={sendMessage}
          disabled={isTyping || !input.trim()}
          className="bg-primary border-none rounded-[9px] px-4 py-2 text-base font-medium text-white shadow-[0_4px_12px_hsl(var(--purple-glow))] hover:bg-primary/85 active:scale-[.97] transition-all whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
    </>
  );
}
