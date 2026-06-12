import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Courtship — It's a match. Literally." },
      { name: "description", content: "Tennis partner matching for Uppsala. Invite-only beta." },
      { property: "og:title", content: "Courtship" },
      { property: "og:description", content: "Find your hitting partner in Uppsala." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="terry-bg min-h-screen flex flex-col items-center justify-center px-6 text-[var(--ink)] font-body">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="inline-block px-4 py-1 rounded-full border-2 border-[var(--ink)] bg-[var(--cream2)] text-xs font-extrabold tracking-widest uppercase">
          Uppsala · Invite-only beta
        </div>
        <h1 className="font-display text-6xl leading-[0.95]">
          It's a match.<br/>
          <span className="text-[var(--coral)]">Literally.</span>
        </h1>
        <p className="text-lg text-[var(--ink)] font-semibold">
          Find your tennis partner in Uppsala. Hit. Repeat.
        </p>
        <div className="flex flex-col gap-3 pt-2">
          <Link to="/auth" search={{ mode: "signup" }} className="cbtn cbtn-coral">
            Get an invite 🎾
          </Link>
          <Link to="/auth" search={{ mode: "login" }} className="cbtn cbtn-ghost">
            I already have an account
          </Link>
        </div>
      </div>
    </div>
  );
}
