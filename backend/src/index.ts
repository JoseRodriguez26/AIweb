import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildServer({
  dbPath: process.env.DB_PATH ?? "data/aiweb.db",
  uploadDir: process.env.UPLOAD_DIR ?? "data/uploads",
});

app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`AIweb backend listening on http://localhost:${port}`);
});
