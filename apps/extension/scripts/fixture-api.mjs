import { createServer } from "node:http";

const observations = new Map();
const host = process.env.PLATEGO_FIXTURE_API_HOST || "::1";
const port = Number(process.env.PLATEGO_FIXTURE_API_PORT || 8789);

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/v1/pools/observations/summary") {
    const values = [...observations.values()];
    json(response, 200, {
      total: values.length,
      simulation: values.filter((item) => item.namespace === "simulation").length,
      live: values.filter((item) => item.namespace === "live").length
    });
    return;
  }
  if (request.method !== "POST" || request.url !== "/v1/pools/observations") {
    json(response, 404, { error: "NOT_FOUND" });
    return;
  }

  let raw = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 1_000_000) request.destroy();
  });
  request.on("end", () => {
    try {
      const observation = JSON.parse(raw);
      if (observation.namespace !== "simulation" || observation.source !== "official-mock") {
        json(response, 400, { error: "FIXTURE_SCOPE_MISMATCH" });
        return;
      }
      const deduplicated = observations.has(observation.observationHash);
      observations.set(observation.observationHash, observation);
      json(response, deduplicated ? 200 : 201, {
        accepted: true,
        deduplicated,
        observationHash: observation.observationHash
      });
    } catch {
      json(response, 400, { error: "INVALID_JSON" });
    }
  });
});

server.listen(port, host, () => {
  console.log(`PlateGo extension fixture API listening on http://localhost:${port} (${host})`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
