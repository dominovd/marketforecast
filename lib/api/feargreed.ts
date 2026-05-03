// alternative.me Fear & Greed Index — free, no key required
export interface FearGreedData {
  value: number; // 0–100
  label: string; // "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
}

export async function getFearGreed(): Promise<FearGreedData> {
  const res = await fetch('https://api.alternative.me/fng/?limit=1', {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Fear & Greed API → ${res.status}`);
  const json = await res.json();
  const item = json?.data?.[0];
  return {
    value: parseInt(item?.value ?? '50', 10),
    label: item?.value_classification ?? 'Neutral',
  };
}
