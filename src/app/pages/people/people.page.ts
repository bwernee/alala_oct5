import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';

interface PeopleCard {
  id?: string;
  label?: string;
  image?: string;
  audio?: string;
  duration?: number; // seconds, optional (saved from add page)
}

@Component({
  selector: 'app-people',
  templateUrl: './people.page.html',
  styleUrls: ['./people.page.scss'],
  standalone: false
})
export class PeoplePage implements OnInit, OnDestroy {
  peopleCards: PeopleCard[] = [];
  currentCard: PeopleCard | null = null;
  currentIndex = 0;

  isPatientMode = false;

  currentAudio: HTMLAudioElement | null = null;
  isPlaying = false;

  currentTime = 0;
  duration = 0; // seconds
  private rafId: number | null = null;

  // Skip tracking
  skipCount = 0;
  skippedCardIds: string[] = [];

  private modeListener = (e: any) => {
    this.isPatientMode = !!e?.detail;
  };

  constructor(private router: Router, private alertCtrl: AlertController) {}

  ngOnInit() {
    this.loadPatientMode();
    this.peopleCards = this.getCards();
    if (this.peopleCards.length > 0) this.setCard(0);

    // React to Patient Mode changes from Home
    window.addEventListener('patientMode-changed', this.modeListener);
  }

  // Refresh when returning from Add page
  ionViewWillEnter() {
    this.peopleCards = this.getCards();
    if (this.peopleCards.length === 0) {
      this.currentCard = null;
      this.stopAudio();
    } else if (!this.currentCard) {
      this.setCard(0);
    } else {
      // Ensure index still valid
      const idx = Math.min(this.currentIndex, this.peopleCards.length - 1);
      this.setCard(idx);
    }
  }

  ngOnDestroy() {
    window.removeEventListener('patientMode-changed', this.modeListener);
    this.stopAudio();
    this.persistSessionHistory();
  }

  // ===== Patient mode =====
  private loadPatientMode() {
    try {
      this.isPatientMode = localStorage.getItem('patientMode') === 'true';
    } catch { this.isPatientMode = false; }
  }

  // ===== Data IO =====
  private getCards(): PeopleCard[] {
    try { return JSON.parse(localStorage.getItem('peopleCards') || '[]'); }
    catch { return []; }
  }
  private saveCards(cards: PeopleCard[]) {
    localStorage.setItem('peopleCards', JSON.stringify(cards));
  }

  // ===== Card navigation =====
  setCard(index: number) {
    if (this.peopleCards.length === 0) {
      this.currentCard = null;
      this.stopAudio();
      return;
    }
    this.currentIndex = (index + this.peopleCards.length) % this.peopleCards.length;
    this.currentCard = this.peopleCards[this.currentIndex];

    const storedDur = Number(this.currentCard?.duration ?? 0);
    this.buildPlayer(this.currentCard?.audio, storedDur);
  }
  nextCard() { this.setCard(this.currentIndex + 1); }
  prevCard() { this.setCard(this.currentIndex - 1); }

  // ===== Skip (recorded) =====
  skipCurrent() {
    if (!this.currentCard) return;
    this.skipCount++;
    if (this.currentCard.id) this.skippedCardIds.push(this.currentCard.id);
    this.nextCard();
  }

  // ===== Audio =====
  private buildPlayer(src?: string, storedDuration?: number) {
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

    // Fallback to metadata duration
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

  // ===== Add / Delete =====
  // Navigate instead of modal

  async deleteCurrentCard() {
  if (!this.currentCard) return;

  const alert = await this.alertCtrl.create({
    header: 'Delete Person',
    message: `Remove “${this.currentCard.label || 'this person'}”?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => {
          const idx = this.currentIndex;
          const list = this.getCards();
          list.splice(idx, 1);
          this.saveCards(list);
          this.peopleCards = list;

          if (this.peopleCards.length > 0) {
            this.setCard(Math.min(idx, this.peopleCards.length - 1));
          } else {
            this.currentCard = null;
            this.stopAudio();
          }
        }
      }
    ]
  });

  await alert.present();
}


  // ===== Persist session stats =====
  private persistSessionHistory() {
    try {
      const key = 'peopleViewHistory';
      const history: any[] = JSON.parse(localStorage.getItem(key) || '[]');
      history.push({
        endedAt: new Date().toISOString(),
        totalCards: this.peopleCards.length,
        skipCount: this.skipCount,
        skippedCardIds: this.skippedCardIds
      });
      localStorage.setItem(key, JSON.stringify(history));
    } catch {}
  }
}

/* Simple ID helper (kept in case you reuse) */
function cryptoRandomId() {
  if ('randomUUID' in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
