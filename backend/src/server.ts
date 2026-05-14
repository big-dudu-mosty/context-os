import cors from "cors";
import { config } from "dotenv";
import express from "express";
import { join } from "path";
import { closeDb } from "./db";
import routes from "./routes";

config({ override: true });

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

app.use("/api", routes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Error:", err);
    res.status(500).json({
      error: err.message || "Internal server error",
    });
  },
);

const server = app.listen(port, () => {
  console.log(`Context OS API server running on http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "mock" || apiKey === "test") {
    console.log("");
    console.log("WARNING: Running in MOCK mode");
    console.log("   Set OPENAI_API_KEY in .env for real LLM responses");
    console.log("");
  }
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => {
    void closeDb().finally(() => process.exit(0));
  });
}

process.once("SIGINT", () => {
  shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});

export default app;
