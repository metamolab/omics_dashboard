import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApiService } from './services/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
  `,
  styles: []
})
export class AppComponent implements OnInit {
  title = 'data-analysis-dashboard';

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    // Automatically login on app startup
    this.performAutoLogin();
  }

  private performAutoLogin() {
    console.log('Performing automatic login...');
    
    this.apiService.login('carossi', 'CaAlRoCNR_2025', '000000').subscribe({
      next: (response) => {
        console.log('Auto-login successful:', response);
        console.log('Username set as userId:', this.apiService.getUsername());
        console.log('Access token saved:', !!this.apiService.getAccessToken());
      },
      error: (error) => {
        console.error('Auto-login failed:', error);
        // Continue app initialization even if auto-login fails
      }
    });
  }
}
