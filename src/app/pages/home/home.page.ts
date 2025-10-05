import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';

type UUID = string;

interface UserCategory {
  id: UUID;
  name: string;
  description?: string;
  emoji?: string; // optional future
  createdAt: number;
}

const CATEGORIES_KEY = 'alala_custom_categories_v1';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit, OnDestroy {
  isPatientMode = false;

  // Custom categories persisted by the user
  userCategories: UserCategory[] = [];

  // profile values shown in the header
  userPhoto = '';
  userName = '';

  // Today's progress stats
  todayStats = {
    accuracy: 0,
    cardsToday: 0,
    avgTime: 0
  };

  // listeners
  private profileListener?: (e: any) => void;

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private firebaseService: FirebaseService
  ) {}

  ngOnInit() {
    this.isPatientMode = localStorage.getItem('patientMode') === 'true';
    this.loadCategories();
    this.loadUserProfile();
    this.loadTodayStats();

    // Update Home immediately when Settings saves profile
    this.profileListener = () => this.loadUserProfile();
    window.addEventListener('user-profile-updated', this.profileListener);
  }

  ngOnDestroy(): void {
    if (this.profileListener) {
      window.removeEventListener('user-profile-updated', this.profileListener);
    }
  }

  ionViewWillEnter() {
    // Refresh today's stats when user returns to home page
    this.loadTodayStats();
  }

  async loadTodayStats() {
    try {
      // Check if user is authenticated
      const currentUser = this.firebaseService.getCurrentUser();
      if (!currentUser) {
        console.log('📊 User not authenticated, showing empty stats');
        this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
        return;
      }

      // Get today's sessions
      const todaySessions = await this.getTodaySessions();

      if (todaySessions.length === 0) {
        this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
        return;
      }

      // Calculate today's stats
      const totalQuestions = todaySessions.reduce((sum: number, s: any) => sum + s.totalQuestions, 0);
      const totalCorrect = todaySessions.reduce((sum: number, s: any) => sum + s.correctAnswers, 0);
      const totalTime = todaySessions.reduce((sum: number, s: any) => sum + s.totalTime, 0);

      this.todayStats = {
        accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
        cardsToday: totalQuestions,
        avgTime: totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0
      };

      console.log('📊 Today\'s stats loaded:', this.todayStats);
    } catch (error) {
      console.error('Error loading today\'s stats:', error);
      this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
    }
  }

  async getTodaySessions() {
    try {
      const allSessions = await this.firebaseService.getUserGameSessions();

      // Filter for today's sessions
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      const todaySessions = allSessions.filter((session: any) => {
        let sessionDate: Date;
        if (typeof session.timestamp === 'string') {
          sessionDate = new Date(session.timestamp);
        } else if (typeof session.timestamp === 'number') {
          sessionDate = new Date(session.timestamp);
        } else {
          return false;
        }

        return sessionDate >= startOfDay && sessionDate <= endOfDay;
      });

      return todaySessions;
    } catch (error) {
      console.error('Error getting today\'s sessions:', error);
      // Fallback to localStorage (per-user)
      const uid = localStorage.getItem('userId');
      const key = uid ? `gameSessions:${uid}` : 'gameSessions';
      const sessions = localStorage.getItem(key);
      if (!sessions) return [];

      const allSessions = JSON.parse(sessions);
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      return allSessions.filter((session: any) => {
        const sessionDate = new Date(session.timestamp);
        return sessionDate >= startOfDay && sessionDate <= endOfDay;
      });
    }
  }

  /* ---------------- Profile ---------------- */
  private loadUserProfile() {
    try {
      const raw = localStorage.getItem('userData');
      const data = raw ? JSON.parse(raw) : {};
      this.userPhoto = data?.photo || '';
      this.userName  = data?.name  || '';
    } catch {
      this.userPhoto = '';
      this.userName  = '';
    }
  }

  /* ---------------- Patient Mode ---------------- */
  // Enable via card button
  async enablePatientMode() {
    const savedPin = localStorage.getItem('caregiverPin');

    // If no password exists yet, require setting it first in Settings
    if (!savedPin) {
      const alert = await this.alertCtrl.create({
        header: 'Set Caregiver Password',
        message:
          'To use Patient Mode, please create a caregiver password first. You will need it to exit Patient Mode.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Go to Settings',
            handler: () => this.router.navigate(['/settings'])
          }
        ],
        backdropDismiss: false
      });
      await alert.present();
      return;
    }

    // Password exists → allow entering Patient Mode
    this.isPatientMode = true;
    localStorage.setItem('patientMode', 'true');
    this.presentToast('Patient Mode enabled');
    // notify others (e.g., pages listening)
    window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: true }));
  }

  // Header chip toggle behavior
  async onPatientModeToggle() {
    if (!this.isPatientMode) {
      // Try to enable; will enforce "set password first" if missing
      await this.enablePatientMode();
      return;
    }
    // Exiting still requires password (unchanged)
    await this.promptExitPatientMode();
  }

  private async promptExitPatientMode() {
    const alert = await this.alertCtrl.create({
      header: 'Exit Patient Mode',
      message: 'Enter caregiver password to switch back to Standard mode.',
      inputs: [
        {
          name: 'pin',
          type: 'password',
          placeholder: 'Enter password',
          attributes: { maxlength: 32 }
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Unlock',
          handler: (data) => this.verifyAndExitPatientMode(data?.pin)
        }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  private async verifyAndExitPatientMode(inputPin: string) {
    const savedPin = localStorage.getItem('caregiverPin');

    if (!savedPin) {
      const alert = await this.alertCtrl.create({
        header: 'No Password Set',
        message:
          'To exit Patient Mode, please set a caregiver password first in Settings.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Go to Settings',
            handler: () => this.router.navigate(['/settings'])
          }
        ]
      });
      await alert.present();
      return false;
    }

    if (!inputPin || inputPin !== savedPin) {
      this.presentToast('Incorrect password', 'danger');
      return false;
    }

    this.isPatientMode = false;
    localStorage.setItem('patientMode', 'false');
    this.presentToast('Standard Mode enabled');
    // notify others
    window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: false }));
    return true;
  }

  // Not used directly anymore for PM flow but kept if referenced elsewhere
  togglePatientMode() {
    if (!this.isPatientMode) {
      // route through enablePatientMode to enforce password requirement
      this.enablePatientMode();
    } else {
      this.promptExitPatientMode();
    }
  }

  /* ---------------- Categories: add / persist ---------------- */
  async onAddCategory() {
    const alert = await this.alertCtrl.create({
      header: 'New Category',
      message: 'Name your category and optionally add a description.',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Category name (required)' },
        { name: 'description', type: 'text', placeholder: 'Description (optional)' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data) => {
            const name = (data?.name || '').trim();
            const description = (data?.description || '').trim();

            if (!name) {
              this.presentToast('Please enter a category name.', 'warning');
              return false;
            }
            if (this.userCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
              this.presentToast('Category already exists.', 'warning');
              return false;
            }

            const category: UserCategory = {
              id: this.uuid(),
              name,
              description: description || undefined,
              createdAt: Date.now(),
            };

            // Put NEW categories at the END
            this.userCategories.push(category);
            this.saveCategories();

            // Let other pages react live
            window.dispatchEvent(new CustomEvent('categories-updated', { detail: this.userCategories }));

            this.presentToast('Category added', 'success');

            // Navigate to the dedicated empty page for this category
            this.router.navigate(['/category', category.id], {
              state: { categoryName: category.name }
            });

            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async onRemoveCategory(cat: UserCategory, ev?: Event) {
    // prevent the card click from navigating
    ev?.stopPropagation();
    ev?.preventDefault();

    const alert = await this.alertCtrl.create({
      header: 'Remove Category',
      message: `Remove “${cat.name}”? This only removes the category (your media remains).`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            this.userCategories = this.userCategories.filter(c => c.id !== cat.id);
            this.saveCategories();
            this.presentToast('Category removed', 'success');
          }
        }
      ]
    });
    await alert.present();
  }

  openCustomCategory(c: UserCategory) {
    this.router.navigate(['/category', c.id], { state: { categoryName: c.name } });
  }

  private loadCategories() {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      this.userCategories = raw ? (JSON.parse(raw) as UserCategory[]) : [];
    } catch {
      this.userCategories = [];
    }
  }

  private saveCategories() {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(this.userCategories));
  }

  /* ---------------- Misc / shared ---------------- */
  navigateToGame(gameType: string) {
    switch (gameType) {
      case 'name-that-memory':
        this.router.navigate(['/name-that-memory-select']);
        break;
      case 'category-match':
        this.router.navigate(['/category-match']);
        break;
      case 'memory-matching':
        this.router.navigate(['/memory-matching']);
        break;
      case 'color-sequence':
        this.router.navigate(['/color-sequence']);
        break;
      default:
        console.log('Game not implemented yet:', gameType);
    }
  }

  private async presentToast(
    message: string,
    color: 'success' | 'warning' | 'danger' | 'primary' = 'primary'
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1700,
      color,
      position: 'bottom'
    });
    await toast.present();
  }

  private uuid(): UUID {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
