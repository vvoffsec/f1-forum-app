// app/api/threads/route.ts
import { NextResponse } from "next/server";

type Thread = {
  id: string;
  gpId: string;
  title: string;
  date: string;
  locked: boolean;
  pinned: boolean;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  const year = new Date().getFullYear();
  const base = "https://api.jolpi.ca/ergast/f1";

  const res = await fetch(`${base}/${year}/races.json`);
  if (!res.ok) return NextResponse.error();
  const races = (await res.json() as any).MRData.RaceTable.Races as any[];

  const threads = races
    .map(r => {
      const dt = new Date(`${r.date}T${r.time}`);
      return {
        id: r.round,
        gpId: r.round,
        title: `${dt.getFullYear()} MEGATHREAD -- ${r.raceName}`,
        date: dt.toISOString(),
        locked: false,
        pinned: false,
      } as Thread;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const nowMs = Date.now();
  let currentIndex = threads.findIndex(t => new Date(t.date).getTime() >= nowMs);
  if (currentIndex === -1) {
    currentIndex = threads.length - 1;
  }

  const subset = threads;

  subset.forEach((t, i) => {
    t.locked = !(i === currentIndex || i === currentIndex - 1);
  });

  subset[currentIndex]!.pinned = true;

  if (currentIndex + 1 < subset.length) {
    subset[currentIndex + 1]!.pinned = true;
  }

  const finalList = subset.sort((a, b) => {
    if (a.pinned === b.pinned) {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    return a.pinned ? -1 : 1;
  });

  const output = limit != null ? finalList.slice(0, limit) : finalList;
  return NextResponse.json(output);
}