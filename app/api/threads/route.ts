import { NextResponse } from "next/server";

type Thread = {
  id: string;
  gpId: string;
  title: string;
  date: string;
  locked: boolean;
  pinned: boolean;
};

interface RawRace {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time: string;
}

interface ErgastRaceResponse {
  MRData: {
    RaceTable: { Races: RawRace[] };
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  const year = new Date().getFullYear();
  const base = "https://api.jolpi.ca/ergast/f1";

  const res = await fetch(`${base}/${year}/races.json`);
  if (!res.ok) return NextResponse.error();

  const json = (await res.json()) as ErgastRaceResponse;
  const races = json.MRData.RaceTable.Races;

  const threads: Thread[] = races
    .map((r) => {
      const dt = new Date(`${r.date}T${r.time}`);
      return {
        id: r.round,
        gpId: r.round,
        title: `${dt.getFullYear()} MEGATHREAD -- ${r.raceName}`,
        date: dt.toISOString(),
        locked: false,
        pinned: false,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const nowMs = Date.now();
  let currentIndex = threads.findIndex((t) => new Date(t.date).getTime() >= nowMs);
  if (currentIndex === -1) {
    currentIndex = threads.length - 1;
  }

  // Lock all except the current and previous one
  threads.forEach((t, i) => {
    t.locked = !(i === currentIndex || i === currentIndex - 1);
  });

  // Pin current and next
  threads[currentIndex]!.pinned = true;
  if (currentIndex + 1 < threads.length) {
    threads[currentIndex + 1]!.pinned = true;
  }

  // Sort pinned to top
  const finalList = threads.sort((a, b) => {
    if (a.pinned === b.pinned) {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    return a.pinned ? -1 : 1;
  });

  const output = limit != null ? finalList.slice(0, limit) : finalList;
  return NextResponse.json(output);
}