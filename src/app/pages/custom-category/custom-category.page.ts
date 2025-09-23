import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController, ActionSheetController } from '@ionic/angular';

type UUID = string;

interface UserCategory {
  id: UUID;
  name: string;
  description?: string;
  emoji?: string;
  createdAt: number;
}

interface RawFlashcard {
  id: UUID;
  categoryId: UUID;
  type: 'photo' | 'video' | 'manual';
  src: string;
  label?: string;
  audio?: string | null;
  duration?: number; // seconds
  createdAt: number;
}

interface DisplayCard {
  id: UUID;
  label: string;
  image: string;       // from src
  audio?: string | null;
  duration?: number;   // seconds
}

const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX   = 'alala_cards_';

@Component({
  selector: 'app-custom-category',
  templateUrl: './custom-category.page.html',
  styleUrls: ['./custom-category.page.scss'],
  standalone: false
})
export class CustomCategoryPage implements OnInit, OnDestroy {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('videoInput') videoInput!: ElementRef<HTMLInputElement>;

  id = '';
  title = 'Category';
  description?: string;
  emoji = '🗂️';

  isPatientMode = localStorage.getItem('patientMode') === 'true';

  // single-flashcard view data
  displayCards: DisplayCard[] = [];
  currentCard: DisplayCard | null = null;
  currentIndex = 0;

  // audio player state
  currentAudio: HTMLAudioElement | null = null;
  isPlaying = false;
  currentTime = 0;
  duration = 0;
  private rafId: number | null = null;

  private modeListener = (e: any) => {
    this.isPatientMode = !!e?.detail;
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController
  ) {}

  ngOnInit() {
    window.addEventListener('patientMode-changed', this.modeListener);

    // Which category?
    this.id = this.route.snapshot.paramMap.get('id') || '';

    // Prefer fast name via router state
    const state = this.router.getCurrentNavigation()?.extras?.state as { categoryName?: string } | undefined;
    if (state?.categoryName) {
      this.title = state.categoryName;
    }

    // Ensure full info from storage
    const cat = this.findCategoryById(this.id);
    if (cat) {
      this.title = cat.name || this.title;
      this.description = cat.description;
      this.emoji = cat.emoji || this.emoji;
    }

    this.loadDisplayCards();
  }

  ionViewWillEnter() {
    this.loadDisplayCards();
  }

  ngOnDestroy() {
    window.removeEventListener('patientMode-changed', this.modeListener);
    this.stopAudio();
  }

  /* ---------- Storage helpers ---------- */
  private getAllCategories(): UserCategory[] {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      return raw ? (JSON.parse(raw) as UserCategory[]) : [];
    } catch { return []; }
  }
  private findCategoryById(id: string): UserCategory | undefined {
    return this.getAllCategories().find(c => c.id === id);
  }
  private cardsKey(): string {
    return `${CARDS_PREFIX}${this.id}`;
  }

  private loadDisplayCards() {
    const raw = this.getRawCards();
    // Only use photo cards so UI matches People page
    const photos = raw.filter(c => c.type === 'photo');
    this.displayCards = photos.map(c => ({
      id: c.id,
      label: c.label || 'Untitled',
      image: c.src,
      audio: c.audio || null,
      duration: c.duration || 0
    }));

    if (this.displayCards.length > 0) {
      this.setCard(Math.min(this.currentIndex, this.displayCards.length - 1));
    } else {
      this.currentCard = null;
      this.stopAudio();
    }
  }

  private getRawCards(): RawFlashcard[] {
    try {
      const raw = localStorage.getItem(this.cardsKey());
      return raw ? (JSON.parse(raw) as RawFlashcard[]) : [];
    } catch { return []; }
  }
  private saveRawCards(list: RawFlashcard[]) {
    localStorage.setItem(this.cardsKey(), JSON.stringify(list));
  }

  /* ---------- Add / Delete ---------- */
  onAddCard() {
    if (this.isPatientMode) return;
    // Navigate to Add Flashcard with defaults so it saves here
    this.router.navigate(['/add-flashcard'], {
      state: { defaultCategoryId: this.id, defaultCategoryName: this.title },
      queryParams: { defaultCategoryId: this.id }
    });
  }

  async onDeleteCategory() {
    if (this.isPatientMode) return;
    const alert = await this.alertCtrl.create({
      header: 'Remove Category',
      message: `Remove “${this.title}”? This only removes the category; your media stays in your library.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            const list = this.getAllCategories().filter(c => c.id !== this.id);
            localStorage.setItem(CATEGORIES_KEY, JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('categories-updated', { detail: list }));
            this.presentToast('Category removed', 'success');
            this.router.navigate(['/home']);
          }
        }
      ]
    });
    await alert.present();
  }

  deleteCurrentCard() {
    if (!this.currentCard) return;

    const raw = this.getRawCards();
    const idxInRaw = raw.findIndex(r => r.id === this.currentCard!.id);
    if (idxInRaw >= 0) {
      raw.splice(idxInRaw, 1);
      this.saveRawCards(raw);
    }

    // Refresh view
    const prevIndex = this.currentIndex;
    this.loadDisplayCards();
    if (this.displayCards.length > 0) {
      this.setCard(Math.min(prevIndex, this.displayCards.length - 1));
    } else {
      this.currentCard = null;
      this.stopAudio();
    }
  }

  /* ---------- Card navigation ---------- */
  setCard(index: number) {
    if (this.displayCards.length === 0) {
      this.currentCard = null;
      this.stopAudio();
      return;
    }
    this.currentIndex = (index + this.displayCards.length) % this.displayCards.length;
    this.currentCard = this.displayCards[this.currentIndex];

    const storedDur = Number(this.currentCard?.duration ?? 0);
    this.buildPlayer(this.currentCard?.audio || null, storedDur);
  }
  nextCard() { this.setCard(this.currentIndex + 1); }
  prevCard() { this.setCard(this.currentIndex - 1); }

  /* ---------- Audio ---------- */
  private buildPlayer(src: string | null, storedDuration?: number) {
    this.stopAudio();

    if (!src) {
      this.duration = 0;
      return;
    }

    this.currentAudio = new Audio(src);
    this.currentAudio.preload = 'metadata';
    this.isPlaying = false;
    this.currentTime = 0;

    // Prefer saved duration
    if (storedDuration && isFinite(storedDuration) && storedDuration > 0) {
      this.duration = storedDuration;
    } else {
      this.duration = 0;
    }

    this.currentAudio.addEventListener('loadedmetadata', () => {
      const metaDur = Number(this.currentAudio?.duration || 0);
      if ((!this.duration || this.duration <= 0) && isFinite(metaDur) && metaDur > 0) {
        this.duration = metaDur;
      }
    });

    this.currentAudio.addEventListener('timeupdate', () => {
      this.currentTime = this.currentAudio?.currentTime || 0;
    });

    this.currentAudio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.stopRaf();
    });
  }

  toggleAudio() {
    if (!this.currentAudio) return;
    if (this.isPlaying) {
      this.currentAudio.pause();
      this.isPlaying = false;
      this.stopRaf();
    } else {
      this.currentAudio.play()
        .then(() => {
          this.isPlaying = true;
          this.startRaf();
        })
        .catch(err => {
          console.error('Audio play failed:', err);
          this.isPlaying = false;
          this.stopRaf();
        });
    }
  }

  private startRaf() {
    this.stopRaf();
    const tick = () => {
      if (this.currentAudio && this.isPlaying) {
        this.currentTime = this.currentAudio.currentTime;
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }
  private stopRaf() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  stopAudio() {
    this.stopRaf();
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch {}
      try { this.currentAudio.src = ''; } catch {}
      this.currentAudio = null;
    }
    this.isPlaying = false;
    this.currentTime = 0;
  }

  seekAudio(event: any) {
    if (!this.currentAudio) return;
    const t = Number(event.detail.value ?? 0);
    if (isFinite(t)) {
      this.currentAudio.currentTime = t;
      this.currentTime = this.currentAudio.currentTime;
    }
  }

  formatTime(time: number): string {
    if (!isFinite(time) || isNaN(time) || time < 0) return '0:00';
    const total = Math.floor(time + 0.5);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }

  /* ---------- Toast ---------- */
  private async presentToast(
    message: string,
    color: 'success' | 'warning' | 'danger' | 'primary' = 'primary'
  ) {
    const toast = await this.toastCtrl.create({ message, duration: 1600, color, position: 'bottom' });
    await toast.present();
  }
}
