// app/page.tsx
"use client";

import {
  SignedIn,
  SignedOut,
  SignOutButton,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import PinIcon from "@/components/PinIcon";

const teamColors: Record<string, string> = {
  Mercedes:         "#00D2BE",
  "Red Bull":       "#1E5BC6",
  "RB F1 Team":     "#6692FF",
  Ferrari:          "#DC0000",
  McLaren:          "#FF8700",
  "Alpine F1 Team": "#0093CC",
  Alpine:           "#2293D1",
  "Aston Martin":   "#006F62",
  Williams:         "#005AFF",
  "Haas F1 Team":   "#B6BABD",
  Haas:             "#B6BABD",
  Sauber:           "#52E252",
  AlphaTauri:       "#FFFFFF",
};

const LockIcon = () => (
  <svg
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

interface Race {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time: string;
  Circuit: {
    circuitName: string;
    Location: { locality: string; country: string };
  };
}

interface DriverStanding {
  position: string;
  points: string;
  Driver: { givenName: string; familyName: string };
  Constructors: { constructorId: string; name: string }[];
}

interface ConstructorStanding {
  position: string;
  points: string;
  Constructor: { name: string };
}

interface Thread {
  id: string;
  gpId: string;
  title: string;
  date: string;
  locked: boolean;
  pinned: boolean;
}

interface ErgastRacesResponse {
  MRData: { RaceTable: { Races: Race[] } };
}

interface ErgastDriverStandingsResponse {
  MRData: {
    StandingsTable: {
      StandingsLists: { DriverStandings: DriverStanding[] }[];
    };
  };
}

interface ErgastConstructorStandingsResponse {
  MRData: {
    StandingsTable: {
      StandingsLists: { ConstructorStandings: ConstructorStanding[] }[];
    };
  };
}

interface ErgastResultsResponse {
  MRData: {
    RaceTable: {
      Races: Array<{
        Results: Array<{
          Constructor: { name: string };
        }>;
      }>;
    };
  };
}

export default function MainPage() {
  const { isLoaded, user } = useUser();
  const { openSignIn, openUserProfile } = useClerk();

  const [menuOpen, setMenuOpen] = useState(false);
  const [races, setRaces] = useState<Race[]>([]);
  const [pastWinners, setPastWinners] = useState<Record<string, string>>({});
  const [driverStandings, setDriverStandings] = useState<DriverStanding[]>([]);
  const [constructorStandings, setConstructorStandings] = useState<ConstructorStanding[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    const load = async () => {
      const year = new Date().getFullYear().toString();
      const base = "https://api.jolpi.ca/ergast/f1";
      const now = new Date();

      // Races
      const resRaces = await fetch(`${base}/${year}/races.json`);
      const racesJson = (await resRaces.json()) as ErgastRacesResponse;
      const racesArr = racesJson.MRData.RaceTable.Races;
      setRaces(racesArr);

      // Past GP Winners (last 5)
      const pastRaces = racesArr.filter(r => new Date(`${r.date}T${r.time}`) < now);
      const recentPast = pastRaces.slice(-5);
      const winnerEntries = await Promise.all(
        recentPast.map(async (r) => {
          const res = await fetch(`${base}/${year}/${r.round}/results.json`);
          const resultsJson = (await res.json()) as ErgastResultsResponse;
          const winner =
            resultsJson?.MRData?.RaceTable?.Races?.[0]?.Results?.[0]?.Constructor?.name
            ?? "";
          return [r.round, winner] as [string, string];
        })
      );
      setPastWinners(Object.fromEntries(winnerEntries));

      // Driver Standings
      const resDS = await fetch(`${base}/${year}/driverstandings.json`);
      const dsJson = (await resDS.json()) as ErgastDriverStandingsResponse;
      setDriverStandings(
        dsJson.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? []
      );

      // Constructor Standings
      const resCS = await fetch(`${base}/${year}/constructorstandings.json`);
      const csJson = (await resCS.json()) as ErgastConstructorStandingsResponse;
      setConstructorStandings(
        csJson.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? []
      );

      // Threads w/ 5-minute cache
      const CACHE_KEY = "threads_cache";
      const CACHE_TIME_KEY = "threads_cache_time";
      const TTL = 5 * 60 * 1000;
      const cached = localStorage.getItem(CACHE_KEY);
      const cacheTime = localStorage.getItem(CACHE_TIME_KEY);

      if (cached && cacheTime && Date.now() - +cacheTime < TTL) {
        setThreads(JSON.parse(cached) as Thread[]);
      } else {
        const resT = await fetch("/api/threads?limit=50");
        const data = (await resT.json()) as Thread[];
        setThreads(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      }
    };
    load();
  }, []);

  // Sort threads
  const unlockedThreads = threads
    .filter(t => !t.locked)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const lockedThreads = threads
    .filter(t => t.locked)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  // GPs
  const now = new Date();
  const past = races.filter(r => new Date(`${r.date}T${r.time}`) < now);
  const upcoming = races.filter(r => new Date(`${r.date}T${r.time}`) >= now);
  const currentGP = upcoming[0] ?? null;

  return (
    <>
      {/* centre Clerk modals */}
      <style jsx global>{`
        #__clerk_modal__ {
          position: fixed !important;
          inset: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 9999 !important;
        }
        #__clerk_modal__ > div {
          margin: auto !important;
        }
      `}</style>

      <main className="bg-f1-charcoal min-h-screen text-f1-white px-6 py-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <h1 className="text-4xl font-extrabold">TrackTalk</h1>
          <div className="relative">
            <SignedOut>
              <button
                onClick={() => openSignIn()}
                className="text-f1-red hover:text-red-400 transition"
              >
                Sign In / Sign Up
              </button>
            </SignedOut>
            <SignedIn>
              {isLoaded && (
                <>
                  <button
                    onClick={() => setMenuOpen(o => !o)}
                    className="flex items-center text-f1-red hover:text-red-400 transition"
                  >
                    Hi, {user?.username ?? "there"}!
                    <svg
                      className={`w-4 h-4 ml-1 transform transition ${menuOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                    >
                      <path d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-40 bg-f1-card rounded-lg shadow-md z-10">
                      <button
                        onClick={() => { openUserProfile(); setMenuOpen(false); }}
                        className="block w-full text-left px-4 py-2 text-sm text-f1-red hover:text-red-400 transition"
                      >
                        Account
                      </button>
                      <SignOutButton>
                        <button
                          onClick={() => setMenuOpen(false)}
                          className="w-full text-left px-4 py-2 text-sm text-f1-red hover:text-red-400 transition"
                        >
                          Sign Out
                        </button>
                      </SignOutButton>
                    </div>
                  )}
                </>
              )}
            </SignedIn>
          </div>
        </header>

        {/* GPs */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-f1-card p-6 rounded-2xl">
            <h2 className="text-2xl font-semibold text-f1-red mb-4">Next GP</h2>
            {currentGP ? (
              <>
                <h3 className="text-xl">{currentGP.raceName}</h3>
                <p className="text-sm text-gray-300">
                  {currentGP.Circuit.circuitName} — {currentGP.Circuit.Location.locality}
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  {new Date(`${currentGP.date}T${currentGP.time}`).toLocaleString()}
                </p>
              </>
            ) : (
              <p>No upcoming race found.</p>
            )}
          </div>

          <div className="bg-f1-card p-6 rounded-2xl">
            <h2 className="text-2xl font-semibold mb-4">Upcoming GPs</h2>
            <ul className="space-y-2 text-gray-200">
              {upcoming.slice(0, 5).map(r => (
                <li key={r.round} className="flex justify-between">
                  <span>{r.raceName}</span>
                  <span className="text-sm">{new Date(r.date).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-f1-card p-6 rounded-2xl">
            <h2 className="text-2xl font-semibold mb-4">Past GPs</h2>
            <ul className="space-y-2 text-gray-200">
              {past.slice(-5).reverse().map(r => {
                const winnerTeam = pastWinners[r.round] ?? "";
                const dotColor = teamColors[winnerTeam] ?? "currentColor";
                return (
                  <li key={r.round} className="flex justify-between">
                    <span className="flex items-center">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ backgroundColor: dotColor }}
                        title={winnerTeam || "Unknown"}
                      />
                      {r.raceName}
                    </span>
                    <span className="text-sm">{new Date(r.date).toLocaleDateString()}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Standings */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          <div className="bg-f1-card p-6 rounded-2xl overflow-x-auto">
            <h2 className="text-2xl font-semibold text-f1-red mb-4">Driver Standings</h2>
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-300">
                  <th className="pr-4">#</th>
                  <th className="pr-4">Driver</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {driverStandings.map(d => {
                  const teamName = d.Constructors[0]?.name ?? "";
                  const dotColor = teamColors[teamName] ?? "currentColor";
                  return (
                    <tr key={d.position} className="border-t border-gray-700">
                      <td className="pr-4">{d.position}</td>
                      <td className="pr-4 flex items-center">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: dotColor }}
                          title={teamName}
                        />
                        {d.Driver.givenName} {d.Driver.familyName}
                      </td>
                      <td>{d.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-f1-card p-6 rounded-2xl overflow-x-auto">
            <h2 className="text-2xl font-semibold text-f1-red mb-4">Constructor Standings</h2>
            <table className="w-full text-left text-lg">
              <thead>
                <tr className="text-gray-300">
                  <th className="pr-4">#</th>
                  <th className="pr-4">Team</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {constructorStandings.map(c => {
                  const dotColor = teamColors[c.Constructor.name] ?? "currentColor";
                  return (
                    <tr key={c.position} className="border-t border-gray-700">
                      <td className="pr-4">{c.position}</td>
                      <td className="pr-4 flex items-center">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: dotColor }}
                        />
                        {c.Constructor.name}
                      </td>
                      <td>{c.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Threads */}
        <section>
          <h2 className="text-2xl font-semibold text-f1-red mb-4">Recent Threads</h2>
          <ul className="space-y-4">
            {unlockedThreads.map(t => (
              <li key={t.id} className="flex items-center bg-f1-card p-4 rounded-2xl">
                <Link
                  href={`/gp/${t.gpId}/chat`}
                  className="flex-1 hover:text-f1-red transition"
                >
                  {t.title}
                </Link>
                {t.pinned && <PinIcon />}
              </li>
            ))}
          </ul>
          {lockedThreads.length > 0 && <div className="my-8 border-t border-gray-700" />}
          <ul className="space-y-4">
            {lockedThreads.map(t => (
              <li
                key={t.id}
                className="flex items-center bg-f1-card p-4 rounded-2xl opacity-70"
              >
                <Link
                  href={`/gp/${t.gpId}/threads/${t.id}`}
                  className="flex-1 hover:text-f1-red transition"
                >
                  {t.title}
                </Link>
                <LockIcon />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}