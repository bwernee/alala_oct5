import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { QrService } from '../../services/qr.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage {
  email: string = '';
  password: string = '';
  isLoading: boolean = false;
  securityCode: string = '';

  constructor(
    private router: Router,
    private firebaseService: FirebaseService,
    private qrService: QrService
  ) {}

  async login() {
    if (!this.email || !this.password) {
      alert('Please enter email and password');
      return;
    }

    this.isLoading = true;
    
    try {
      const user = await this.firebaseService.login(this.email, this.password);
      
      // Get user data from Firestore
      const userData = await this.firebaseService.getUserData(user.uid);
      
      // Clear any previous user's cached progress and per-user caches BEFORE storing new session
      try {
        const lastUid = localStorage.getItem('userId');
        localStorage.removeItem('gameSessions');
        if (lastUid) localStorage.removeItem(`gameSessions:${lastUid}`);
        ['peopleCards','placesCards','objectsCards'].forEach(k => localStorage.removeItem(k));
      } catch {}

      // Store user session
      localStorage.setItem('userLoggedIn', 'true');
      localStorage.setItem('userEmail', this.email);
      localStorage.setItem('userId', user.uid);
      if (userData) {
        localStorage.setItem('userData', JSON.stringify(userData));
      }

      // Ensure the user's progress doc exists with zeros
      try { await this.firebaseService.ensureProgressInitialized(); } catch {}

      this.router.navigate(['/home']);
      
    } catch (error: any) {
      console.error('Login error:', error);
      alert(error.message || 'Login failed. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  goToSignup() {
    this.router.navigate(['/signup']);
  }

  async loginWithSecurityCode() {
    if (!this.securityCode) return;
    this.isLoading = true;
    try {
      await this.loginWithCode(this.securityCode);
    } catch (e) {
      console.error(e);
      alert('Failed to sign in with security code.');
    } finally {
      this.isLoading = false;
    }
  }

  async scanQRCode() {
    try {
      this.isLoading = true;
      const res = await this.qrService.scan();
      const text = (res?.text || '').trim();
      if (!text) { alert('No QR content detected.'); return; }
      let code = '';
      try { const obj = JSON.parse(text); code = (obj?.sec || obj?.securityCode || '').toString(); } catch { code = text; }
      if (!code) { alert('QR did not contain a valid security code.'); return; }
      await this.loginWithCode(code);
    } catch (e) {
      console.error('QR scan failed', e);
      alert('QR scan failed. Please enter the Security Code.');
    } finally {
      this.isLoading = false;
    }
  }

  private async loginWithCode(rawCode: string) {
    const code = (rawCode || '').trim().toUpperCase();
    if (!code) throw new Error('Empty code');
    const found = await this.firebaseService.findUserBySecurityCode(code);
    if (!found) {
      alert('Security code not found.');
      return;
    }
    // Emulate a session for the found user (no password required per requirement)
    localStorage.setItem('userLoggedIn', 'true');
    localStorage.setItem('userId', found.uid);
    if (found.email) localStorage.setItem('userEmail', found.email);
    const userData = await this.firebaseService.getUserData(found.uid);
    if (userData) localStorage.setItem('userData', JSON.stringify(userData));
    try { await this.firebaseService.ensureProgressInitialized(); } catch {}
    this.router.navigate(['/home']);
  }
}

