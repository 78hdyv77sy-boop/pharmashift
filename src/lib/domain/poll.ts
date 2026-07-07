// Pure Auszählungs-Logik für Feed-Umfragen (testbar ohne DB).

export interface TallyOption {
  id: string;
  label: string;
}
export interface TallyVote {
  userId: string;
  optionId: string | null;
  customText: string | null;
}
export interface TallyResult {
  total: number;
  rows: { id: string | null; label: string; count: number; percent: number }[];
}

// Zählt Stimmen je Option; eigene Antworten (customText) werden nach Text
// gruppiert und hinter den festen Optionen einsortiert.
export function tallyVotes(options: TallyOption[], votes: TallyVote[]): TallyResult {
  const total = votes.length;
  const byOption = new Map<string, number>();
  const custom = new Map<string, number>();
  for (const v of votes) {
    if (v.optionId) byOption.set(v.optionId, (byOption.get(v.optionId) ?? 0) + 1);
    else if (v.customText?.trim()) {
      const key = v.customText.trim();
      custom.set(key, (custom.get(key) ?? 0) + 1);
    }
  }
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const rows = [
    ...options.map((o) => ({ id: o.id as string | null, label: o.label, count: byOption.get(o.id) ?? 0, percent: pct(byOption.get(o.id) ?? 0) })),
    ...[...custom.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ id: null, label: `„${label}“`, count, percent: pct(count) })),
  ];
  return { total, rows };
}
