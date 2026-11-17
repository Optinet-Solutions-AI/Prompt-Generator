import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Shown inside the app frame (sidebar stays visible) when the address matches no page.
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-16 text-center space-y-4">
      <h1 className="text-2xl sm:text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground break-all">
        There is no page at <span className="font-mono">{location.pathname}</span>
      </p>
      <Button asChild>
        <Link to="/">Go to Home</Link>
      </Button>
    </div>
  );
};

export default NotFound;
