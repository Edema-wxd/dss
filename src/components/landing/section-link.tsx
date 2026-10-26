/**
 * A plain link to a homepage section ("/#apply"). next/link updates the hash
 * without scrolling when you're already on the homepage, so this uses a
 * native anchor: it smooth-scrolls in place there and loads the homepage at
 * that section from any other page.
 */
export function SectionLink(props: React.ComponentProps<"a"> & { href: `/#${string}` }) {
  return <a {...props} />;
}
