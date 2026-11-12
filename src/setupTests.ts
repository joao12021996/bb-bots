// Runs before every test file (Create React App picks this file up automatically).

// jsdom's localStorage schedules a "storage" event timer on every write, and each timer keeps the old and new
// values. Player mode autosaves on every step, and the tests play whole seasons synchronously, so the timers
// never get to run: thousands of copies of the save piled up until the test process ran out of memory.
// A plain in-memory Storage behaves the same for the game, without the timers.
class MemoryStorage implements Storage {
    private items = new Map<string, string>();
    get length() {
        return this.items.size;
    }
    clear() {
        this.items.clear();
    }
    getItem(key: string) {
        return this.items.has(key) ? (this.items.get(key) as string) : null;
    }
    key(index: number) {
        return Array.from(this.items.keys())[index] ?? null;
    }
    removeItem(key: string) {
        this.items.delete(key);
    }
    setItem(key: string, value: string) {
        this.items.set(key, String(value));
    }
}

Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), configurable: true });
Object.defineProperty(window, "sessionStorage", { value: new MemoryStorage(), configurable: true });

export {};
