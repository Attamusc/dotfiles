export interface RequestTicket {
  providerId: string;
  generation: number;
  sequence: number;
}

export class LatestRequestGate {
  private generation = 0;
  private readonly sequences = new Map<string, number>();

  reset(): void {
    this.generation++;
    this.sequences.clear();
  }

  start(providerId: string): RequestTicket {
    const sequence = (this.sequences.get(providerId) ?? 0) + 1;
    this.sequences.set(providerId, sequence);
    return { providerId, generation: this.generation, sequence };
  }

  isCurrent(ticket: RequestTicket): boolean {
    return ticket.generation === this.generation &&
      ticket.sequence === this.sequences.get(ticket.providerId);
  }
}
