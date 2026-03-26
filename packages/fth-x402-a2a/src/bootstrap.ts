/**
 * FTH x402 A2A — Bootstrap
 *
 * Creates and wires together the complete A2A agent network:
 *   L2 Control: Orchestrator, Guardian, Compliance, Budget
 *   L3 Commerce: Quote, Payment, Treasury, Receipt
 *   L4 Work: Delivery, Search, Settlement, Outreach
 *
 * Call `bootstrapA2ANetwork()` to start everything.
 */

import { TaskManager } from "./task";
import { EventBus } from "./events";
import { AgentRegistry, RoutingEngine, DEFAULT_ROUTE_RULES } from "./registry";

// Agents
import {
  OrchestratorAgent,
  createOrchestratorCard,
} from "./agents/orchestrator";
import { GuardianAgent, createGuardianCard } from "./agents/control";
import { ComplianceAgent, createComplianceCard } from "./agents/control";
import { BudgetAgent, createBudgetCard } from "./agents/control";
import { QuoteAgent, createQuoteCard } from "./agents/commerce";
import { PaymentAgent, createPaymentCard } from "./agents/commerce";
import { TreasuryAgent, createTreasuryAgentCard } from "./agents/commerce";
import { ReceiptAgent, createReceiptCard } from "./agents/commerce";
import { DeliveryAgent, createDeliveryCard } from "./agents/work";
import { SearchAgent, createSearchCard } from "./agents/work";
import { SettlementAgent, createSettlementCard } from "./agents/work";
import { OutreachAgent, createOutreachCard } from "./agents/work";
import type { BaseAgent } from "./agents/base-agent";

// ═══════════════════════════════════════════════════════════
// Network Configuration
// ═══════════════════════════════════════════════════════════

export interface A2ANetworkConfig {
  /** Base URL for the A2A agent endpoints. */
  baseUrl: string;
  /** Event bus options. */
  eventBusDebug?: boolean;
  /** Task manager max tasks. */
  maxTasks?: number;
  /** Custom route rules (merged with defaults). */
  extraRouteRules?: import("./types").RouteRule[];
}

export interface A2ANetwork {
  /** Shared infrastructure. */
  taskManager: TaskManager;
  eventBus: EventBus;
  registry: AgentRegistry;
  router: RoutingEngine;

  /** All agents indexed by role. */
  agents: {
    orchestrator: OrchestratorAgent;
    guardian: GuardianAgent;
    compliance: ComplianceAgent;
    budget: BudgetAgent;
    quote: QuoteAgent;
    payment: PaymentAgent;
    treasury: TreasuryAgent;
    receipt: ReceiptAgent;
    delivery: DeliveryAgent;
    search: SearchAgent;
    settlement: SettlementAgent;
    outreach: OutreachAgent;
  };

  /** All agents as a flat array. */
  allAgents: BaseAgent[];

  /** Start all agents. */
  start(): Promise<void>;

  /** Stop all agents and cleanup. */
  stop(): Promise<void>;
}

// ═══════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════

/**
 * Create and wire the complete A2A agent network.
 *
 * @param config Network configuration
 * @returns A2ANetwork with all agents ready to start
 */
export function createA2ANetwork(config: A2ANetworkConfig): A2ANetwork {
  const { baseUrl } = config;

  // Shared infrastructure
  const taskManager = new TaskManager({ maxTasks: config.maxTasks });
  const eventBus = new EventBus({ debug: config.eventBusDebug });
  const registry = new AgentRegistry({}, eventBus);

  // Routing engine with default + custom rules
  const rules = [...DEFAULT_ROUTE_RULES, ...(config.extraRouteRules ?? [])];
  const router = new RoutingEngine(registry, rules);

  // Common config factory
  const agentConfig = (id: string, card: import("./types").AgentCard, layer: import("./types").AgentLayer, role: import("./types").AgentRole) => ({
    id,
    card,
    layer,
    role,
    endpoint: `${baseUrl}/a2a/${role}`,
    taskManager,
    eventBus,
    registry,
  });

  // ── L2 Control Plane ──────────────────────────────────

  const guardian = new GuardianAgent(
    agentConfig("fth-guardian-agent", createGuardianCard(baseUrl), "control", "guardian"),
  );

  const compliance = new ComplianceAgent(
    agentConfig("fth-compliance-agent", createComplianceCard(baseUrl), "control", "compliance"),
  );

  const budget = new BudgetAgent(
    agentConfig("fth-budget-agent", createBudgetCard(baseUrl), "control", "budget"),
  );

  const orchestrator = new OrchestratorAgent({
    ...agentConfig("fth-orchestrator", createOrchestratorCard(baseUrl), "control", "orchestrator"),
    routingEngine: router,
  });

  // ── L3 Commerce Plane ─────────────────────────────────

  const quote = new QuoteAgent(
    agentConfig("fth-quote-agent", createQuoteCard(baseUrl), "commerce", "quote"),
  );

  const payment = new PaymentAgent(
    agentConfig("fth-payment-agent", createPaymentCard(baseUrl), "commerce", "payment"),
  );

  const treasury = new TreasuryAgent(
    agentConfig("fth-treasury-agent", createTreasuryAgentCard(baseUrl), "commerce", "treasury"),
  );

  const receipt = new ReceiptAgent(
    agentConfig("fth-receipt-agent", createReceiptCard(baseUrl), "commerce", "receipt"),
  );

  // ── L4 Work Plane ─────────────────────────────────────

  const delivery = new DeliveryAgent(
    agentConfig("fth-delivery-agent", createDeliveryCard(baseUrl), "work", "delivery"),
  );

  const search = new SearchAgent(
    agentConfig("fth-search-agent", createSearchCard(baseUrl), "work", "search"),
  );

  const settlement = new SettlementAgent(
    agentConfig("fth-settlement-agent", createSettlementCard(baseUrl), "work", "settlement"),
  );

  const outreach = new OutreachAgent(
    agentConfig("fth-outreach-agent", createOutreachCard(baseUrl), "work", "outreach"),
  );

  const agents = {
    orchestrator,
    guardian,
    compliance,
    budget,
    quote,
    payment,
    treasury,
    receipt,
    delivery,
    search,
    settlement,
    outreach,
  };

  const allAgents: BaseAgent[] = Object.values(agents);

  return {
    taskManager,
    eventBus,
    registry,
    router,
    agents,
    allAgents,

    async start() {
      // Start in order: work → commerce → control (bottom-up)
      // so dependencies are registered before hubs
      const startOrder = [
        // L4 Work
        delivery, search, settlement, outreach,
        // L3 Commerce
        quote, payment, treasury, receipt,
        // L2 Control
        guardian, compliance, budget,
        // Hub last
        orchestrator,
      ];

      for (const agent of startOrder) {
        await agent.start();
      }

      registry.startHealthChecks();
      console.log(`[A2A] Network started: ${allAgents.length} agents registered`);
    },

    async stop() {
      registry.stopHealthChecks();
      for (const agent of allAgents) {
        await agent.stop();
      }
      eventBus.clear();
      console.log("[A2A] Network stopped");
    },
  };
}
