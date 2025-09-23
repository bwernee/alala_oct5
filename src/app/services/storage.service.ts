import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private _storage: Storage | null = null;

  constructor(private storage: Storage) {
    this.init();
  }

  async init() {
    this._storage = await this.storage.create();
  }

  async set(key: string, value: any) {
    await this._storage?.set(key, value);
  }

  async get(key: string) {
    return await this._storage?.get(key);
  }

  async getAllFlashcards() {
    const cards: any[] = [];
    await this._storage?.forEach((v, k) => {
      if (k.startsWith('flashcard_')) cards.push(v);
    });
    return cards;
  }

  async remove(key: string) {
    await this._storage?.remove(key);
  }
}
