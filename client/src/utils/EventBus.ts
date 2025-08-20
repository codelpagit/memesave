type EventCallback<T = any> = (data: T) => void;
type EventMap = Record<string, EventCallback[]>;

class EventBus {
  private events: EventMap = {};
  private static instance: EventBus;
  
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
  
  // Event dinleyici ekle
  on<T = any>(event: string, callback: EventCallback<T>): () => void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    
    // Cleanup function döndür
    return () => this.off(event, callback);
  }
  
  // Event dinleyici kaldır
  off<T = any>(event: string, callback: EventCallback<T>): void {
    if (!this.events[event]) return;
    
    const index = this.events[event].indexOf(callback);
    if (index > -1) {
      this.events[event].splice(index, 1);
    }
  }
  
  // Event tetikle
  emit<T = any>(event: string, data?: T): void {
    if (!this.events[event]) return;
    
    this.events[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Event Bus Error [${event}]:`, error);
      }
    });
  }
  
  // Tüm event'leri temizle
  clear(): void {
    this.events = {};
  }
  
  // Debug için event listesi
  getEvents(): string[] {
    return Object.keys(this.events);
  }
}

export const eventBus = EventBus.getInstance();
export default EventBus;