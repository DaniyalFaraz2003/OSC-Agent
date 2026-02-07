import fs from 'fs/promises';
import path from 'path';
import { PersistedState } from './states';

export class StateStore {
  constructor(private storagePath: string) {}

  async save(state: PersistedState): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  async load(): Promise<PersistedState | null> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      return JSON.parse(data) as PersistedState;
    } catch (error) {
      return null;
    }
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.storagePath);
      return true;
    } catch {
      return false;
    }
  }
}
