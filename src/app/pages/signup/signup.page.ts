import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: false
})
export class SignupPage {
  name: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  isLoading: boolean = false;

  constructor(
    private router: Router,
    private firebaseService: FirebaseService
  ) {}

  async signup() {
    if (!this.name || !this.email || !this.password) {
      alert('Please fill all fields');
      return;
    }

    if (this.password !== this.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    if (this.password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    this.isLoading = true;

    try {
      const user = await this.firebaseService.signup(this.email, this.password, this.name);
      
      // Store user session
      const userData = {
        name: this.name,
        email: this.email,
        createdAt: new Date().toISOString()
      };
      
      localStorage.setItem('userData', JSON.stringify(userData));
      localStorage.setItem('userLoggedIn', 'true');
      localStorage.setItem('userEmail', this.email);
      localStorage.setItem('userId', user.uid);

      // Ensure no default data exists for new accounts
      try {
        ['peopleCards','placesCards','objectsCards'].forEach(k => localStorage.removeItem(k));
        ['peopleCards_'+user.uid,'placesCards_'+user.uid,'objectsCards_'+user.uid].forEach(k => localStorage.removeItem(k));
      } catch {}

      // Redirect to login after registration as caregiver
      this.router.navigate(['/login']);
      
    } catch (error: any) {
      console.error('Signup error:', error);
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') {
        alert('This email is already in use. Please log in or use another email.');
      } else {
        alert(error.message || 'Signup failed. Please try again.');
      }
    } finally {
      this.isLoading = false;
    }
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
