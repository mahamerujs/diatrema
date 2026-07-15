type Listener<T extends any[]> = (...args: T) => void;

export class EventEmitter<Events extends Record<string, any[]>> {
    private listeners = new Map<keyof Events, Listener<any[]>[]>();

    on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event)!.push(listener as Listener<any[]>);
    }

    off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
        const list = this.listeners.get(event);

        if (!list) return;

        const index = list.findIndex(
            (l) => l === listener || (l as any).original === listener
        );

        if (index !== -1) list.splice(index, 1);
    }

    emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
        const list = this.listeners.get(event);

        if (list) {
            [...list].forEach((listener) => listener(...args));
        }
    }

    once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
        const onceListener = (...args: Events[K]) => {
            listener(...args);

            this.off(event, onceListener as any);
        };

        onceListener.original = listener;

        this.on(event, onceListener as any);
    }

    removeAllListeners<K extends keyof Events>(event?: K): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }
}
