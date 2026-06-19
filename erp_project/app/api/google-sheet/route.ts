import { NextResponse } from "next/server";

function extractSheetId(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  return match?.[1] || trimmed;
}

function extractSheetGid(input: string) {
  const trimmed = input.trim();
  const gidMatch = trimmed.match(/[?&]gid=([0-9]+)/i) || trimmed.match(/#gid=([0-9]+)/i);
  return gidMatch?.[1] || "0";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(current);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((value) => value.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function toObjects(rows: string[][]) {
  const [headers, ...dataRows] = rows;
  if (!headers) return [];

  return dataRows.map((row) =>
    headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header || `Column ${index + 1}`] = row[index] ?? "";
      return acc;
    }, {})
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sheetUrl = searchParams.get("url");

  if (!sheetUrl) {
    return NextResponse.json(
      { error: "Please provide a Google Sheets URL." },
      { status: 400 }
    );
  }

  const sheetId = extractSheetId(sheetUrl);
  const gid = extractSheetGid(sheetUrl);

  if (!sheetId) {
    return NextResponse.json(
      { error: "The URL does not contain a valid Google Sheets ID." },
      { status: 400 }
    );
  }

  try {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const response = await fetch(exportUrl, {
      headers: {
        "User-Agent": "ERP-Sheet-Viewer/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "This Google Sheet must be published to the web (File → Share → Publish to web) for this viewer to read it. Private sheets are not accessible from this route."
        );
      }
      throw new Error(`Google Sheets export failed with status ${response.status}`);
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);

    return NextResponse.json({
      rows: toObjects(rows),
      sourceUrl: sheetUrl,
      exportedUrl: exportUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to fetch the Google Sheet right now.",
      },
      { status: 500 }
    );
  }
}
