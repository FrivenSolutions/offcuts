// Sends code to outside formatter services. The owner must turn this on in Settings.
// The service addresses can be changed with DAX_FORMATTER_URL and PQ_FORMATTER_URL.

export class FormatError extends Error {}

const TIMEOUT_MS = 15_000;

function daxUrl(): string {
  return process.env.DAX_FORMATTER_URL ?? "https://www.daxformatter.com/api/daxformatter/DaxTextFormat";
}

function pqUrl(): string {
  return process.env.PQ_FORMATTER_URL ?? "https://m-formatter.azurewebsites.net/api/v2";
}

export const FORMATTABLE = ["dax", "powerquery"] as const;

async function post(url: string, body: unknown, service: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new FormatError(`${service} did not answer. Check that the server can reach ${new URL(url).host}.`);
  }
  if (!res.ok) throw new FormatError(`${service} returned an error (HTTP ${res.status}).`);
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    throw new FormatError(`${service} sent an answer that Offcuts cannot read.`);
  }
}

function errorText(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return errors
    .slice(0, 3)
    .map((e) => {
      const err = (e ?? {}) as Record<string, unknown>;
      const where = err.line !== undefined ? `Line ${Number(err.line) + 1}: ` : "";
      return where + String(err.message ?? err.Message ?? JSON.stringify(e));
    })
    .join(" ");
}

export async function formatCode(language: string, code: string): Promise<string> {
  if (language === "dax") {
    const data = await post(
      daxUrl(),
      { Dax: code, ListSeparator: ",", DecimalSeparator: ".", MaxLineLenght: 0, CallerApp: "Offcuts" },
      "DAX Formatter",
    );
    const err = errorText(data.errors);
    if (err) throw new FormatError(`DAX Formatter found a problem. ${err}`);
    if (typeof data.formatted !== "string") throw new FormatError("DAX Formatter sent no formatted code.");
    return data.formatted.replace(/\r\n/g, "\n").trimEnd();
  }
  if (language === "powerquery") {
    const data = await post(pqUrl(), { code, resultType: "text", lineWidth: 100 }, "Power Query Formatter");
    const err = errorText(data.errors);
    if (data.success === false || err) throw new FormatError(`Power Query Formatter found a problem. ${err ?? ""}`.trim());
    if (typeof data.result !== "string") throw new FormatError("Power Query Formatter sent no formatted code.");
    return data.result.replace(/\r\n/g, "\n").trimEnd();
  }
  throw new FormatError("Only DAX and Power Query M can be formatted.");
}
