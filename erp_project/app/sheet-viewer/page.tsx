"use client";
import { useState } from "react";
export default function SheetViewerPage() {
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLoad() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/google-sheet?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load Google Sheet.");
      }

      setRows(data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.25em] text-emerald-400">Google Sheet Viewer</p>
          <h1 className="text-3xl font-semibold">Preview a published Google Sheet in a table</h1>
          <p className="text-zinc-300">
            Paste a published Google Sheets URL, then load the sheet to view its rows here.
          </p>
          <p className="text-sm text-amber-200/90">
            Only publicly published sheets can be loaded in this simple viewer. Private or restricted sheets will return a 401/403 error.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl shadow-black/20">
          <label className="mb-2 block text-sm text-zinc-300" htmlFor="sheet-url">Google Sheets URL</label>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              id="sheet-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none ring-0 transition focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={handleLoad}
              disabled={loading || !url.trim()}
              className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loading ? "Loading..." : "Load Sheet"}
            </button>
            <button
              type="button"
              onClick={() => {
                setUrl("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing");
                setError("");
              }}
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              Try sample public sheet
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-400">Tip: use a published/shareable link for the best result.</p>
        </section>

        {error ? (
          <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200">{error}</section>
        ) : null}

        {rows.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/60 p-8 text-zinc-400">
            No data loaded yet. Paste a link and click “Load Sheet”.
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/20">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
                <thead className="bg-zinc-800/90 text-zinc-200">
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="px-4 py-3 font-semibold whitespace-nowrap">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 bg-zinc-950/70">
                  {rows.map((row, index) => (
                    <tr key={`${index}-${Object.values(row).join("-")}`} className="hover:bg-zinc-900/80">
                      {columns.map((column) => (
                        <td key={`${index}-${column}`} className="px-4 py-3 align-top text-zinc-200">{row[column] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
