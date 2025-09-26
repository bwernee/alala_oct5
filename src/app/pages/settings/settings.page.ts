import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import * as QRCode from 'qrcode';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false
})
export class SettingsPage implements OnInit {
  userData: any = {};
  qrCodeData = '';
  qrCodeImage = '';
  showQRCode = false;

  // === Security code (alphanumeric, no vowels/Y, unique locally) ===
  securityCode = '';
  private USED_CODES_KEY = 'alala_used_security_codes_v1';
  private readonly CODE_LEN = 24;
  // No vowels (A,E,I,O,U) and no Y => prevents real words.
  // Also remove 0/1/O/I for readability.
  private readonly ALPHABET = '23456789BCDFGHJKLMNPQRSTVWXZ';

  // Caregiver password state
  hasPin = false;
  maskedPin = '—';


  saving = false;

  // Form model (pin)
  form = { currentPin: '', newPin: '', confirmPin: '' };
  showCurrent = false;
  showNew = false;
  showConfirm = false;

  // Inline edit states
  isEditingName = false;
  isEditingEmail = false;
  nameDraft = '';
  emailDraft = '';
  savingName = false;
  savingEmail = false;

  // Photo inputs
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;
  @ViewChild('galleryInput') galleryInput!: ElementRef<HTMLInputElement>;

  // Trusted contacts
  trustedContacts: any[] = [];
  contactSecurityCode = '';
  isScanning = false;
  isAddingContact = false;

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController
  ) {}

  ngOnInit() {
    this.loadUserData();
    this.ensureSecurityCode();     // ← make/restore alphanumeric code (no words)
    this.loadPinState();
    this.generateQRData();
    this.loadTrustedContacts();
  }

  /* ---------- Profile data ---------- */

  loadUserData() {
    const stored = localStorage.getItem('userData');
    this.userData = stored ? JSON.parse(stored) : {};
  }

  async generateQRData() {
    const patientProfile = {
      type: 'patient-profile',
      appName: 'ALALA',
      name: this.userData.name || '',
      email: this.userData.email || '',
      sec: this.securityCode          // include code in QR payload
    };
    this.qrCodeData = JSON.stringify(patientProfile);
    try {
      this.qrCodeImage = await QRCode.toDataURL(this.qrCodeData, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
    } catch (error) {
      console.error('QR gen error', error);
    }
  }

  /* ---------- Security code (alphanumeric, no words) ---------- */

  private ensureSecurityCode() {
    const validRe = new RegExp(`^[${this.ALPHABET}]{${this.CODE_LEN}}$`);
    const existing = this.userData?.securityCode;

    if (typeof existing === 'string' && validRe.test(existing)) {
      this.securityCode = existing;
      this._addToUsedCodes(existing);
      return;
    }

    // Generate a fresh code that is unique on this device
    let code = '';
    const used = this._getUsedCodes();
    do {
      code = this.secureRandomFromAlphabet(this.CODE_LEN, this.ALPHABET);
    } while (used.includes(code));

    this.securityCode = code;
    this.userData = { ...(this.userData || {}), securityCode: code };
    localStorage.setItem('userData', JSON.stringify(this.userData));
    this._addToUsedCodes(code);
    window.dispatchEvent(new CustomEvent('user-profile-updated'));
  }

  private secureRandomFromAlphabet(len: number, alphabet: string): string {
    // Rejection sampling to avoid modulo bias
    const out: string[] = [];
    const n = alphabet.length;
    const maxUnbiased = Math.floor(256 / n) * n; // highest multiple of n < 256

    const buf = new Uint8Array(len * 2); // overshoot buffer
    while (out.length < len) {
      crypto.getRandomValues(buf);
      for (let i = 0; i < buf.length && out.length < len; i++) {
        const v = buf[i];
        if (v < maxUnbiased) {
          out.push(alphabet[v % n]);
        }
      }
    }
    return out.join('');
  }

  private _getUsedCodes(): string[] {
    try {
      const raw = localStorage.getItem(this.USED_CODES_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }
  private _addToUsedCodes(code: string) {
    const list = this._getUsedCodes();
    if (!list.includes(code)) {
      list.push(code);
      localStorage.setItem(this.USED_CODES_KEY, JSON.stringify(list));
    }
  }

  copySecurityCode() {
    if (!this.securityCode) return;
    navigator.clipboard?.writeText(this.securityCode)
      .then(() => this.toast('Security code copied', 'success'))
      .catch(() => {});
  }

  /* ---------- Avatar: camera/gallery ---------- */

  async openPhotoSheet() {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Update Profile Picture',
      buttons: [
        { text: 'Take Photo', icon: 'camera', handler: () => this.cameraInput?.nativeElement.click() },
        { text: 'Choose from Gallery', icon: 'image', handler: () => this.galleryInput?.nativeElement.click() },
        { text: 'Cancel', role: 'cancel', icon: 'close' }
      ]
    });
    await sheet.present();
  }

  async onPhotoPicked(ev: Event, _source: 'camera' | 'gallery') {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    try {
      const dataUrl = await this.readFileAsDataURL(file);
      this.userData = { ...(this.userData || {}), photo: dataUrl };
      localStorage.setItem('userData', JSON.stringify(this.userData));
      window.dispatchEvent(new CustomEvent('user-profile-updated'));
      await this.generateQRData();
      await this.toast('Profile photo updated', 'success');
    } catch {
      await this.toast('Could not load image', 'danger');
    }
  }

  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = () => rej(new Error('read error'));
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
  }

  /* ---------- Inline Name edit ---------- */

  beginNameEdit() {
    if (this.isEditingName) return;
    this.nameDraft = (this.userData.name || '').trim();
    this.isEditingName = true;
  }

  async saveName() {
    if (!this.isEditingName || this.savingName) return;
    this.savingName = true;

    const name = (this.nameDraft || '').trim();
    this.userData = { ...(this.userData || {}), name };
    localStorage.setItem('userData', JSON.stringify(this.userData));
    window.dispatchEvent(new CustomEvent('user-profile-updated'));
    await this.generateQRData();
    this.isEditingName = false;
    this.savingName = false;
    await this.toast('Name updated', 'success');
  }

  cancelNameEdit() {
    this.isEditingName = false;
    this.savingName = false;
    this.nameDraft = '';
  }

  /* ---------- Inline Email edit ---------- */

  beginEmailEdit() {
    if (this.isEditingEmail) return;
    this.emailDraft = (this.userData.email || '').trim();
    this.isEditingEmail = true;
  }

  async saveEmail() {
    if (!this.isEditingEmail || this.savingEmail) return;
    const email = (this.emailDraft || '').trim();

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await this.toast('Please enter a valid email', 'warning');
      return;
    }

    this.savingEmail = true;
    this.userData = { ...(this.userData || {}), email };
    localStorage.setItem('userData', JSON.stringify(this.userData));
    window.dispatchEvent(new CustomEvent('user-profile-updated'));
    await this.generateQRData();
    this.isEditingEmail = false;
    this.savingEmail = false;
    await this.toast('Email updated', 'success');
  }

  cancelEmailEdit() {
    this.isEditingEmail = false;
    this.savingEmail = false;
    this.emailDraft = '';
  }

  /* ---------- Caregiver PIN ---------- */

  loadPinState() {
    const savedPin = localStorage.getItem('caregiverPin');
    this.hasPin = !!savedPin;
    this.maskedPin = this.hasPin ? this.makeMask(savedPin!.length) : '—';
  }

  makeMask(len: number) {
    const dots = Array(len).fill('•').join('');
    return len > 4 ? dots.replace(/(.{4})/g, '$1 ').trim() : dots;
  }

  async savePin() {
    if (this.saving) return;
    this.saving = true;

    const savedPin = localStorage.getItem('caregiverPin');

    if (savedPin) {
      if (!this.form.currentPin) {
        await this.toast('Enter your current password', 'warning');
        this.saving = false; return;
      }
      if (this.form.currentPin !== savedPin) {
        await this.toast('Current password is incorrect', 'danger');
        this.saving = false; return;
      }
    }

    if (!this.form.newPin || !this.form.confirmPin) {
      await this.toast('Enter and confirm the new password', 'warning');
      this.saving = false; return;
    }
    if (this.form.newPin.length < 4 || this.form.newPin.length > 32) {
      await this.toast('Password must be 4–32 characters', 'warning');
      this.saving = false; return;
    }
    if (this.form.newPin !== this.form.confirmPin) {
      await this.toast('New passwords do not match', 'danger');
      this.saving = false; return;
    }

    localStorage.setItem('caregiverPin', this.form.newPin);
    this.form = { currentPin: '', newPin: '', confirmPin: '' };
    this.showCurrent = this.showNew = this.showConfirm = false;

    this.loadPinState();
    await this.toast(savedPin ? 'Password updated' : 'Password set', 'success');
    this.saving = false;
  }

  async promptRemovePin() {
    const alert = await this.alertCtrl.create({
      header: 'Remove Password',
      message: 'Enter current password to remove it.',
      inputs: [{ name: 'pin', type: 'password', placeholder: 'Current password' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Remove', role: 'confirm', handler: (data) => this.removePin(data?.pin) }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  async removePin(inputPin?: string) {
    const savedPin = localStorage.getItem('caregiverPin');
    if (!savedPin) return;

    if (!inputPin || inputPin !== savedPin) {
      await this.toast('Incorrect password', 'danger');
      return false;
    }

    localStorage.removeItem('caregiverPin');
    this.loadPinState();
    await this.toast('Password removed', 'success');
    return true;
  }

  /* ---------- Misc ---------- */

  toggleQRCode() { this.showQRCode = !this.showQRCode; }

  logout() {
    localStorage.removeItem('userLoggedIn');
    localStorage.removeItem('userEmail');
    this.router.navigate(['/login']);
  }

  async clearAllData() {
    const alert = await this.alertCtrl.create({
      header: 'Clear All Data',
      message: 'Remove all game progress? This cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          role: 'destructive',
          handler: async () => {
            localStorage.removeItem('peopleCards');
            localStorage.removeItem('placesCards');
            localStorage.removeItem('objectsCards');
            localStorage.removeItem('gameSessions');
            await this.toast('All data cleared', 'success');
          }
        }
      ]
    });
    await alert.present();
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({ message, duration: 1700, color, position: 'bottom' });
    await t.present();
  }

  /* ---------- Trusted Contacts ---------- */

  loadTrustedContacts() {
    try {
      const contacts = localStorage.getItem('trustedContacts');
      this.trustedContacts = contacts ? JSON.parse(contacts) : [];
    } catch (error) {
      console.error('Error loading trusted contacts:', error);
      this.trustedContacts = [];
    }
  }

  saveTrustedContacts() {
    try {
      localStorage.setItem('trustedContacts', JSON.stringify(this.trustedContacts));
    } catch (error) {
      console.error('Error saving trusted contacts:', error);
    }
  }

  async scanQRCode() {
    this.isScanning = true;
    try {
      // For now, show an alert since we don't have camera permissions set up
      const alert = await this.alertCtrl.create({
        header: 'QR Code Scanner',
        message: 'QR code scanning will be available in a future update. For now, please use the security code option.',
        buttons: ['OK']
      });
      await alert.present();
    } catch (error) {
      console.error('Error scanning QR code:', error);
      await this.toast('Error scanning QR code', 'danger');
    } finally {
      this.isScanning = false;
    }
  }

  async addContactByCode() {
    if (!this.contactSecurityCode.trim()) {
      await this.toast('Please enter a security code', 'warning');
      return;
    }

    this.isAddingContact = true;
    try {
      // Check if contact already exists
      const existingContact = this.trustedContacts.find(c => c.securityCode === this.contactSecurityCode);
      if (existingContact) {
        await this.toast('This contact is already added', 'warning');
        return;
      }

      // Generate sequential family name (FAMILY 1, FAMILY 2, etc.)
      const familyNumber = this.trustedContacts.length + 1;
      const familyName = `FAMILY ${familyNumber}`;

      // Simulate looking up the contact by security code
      // In a real app, this would make an API call to find the user by their security code
      const mockContact = {
        id: Date.now().toString(),
        name: familyName,
        email: `family${familyNumber}@example.com`,
        photo: '',
        securityCode: this.contactSecurityCode,
        addedAt: new Date().toISOString(),
        familyNumber: familyNumber
      };

      this.trustedContacts.push(mockContact);
      this.saveTrustedContacts();
      this.contactSecurityCode = '';

      await this.toast(`${familyName} added successfully`, 'success');
    } catch (error) {
      console.error('Error adding contact:', error);
      await this.toast('Error adding contact', 'danger');
    } finally {
      this.isAddingContact = false;
    }
  }

  async removeContact(contactId: string) {
    const contactToRemove = this.trustedContacts.find(c => c.id === contactId);
    const familyName = contactToRemove?.name || 'Contact';

    const alert = await this.alertCtrl.create({
      header: 'Remove Contact',
      message: `Are you sure you want to remove ${familyName}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            this.trustedContacts = this.trustedContacts.filter(c => c.id !== contactId);
            // Renumber remaining contacts to maintain sequential order
            this.renumberFamilyContacts();
            this.saveTrustedContacts();
            this.toast(`${familyName} removed`, 'success');
          }
        }
      ]
    });
    await alert.present();
  }

  private renumberFamilyContacts() {
    // Renumber all contacts to maintain FAMILY 1, FAMILY 2, etc. sequence
    this.trustedContacts.forEach((contact, index) => {
      const newFamilyNumber = index + 1;
      contact.name = `FAMILY ${newFamilyNumber}`;
      contact.familyNumber = newFamilyNumber;
      contact.email = `family${newFamilyNumber}@example.com`;
    });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

}
