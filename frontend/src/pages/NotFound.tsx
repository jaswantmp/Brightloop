import { useNavigate } from "react-router-dom";
import { FileQuestion, ArrowLeft, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center bg-white px-6 py-12 text-center"
      data-testid="not-found-page"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
        <FileQuestion className="h-7 w-7 text-slate-500" strokeWidth={1.75} />
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">
        404 — Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The page you are looking for does not exist, has been removed, or the link may be broken.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2"
          data-testid="not-found-back-button"
        >
          <ArrowLeft className="h-4 w-4" /> Go back
        </Button>
        <Button
          onClick={() => navigate("/")}
          className="flex items-center gap-2"
          data-testid="not-found-home-button"
        >
          <LayoutDashboard className="h-4 w-4" /> Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
