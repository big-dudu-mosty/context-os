import cors from "cors";
import { config } from "dotenv";
import express from "express";
import { closeDb } from "./db";
import routes from "./routes";

config();

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

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
