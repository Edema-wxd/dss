// DSS HQ's web app manifest, so HQ can be added to a phone's home screen and open like an app.
// On iPhone that's also what lets Messages send push notifications (iOS 16.4 and later). It sits
// outside /savvy-hq because browsers fetch it without the sign-in cookie.

export function GET() {
  return Response.json(
    {
      name: "DSS HQ",
      short_name: "DSS HQ",
      description: "Digital Savvy Studios' internal app.",
      id: "/savvy-hq",
      start_url: "/savvy-hq/today",
      scope: "/savvy-hq/",
      display: "standalone",
      background_color: "#201C2B",
      theme_color: "#201C2B",
      icons: [
        { src: "/hq-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/hq-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } },
  );
}
