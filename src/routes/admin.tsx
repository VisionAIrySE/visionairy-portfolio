import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  component: Admin,
});

// The admin doorway. Tools live on their own subdomains so nothing they run
// can ever take this site down; this page is the one place they're all
// reachable from. Each tool carries its own password.
function Admin() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold">Visionairy Admin</h1>
        <a
          href="https://app.visionairy.biz"
          className="block border border-border rounded-xl p-5 hover:bg-muted transition-colors"
        >
          <div className="text-lg font-semibold">Hours Back CRM</div>
          <div className="text-sm text-muted-foreground mt-1">
            Today's calls, follow-ups, pipeline, and the week's score.
          </div>
        </a>
        <p className="text-xs text-muted-foreground">
          Tools are password-protected and run separately from this site.
        </p>
      </div>
    </div>
  );
}
