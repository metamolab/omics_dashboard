import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationService } from '../../services/navigation.service';
import { DataFlowService } from '../../services/data-flow.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>Data Analysis</h2>
        <p>Dashboard</p>
      </div>
      
      <nav class="sidebar-nav">
        @for (item of navigationService.navigationItems(); track item.id) {
          <div 
            class="nav-item"
            [class.active]="item.status === 'active'"
            [class.completed]="isStepCompleted(item.id)"
            [class.disabled]="item.status === 'disabled'"
            (click)="navigateToStep(item.id)">
            
            <div class="nav-item-icon">{{ item.icon }}</div>
            <div class="nav-item-content">
              <span class="nav-item-label">{{ item.label }}</span>
              @if (isStepCompleted(item.id)) {
                <span class="status-icon">✓</span>
              }
            </div>
          </div>
        }
      </nav>

      <div class="sidebar-footer">
        <button class="reset-btn" (click)="resetWorkflow()">
          Nuovo Flusso
        </button>
      </div>
    </div>
  `,
  styles: [`
    .sidebar {
      width: 280px;
      height: 100vh;
      background: #0c4a6e;
      color: white;
      display: flex;
      flex-direction: column;
      position: fixed;
      left: 0;
      top: 0;
    }

    .sidebar-header {
      padding: 32px 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .sidebar-header h2 {
      margin: 0 0 4px 0;
      font-size: 24px;
      font-weight: 600;
    }

    .sidebar-header p {
      margin: 0;
      opacity: 0.8;
      font-size: 14px;
    }

    .sidebar-nav {
      flex: 1;
      padding: 24px 16px 24px 13px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      margin-bottom: 8px;
      border-radius: 0 8px 8px 0;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      border-left: 3px solid transparent;
      margin-left: 0;
    }

    .nav-item:hover:not(.disabled):not(.active) {
      background: rgba(255, 255, 255, 0.1);
      border-left-color: rgba(255, 255, 255, 0.3);
    }

    .nav-item.active {
      background: #0284c7;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      border-left-color: white;
    }

    .nav-item.active .nav-item-label {
      color: white;
    }

    .nav-item.completed:not(.active) {
      background: rgba(255, 255, 255, 0.05);
      border-left-color: rgba(134, 239, 172, 0.3);
    }

    .nav-item.completed:hover:not(.active) {
      background: rgba(255, 255, 255, 0.08);
      border-left-color: rgba(134, 239, 172, 0.5);
    }

    .nav-item.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .nav-item-icon {
      font-size: 20px;
      width: 32px;
      text-align: center;
    }

    .nav-item-content {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .nav-item-label {
      font-size: 15px;
    }

    .status-icon {
      font-size: 14px;
      color: #86efac;
    }

    .nav-item.active .status-icon {
      color: white;
    }

    .sidebar-footer {
      padding: 24px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .reset-btn {
      width: 100%;
      padding: 12px;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .reset-btn:hover {
      background: rgba(255, 255, 255, 0.15);
    }
  `]
})
export class SidebarComponent {
  constructor(
    public navigationService: NavigationService,
    private dataFlowService: DataFlowService
  ) {}

  navigateToStep(stepId: string) {
    this.navigationService.navigateToStep(stepId);
  }

  isStepCompleted(stepId: string): boolean {
    return this.dataFlowService.isStepCompleted(stepId);
  }

  resetWorkflow() {
    if (confirm('Sei sicuro di voler iniziare un nuovo flusso? Tutti i dati verranno persi.')) {
      this.navigationService.resetWorkflow();
    }
  }
}
