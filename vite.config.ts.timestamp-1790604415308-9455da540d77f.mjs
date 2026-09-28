// vite.config.ts
import { defineConfig } from "file:///C:/Users/User/Prompt-Generator/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/User/Prompt-Generator/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/User/Prompt-Generator/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "c:\\Users\\User\\Prompt-Generator";
function imageProxyPlugin() {
  return {
    name: "image-proxy",
    configureServer(server) {
      server.middlewares.use("/api/image-proxy", async (req, res) => {
        const url = new URL(req.url || "/", "http://localhost");
        const target = url.searchParams.get("url");
        if (!target) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Missing url param" }));
          return;
        }
        try {
          const upstream = await fetch(target, {
            headers: { "User-Agent": "PromptGenerator/1.0" },
            redirect: "follow"
          });
          if (!upstream.ok) {
            res.statusCode = upstream.status;
            res.end(JSON.stringify({ error: `Upstream ${upstream.status}` }));
            return;
          }
          const ct = upstream.headers.get("content-type") || "image/png";
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.setHeader("Content-Type", ct);
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(buf);
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: "Proxy fetch failed" }));
        }
      });
    }
  };
}
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Dev-only: forward /api/* to a running `vercel dev` (default :3939) so the
    // serverless functions (OpenAI, Supabase, etc.) work while vite serves the
    // UI. Override the target with VITE_API_PROXY. Has no effect in production.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY || "http://localhost:3939",
        changeOrigin: true,
        // Pass the browser's real host (localhost:8080) as X-Forwarded-Host so
        // API redirects (e.g. the Higgsfield sign-in callback) return to vite.
        xfwd: true
      }
    }
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "development" && imageProxyPlugin()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJjOlxcXFxVc2Vyc1xcXFxVc2VyXFxcXFByb21wdC1HZW5lcmF0b3JcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcImM6XFxcXFVzZXJzXFxcXFVzZXJcXFxcUHJvbXB0LUdlbmVyYXRvclxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vYzovVXNlcnMvVXNlci9Qcm9tcHQtR2VuZXJhdG9yL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCB0eXBlIFBsdWdpbiB9IGZyb20gXCJ2aXRlXCI7XHJcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCB7IGNvbXBvbmVudFRhZ2dlciB9IGZyb20gXCJsb3ZhYmxlLXRhZ2dlclwiO1xyXG5cclxuLyoqXHJcbiAqIERldi1vbmx5IG1pZGRsZXdhcmUgdGhhdCBwcm94aWVzIC9hcGkvaW1hZ2UtcHJveHkgcmVxdWVzdHMuXHJcbiAqIEluIHByb2R1Y3Rpb24sIFZlcmNlbCBzZXJ2ZXMgdGhlIHJlYWwgc2VydmVybGVzcyBmdW5jdGlvbiBhdCBhcGkvaW1hZ2UtcHJveHkudHMuXHJcbiAqL1xyXG5mdW5jdGlvbiBpbWFnZVByb3h5UGx1Z2luKCk6IFBsdWdpbiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG5hbWU6ICdpbWFnZS1wcm94eScsXHJcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XHJcbiAgICAgIHNlcnZlci5taWRkbGV3YXJlcy51c2UoJy9hcGkvaW1hZ2UtcHJveHknLCBhc3luYyAocmVxLCByZXMpID0+IHtcclxuICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJlcS51cmwgfHwgJy8nLCAnaHR0cDovL2xvY2FsaG9zdCcpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCd1cmwnKTtcclxuICAgICAgICBpZiAoIXRhcmdldCkge1xyXG4gICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSA0MDA7XHJcbiAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNaXNzaW5nIHVybCBwYXJhbScgfSkpO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgY29uc3QgdXBzdHJlYW0gPSBhd2FpdCBmZXRjaCh0YXJnZXQsIHtcclxuICAgICAgICAgICAgaGVhZGVyczogeyAnVXNlci1BZ2VudCc6ICdQcm9tcHRHZW5lcmF0b3IvMS4wJyB9LFxyXG4gICAgICAgICAgICByZWRpcmVjdDogJ2ZvbGxvdycsXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGlmICghdXBzdHJlYW0ub2spIHtcclxuICAgICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSB1cHN0cmVhbS5zdGF0dXM7XHJcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogYFVwc3RyZWFtICR7dXBzdHJlYW0uc3RhdHVzfWAgfSkpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBjb25zdCBjdCA9IHVwc3RyZWFtLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnaW1hZ2UvcG5nJztcclxuICAgICAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKGF3YWl0IHVwc3RyZWFtLmFycmF5QnVmZmVyKCkpO1xyXG4gICAgICAgICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgY3QpO1xyXG4gICAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgJyonKTtcclxuICAgICAgICAgIHJlcy5lbmQoYnVmKTtcclxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgIHJlcy5zdGF0dXNDb2RlID0gNTAyO1xyXG4gICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUHJveHkgZmV0Y2ggZmFpbGVkJyB9KSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH0sXHJcbiAgfTtcclxufVxyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4gKHtcclxuICBzZXJ2ZXI6IHtcclxuICAgIGhvc3Q6IFwiOjpcIixcclxuICAgIHBvcnQ6IDgwODAsXHJcbiAgICAvLyBEZXYtb25seTogZm9yd2FyZCAvYXBpLyogdG8gYSBydW5uaW5nIGB2ZXJjZWwgZGV2YCAoZGVmYXVsdCA6MzkzOSkgc28gdGhlXHJcbiAgICAvLyBzZXJ2ZXJsZXNzIGZ1bmN0aW9ucyAoT3BlbkFJLCBTdXBhYmFzZSwgZXRjLikgd29yayB3aGlsZSB2aXRlIHNlcnZlcyB0aGVcclxuICAgIC8vIFVJLiBPdmVycmlkZSB0aGUgdGFyZ2V0IHdpdGggVklURV9BUElfUFJPWFkuIEhhcyBubyBlZmZlY3QgaW4gcHJvZHVjdGlvbi5cclxuICAgIHByb3h5OiB7XHJcbiAgICAgIFwiL2FwaVwiOiB7XHJcbiAgICAgICAgdGFyZ2V0OiBwcm9jZXNzLmVudi5WSVRFX0FQSV9QUk9YWSB8fCBcImh0dHA6Ly9sb2NhbGhvc3Q6MzkzOVwiLFxyXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgICAvLyBQYXNzIHRoZSBicm93c2VyJ3MgcmVhbCBob3N0IChsb2NhbGhvc3Q6ODA4MCkgYXMgWC1Gb3J3YXJkZWQtSG9zdCBzb1xyXG4gICAgICAgIC8vIEFQSSByZWRpcmVjdHMgKGUuZy4gdGhlIEhpZ2dzZmllbGQgc2lnbi1pbiBjYWxsYmFjaykgcmV0dXJuIHRvIHZpdGUuXHJcbiAgICAgICAgeGZ3ZDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBwbHVnaW5zOiBbXHJcbiAgICByZWFjdCgpLFxyXG4gICAgbW9kZSA9PT0gXCJkZXZlbG9wbWVudFwiICYmIGNvbXBvbmVudFRhZ2dlcigpLFxyXG4gICAgbW9kZSA9PT0gXCJkZXZlbG9wbWVudFwiICYmIGltYWdlUHJveHlQbHVnaW4oKSxcclxuICBdLmZpbHRlcihCb29sZWFuKSxcclxuICByZXNvbHZlOiB7XHJcbiAgICBhbGlhczoge1xyXG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcclxuICAgIH0sXHJcbiAgfSxcclxufSkpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQW9SLFNBQVMsb0JBQWlDO0FBQzlULE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyx1QkFBdUI7QUFIaEMsSUFBTSxtQ0FBbUM7QUFTekMsU0FBUyxtQkFBMkI7QUFDbEMsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sZ0JBQWdCLFFBQVE7QUFDdEIsYUFBTyxZQUFZLElBQUksb0JBQW9CLE9BQU8sS0FBSyxRQUFRO0FBQzdELGNBQU0sTUFBTSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssa0JBQWtCO0FBQ3RELGNBQU0sU0FBUyxJQUFJLGFBQWEsSUFBSSxLQUFLO0FBQ3pDLFlBQUksQ0FBQyxRQUFRO0FBQ1gsY0FBSSxhQUFhO0FBQ2pCLGNBQUksSUFBSSxLQUFLLFVBQVUsRUFBRSxPQUFPLG9CQUFvQixDQUFDLENBQUM7QUFDdEQ7QUFBQSxRQUNGO0FBQ0EsWUFBSTtBQUNGLGdCQUFNLFdBQVcsTUFBTSxNQUFNLFFBQVE7QUFBQSxZQUNuQyxTQUFTLEVBQUUsY0FBYyxzQkFBc0I7QUFBQSxZQUMvQyxVQUFVO0FBQUEsVUFDWixDQUFDO0FBQ0QsY0FBSSxDQUFDLFNBQVMsSUFBSTtBQUNoQixnQkFBSSxhQUFhLFNBQVM7QUFDMUIsZ0JBQUksSUFBSSxLQUFLLFVBQVUsRUFBRSxPQUFPLFlBQVksU0FBUyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQ2hFO0FBQUEsVUFDRjtBQUNBLGdCQUFNLEtBQUssU0FBUyxRQUFRLElBQUksY0FBYyxLQUFLO0FBQ25ELGdCQUFNLE1BQU0sT0FBTyxLQUFLLE1BQU0sU0FBUyxZQUFZLENBQUM7QUFDcEQsY0FBSSxVQUFVLGdCQUFnQixFQUFFO0FBQ2hDLGNBQUksVUFBVSwrQkFBK0IsR0FBRztBQUNoRCxjQUFJLElBQUksR0FBRztBQUFBLFFBQ2IsU0FBUyxLQUFLO0FBQ1osY0FBSSxhQUFhO0FBQ2pCLGNBQUksSUFBSSxLQUFLLFVBQVUsRUFBRSxPQUFPLHFCQUFxQixDQUFDLENBQUM7QUFBQSxRQUN6RDtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBQ0Y7QUFHQSxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssT0FBTztBQUFBLEVBQ3pDLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUlOLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVEsUUFBUSxJQUFJLGtCQUFrQjtBQUFBLFFBQ3RDLGNBQWM7QUFBQTtBQUFBO0FBQUEsUUFHZCxNQUFNO0FBQUEsTUFDUjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixTQUFTLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUMxQyxTQUFTLGlCQUFpQixpQkFBaUI7QUFBQSxFQUM3QyxFQUFFLE9BQU8sT0FBTztBQUFBLEVBQ2hCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUN0QztBQUFBLEVBQ0Y7QUFDRixFQUFFOyIsCiAgIm5hbWVzIjogW10KfQo=
