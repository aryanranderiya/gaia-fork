const INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/theexperiencecompany/gaia/refs/heads/master/packages/cli/install.sh";

export async function GET() {
  const res = await fetch(INSTALL_SCRIPT_URL, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return new Response("Install script not found", { status: 404 });
  }

  const script = await res.text();

  return new Response(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
