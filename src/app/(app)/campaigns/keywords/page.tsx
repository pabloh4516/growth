"use client";

import { useKeywords } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatCompact } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function KeywordsPage() {
  const { data: keywords, isLoading } = useKeywords();

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Palavra-chave</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Correspondência</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Quality Score</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Impressões</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Cliques</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">CTR</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">CPC</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Custo</th>
                </tr>
              </thead>
              <tbody>
                {(keywords || []).map((kw: any) => {
                  const ctr = kw.impressions > 0 ? (kw.clicks / kw.impressions) * 100 : 0;
                  const cpc = kw.clicks > 0 ? kw.cost / kw.clicks : 0;
                  const matchMap: Record<string, string> = { EXACT: "Exata", PHRASE: "Frase", BROAD: "Ampla" };
                  const qs = kw.quality_score || 0;
                  return (
                    <tr key={kw.id} className="group">
                      <td className="py-2.5 border-b border-border text-base font-medium text-t1 group-hover:bg-s2 transition-colors px-1">{kw.keyword_text || kw.text}</td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <Badge variant="secondary">{matchMap[kw.match_type] || kw.match_type || "Ampla"}</Badge>
                      </td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <div className="w-[50px] h-[3px] bg-s3 rounded-[2px]">
                            <div className="h-[3px] rounded-[2px] bg-primary" style={{ width: `${(qs / 10) * 100}%` }} />
                          </div>
                          <span className="text-xs text-t2">{qs}/10</span>
                        </div>
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">{formatCompact(kw.impressions || 0)}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1">{kw.clicks || 0}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">{ctr.toFixed(2)}%</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1">{formatBRL(cpc)}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1">{formatBRL(kw.cost || 0)}</td>
                    </tr>
                  );
                })}
                {(!keywords || keywords.length === 0) && (
                  <tr><td colSpan={8} className="py-8 text-center text-t3 text-sm">Nenhuma palavra-chave encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
