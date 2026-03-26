import Fastify from "fastify";

const PORT = 4060;
const SERVICE = "@unykorn/intelligence-center";

const server = Fastify({ logger: true });

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
server.get("/health", async () => ({
  service: SERVICE,
  status: "healthy",
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------
server.get("/signals", async () => ({
  signals: [
    {
      id: "sig-001",
      type: "price-movement",
      source: "market-data-mcp",
      symbol: "ETH",
      description: "ETH price crossed $4,200 resistance level",
      severity: "info",
      timestamp: "2026-03-26T11:30:00Z",
    },
    {
      id: "sig-002",
      type: "volume-spike",
      source: "market-data-mcp",
      symbol: "UNY",
      description: "UNY trading volume up 340% in last hour",
      severity: "warning",
      timestamp: "2026-03-26T11:45:00Z",
    },
    {
      id: "sig-003",
      type: "regulatory",
      source: "news-mcp",
      description: "EU MiCA regulation enforcement update — new stablecoin rules",
      severity: "high",
      timestamp: "2026-03-26T12:00:00Z",
    },
  ],
  total: 3,
}));

// ---------------------------------------------------------------------------
// Market summary
// ---------------------------------------------------------------------------
server.get("/market/summary", async () => ({
  market: {
    totalMarketCap: "2.8T",
    btcDominance: 52.3,
    ethDominance: 18.1,
    defiTvl: "142B",
    fearGreedIndex: 68,
    fearGreedLabel: "Greed",
    topMovers: [
      { symbol: "ETH", change24h: 5.2 },
      { symbol: "SOL", change24h: 3.8 },
      { symbol: "UNY", change24h: 12.1 },
    ],
  },
  updatedAt: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------
server.get("/competitors", async () => ({
  competitors: [
    {
      name: "CompetitorAlpha",
      category: "AI Agent Platform",
      threatLevel: "medium",
      recentActivity: "Launched new agent marketplace",
      lastUpdated: "2026-03-25T08:00:00Z",
    },
    {
      name: "CompetitorBeta",
      category: "Token Settlement",
      threatLevel: "low",
      recentActivity: "Announced Series B funding",
      lastUpdated: "2026-03-24T14:00:00Z",
    },
  ],
  total: 2,
}));

// ---------------------------------------------------------------------------
// Sentiment
// ---------------------------------------------------------------------------
server.get("/sentiment", async () => ({
  overall: {
    score: 0.72,
    label: "Bullish",
    sampleSize: 12400,
  },
  bySource: [
    { source: "twitter", score: 0.68, label: "Bullish", sampleSize: 8200 },
    { source: "reddit", score: 0.75, label: "Bullish", sampleSize: 3100 },
    { source: "news", score: 0.78, label: "Bullish", sampleSize: 1100 },
  ],
  trending: ["UNY", "AI agents", "machine settlement", "x402"],
  updatedAt: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
server.post<{ Body: { name: string; condition: string; threshold: number; channel: string } }>(
  "/alerts",
  async (request) => ({
    alertId: `alert-${Date.now()}`,
    name: request.body.name,
    condition: request.body.condition,
    threshold: request.body.threshold,
    channel: request.body.channel,
    status: "active",
    createdAt: new Date().toISOString(),
  }),
);

server.get("/alerts", async () => ({
  alerts: [
    {
      alertId: "alert-001",
      name: "UNY Volume Spike",
      condition: "volume_24h > threshold",
      threshold: 100000,
      channel: "slack",
      status: "active",
      triggeredCount: 3,
      lastTriggeredAt: "2026-03-26T11:45:00Z",
      createdAt: "2026-03-20T10:00:00Z",
    },
    {
      alertId: "alert-002",
      name: "ETH Price Drop",
      condition: "price_change_1h < threshold",
      threshold: -5,
      channel: "email",
      status: "active",
      triggeredCount: 0,
      lastTriggeredAt: null,
      createdAt: "2026-03-22T15:00:00Z",
    },
  ],
  total: 2,
}));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const start = async () => {
  try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    server.log.info(`${SERVICE} listening on port ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
