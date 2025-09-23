import { Component } from '@angular/core';
import { FirebaseService } from './services/firebase.service';

@Component({
  selector: 'app-firebase-test',
  template: `
    <div style="padding: 20px;">
      <h2>Firebase Connection Test</h2>
      
      <div style="margin: 10px 0;">
        <button (click)="testConnection()" [disabled]="testing">
          {{ testing ? 'Testing...' : 'Test Firebase Connection' }}
        </button>
      </div>
      
      <div *ngIf="connectionStatus" [style.color]="connectionStatus.success ? 'green' : 'red'">
        {{ connectionStatus.message }}
      </div>
      
      <div style="margin-top: 20px;" *ngIf="connectionStatus?.success">
        <h3>Test Authentication & Data Structure</h3>
        <div style="margin: 10px 0;">
          <input type="email" [(ngModel)]="testEmail" placeholder="Test email" style="margin-right: 10px;">
          <input type="password" [(ngModel)]="testPassword" placeholder="Test password" style="margin-right: 10px;">
          <button (click)="testSignup()" [disabled]="testing">Test Signup</button>
          <button (click)="testAuth()" [disabled]="testing">Test Login</button>
        </div>

        <div *ngIf="authResult" [style.color]="authResult.success ? 'green' : 'red'">
          {{ authResult.message }}
        </div>

        <div style="margin-top: 20px;" *ngIf="authResult?.success">
          <h4>Test Data Structure</h4>
          <button (click)="testGameSession()" [disabled]="testing">Save Test Game Session</button>
          <button (click)="testProgress()" [disabled]="testing">Update Progress</button>
          <button (click)="loadUserData()" [disabled]="testing">Load User Data</button>

          <div *ngIf="dataResult" [style.color]="dataResult.success ? 'green' : 'red'">
            {{ dataResult.message }}
          </div>
        </div>
      </div>
    </div>
  `,
  standalone: true,
  imports: []
})
export class FirebaseTestComponent {
  testing = false;
  connectionStatus: { success: boolean; message: string } | null = null;
  authResult: { success: boolean; message: string } | null = null;
  dataResult: { success: boolean; message: string } | null = null;
  testEmail = '';
  testPassword = '';

  constructor(private firebaseService: FirebaseService) {}

  async testConnection() {
    this.testing = true;
    this.connectionStatus = null;
    
    try {
      // Test if Firebase services are available
      const currentUser = this.firebaseService.getCurrentUser();
      
      this.connectionStatus = {
        success: true,
        message: `✅ Firebase connection successful! Current user: ${currentUser ? currentUser.email : 'Not logged in'}`
      };
    } catch (error: any) {
      this.connectionStatus = {
        success: false,
        message: `❌ Firebase connection failed: ${error.message}`
      };
    } finally {
      this.testing = false;
    }
  }

  async testSignup() {
    if (!this.testEmail || !this.testPassword) {
      this.authResult = {
        success: false,
        message: '❌ Please enter both email and password'
      };
      return;
    }

    this.testing = true;
    this.authResult = null;

    try {
      const user = await this.firebaseService.signup(this.testEmail, this.testPassword, 'Test User');
      this.authResult = {
        success: true,
        message: `✅ Signup successful! Created user: ${user.email} with nested data structure`
      };
    } catch (error: any) {
      this.authResult = {
        success: false,
        message: `❌ Signup failed: ${error.message}`
      };
    } finally {
      this.testing = false;
    }
  }

  async testAuth() {
    if (!this.testEmail || !this.testPassword) {
      this.authResult = {
        success: false,
        message: '❌ Please enter both email and password'
      };
      return;
    }

    this.testing = true;
    this.authResult = null;

    try {
      const user = await this.firebaseService.login(this.testEmail, this.testPassword);
      this.authResult = {
        success: true,
        message: `✅ Authentication successful! Logged in as: ${user.email}`
      };
    } catch (error: any) {
      this.authResult = {
        success: false,
        message: `❌ Authentication failed: ${error.message}`
      };
    } finally {
      this.testing = false;
    }
  }

  async testGameSession() {
    this.testing = true;
    this.dataResult = null;

    try {
      await this.firebaseService.saveGameSession({
        category: 'test-category',
        correctAnswers: 8,
        totalQuestions: 10,
        totalTime: 120,
        skipped: 2
      });

      this.dataResult = {
        success: true,
        message: '✅ Game session saved to nested structure: users/{uid}/userProgress/stats/gameSessions/'
      };
    } catch (error: any) {
      this.dataResult = {
        success: false,
        message: `❌ Failed to save game session: ${error.message}`
      };
    } finally {
      this.testing = false;
    }
  }

  async testProgress() {
    this.testing = true;
    this.dataResult = null;

    try {
      await this.firebaseService.saveUserProgress({
        overallStats: {
          accuracy: 80,
          avgTimePerCard: 12,
          totalCards: 50,
          skippedCards: 5
        },
        categoryStats: [
          { name: 'People', icon: '👨‍👩‍👧‍👦', accuracy: 85, cardsPlayed: 20, avgTime: 10 },
          { name: 'Places', icon: '🏠', accuracy: 75, cardsPlayed: 15, avgTime: 14 }
        ],
        lastCalculated: new Date().toISOString()
      });

      this.dataResult = {
        success: true,
        message: '✅ Progress updated in nested structure: users/{uid}/userProgress/stats'
      };
    } catch (error: any) {
      this.dataResult = {
        success: false,
        message: `❌ Failed to update progress: ${error.message}`
      };
    } finally {
      this.testing = false;
    }
  }

  async loadUserData() {
    this.testing = true;
    this.dataResult = null;

    try {
      const [progress, sessions] = await Promise.all([
        this.firebaseService.getUserProgress(),
        this.firebaseService.getUserGameSessions()
      ]);

      this.dataResult = {
        success: true,
        message: `✅ Data loaded successfully! Progress: ${JSON.stringify(progress, null, 2)}, Sessions: ${sessions.length} found`
      };
    } catch (error: any) {
      this.dataResult = {
        success: false,
        message: `❌ Failed to load data: ${error.message}`
      };
    } finally {
      this.testing = false;
    }
  }
}
