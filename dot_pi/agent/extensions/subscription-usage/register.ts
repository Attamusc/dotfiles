export interface UsageEventHandlers<Context> {
  sessionStart(event: unknown, ctx: Context): unknown;
  modelSelect(event: any, ctx: Context): unknown;
  agentSettled(event: unknown, ctx: Context): unknown;
  sessionShutdown(event: unknown, ctx: Context): unknown;
  usage(args: string, ctx: Context): unknown;
}

export interface UsageRegistrationApi {
  on(event: string, handler: (event: any, ctx: any) => unknown): void;
  registerCommand(name: string, command: {
    description: string;
    handler: (args: string, ctx: any) => unknown;
  }): void;
}

export function registerUsageEvents<Context>(
  pi: UsageRegistrationApi,
  handlers: UsageEventHandlers<Context>,
): void {
  pi.on("session_start", handlers.sessionStart);
  pi.on("model_select", handlers.modelSelect);
  pi.on("agent_settled", handlers.agentSettled);
  pi.on("session_shutdown", handlers.sessionShutdown);
  pi.registerCommand("usage", {
    description: "Show Codex and Claude subscription usage",
    handler: handlers.usage,
  });
}
