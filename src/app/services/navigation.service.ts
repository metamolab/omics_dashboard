import { Injectable, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { NavItem } from '../models/interfaces';
import { DataFlowService } from './data-flow.service';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private navItems: NavItem[] = [
    {
      id: 'upload',
      label: 'Selezione Dati',
      icon: '📊',
      route: '/dashboard/upload',
      status: 'pending'
    },
    {
      id: 'preprocessing',
      label: 'Pre-processing',
      icon: '⚙️',
      route: '/dashboard/preprocessing',
      status: 'disabled'
    },
    {
      id: 'analysis',
      label: 'Selezione Analisi',
      icon: '📈',
      route: '/dashboard/analysis',
      status: 'disabled'
    },
    {
      id: 'results',
      label: 'Risultati',
      icon: '📋',
      route: '/dashboard/results',
      status: 'disabled'
    }
  ];

  navigationItems = signal<NavItem[]>(this.navItems);
  currentStep = signal<string>('upload');
  
  // Track if analysis is active (running or showing results) to disable backward navigation
  private analysisActive = signal<boolean>(false);

  constructor(
    private router: Router,
    private dataFlowService: DataFlowService
  ) {
    // Initial status update
    this.updateNavigationStatus();
    
    // Subscribe to router events to update navigation on route change
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.updateNavigationStatus();
    });
  }

  updateNavigationStatus() {
    const items = [...this.navItems];
    const currentRoute = this.router.url;
    
    // If analysis is active, disable all previous steps and only allow results
    if (this.analysisActive()) {
      items.forEach((item, index) => {
        if (item.id === 'results') {
          item.status = currentRoute.includes(item.route) ? 'active' : 'pending';
        } else {
          item.status = 'disabled';
        }
      });
      
      this.navigationItems.set(items);
      return;
    }
    
    // Reset all items first
    items.forEach((item, index) => {
      if (index === 0) {
        // First item is normally at least pending, but disabled in recovery mode
        item.status = this.dataFlowService.isRecoveryMode() ? 'disabled' : 'pending';
      } else {
        item.status = 'disabled';
      }
    });
    
    // In recovery mode, show a different navigation pattern
    if (this.dataFlowService.isRecoveryMode()) {
      // Upload is disabled in recovery mode
      items[0].status = 'disabled';
      
      // If we have an analysis ID, enable results
      if (this.dataFlowService.analysisId() !== null) {
        items[3].status = 'pending'; // Enable results step
      }
    } else {
      // Normal workflow navigation
      items[0].status = 'pending'; // Upload is always at least pending
      
      if (this.dataFlowService.isStepCompleted('upload')) {
        items[0].status = 'completed';
        items[1].status = 'pending';
        
        if (this.dataFlowService.isStepCompleted('preprocessing')) {
          items[1].status = 'completed';
          items[2].status = 'pending';
          
          if (this.dataFlowService.isStepCompleted('analysis')) {
            items[2].status = 'completed';
            items[3].status = 'pending';
          }
        }
      }

      // Special case: If we have an analysis ID (from recovery), enable results step
      if (this.dataFlowService.analysisId() !== null) {
        items[3].status = 'pending'; // Enable results step
      }
    }

    // Set the current active item
    items.forEach(item => {
      if (currentRoute.includes(item.route) && item.status !== 'disabled') {
        item.status = 'active';
        this.currentStep.set(item.id);
      }
    });

    this.navigationItems.set(items);
  }

  setAnalysisActiveState(active: boolean) {
    this.analysisActive.set(active);
    this.updateNavigationStatus();
  }

  canNavigateTo(stepId: string): boolean {
    // If analysis is active (running or showing results), prevent navigation to previous steps
    if (this.analysisActive()) {
      // Only allow staying on results step when analysis is active
      return stepId === 'results';
    }
    
    // Block navigation to upload if we're in recovery mode
    if (stepId === 'upload' && this.dataFlowService.isRecoveryMode()) {
      return false;
    }
    
    // Special case: always allow navigation to upload (when not in recovery mode)
    if (stepId === 'upload') {
      return true;
    }
    
    // Special case: allow navigation to results if we have an analysis ID (from recovery)
    if (stepId === 'results' && this.dataFlowService.analysisId() !== null) {
      return true;
    }
    
    const item = this.navItems.find(i => i.id === stepId);
    return item ? item.status !== 'disabled' : false;
  }

  navigateToStep(stepId: string) {
    if (this.canNavigateTo(stepId) && this.canAccessStep(stepId)) {
      const item = this.navItems.find(i => i.id === stepId);
      if (item) {
        this.router.navigate([item.route]);
        this.updateNavigationStatus();
      }
    }
  }

  canAccessStep(stepId: string): boolean {
    // If analysis is active (running or showing results), only allow access to results step
    if (this.analysisActive()) {
      return stepId === 'results';
    }
    
    switch (stepId) {
      case 'upload':
        // Block access to upload if we're in recovery mode
        return !this.dataFlowService.isRecoveryMode();
      case 'preprocessing':
        return this.dataFlowService.isStepCompleted('upload');
      case 'analysis':
        return this.dataFlowService.isStepCompleted('upload') && 
               this.dataFlowService.isStepCompleted('preprocessing');
      case 'results':
        // Allow access to results if we have an analysis ID (from recovery) OR normal workflow completion
        return this.dataFlowService.analysisId() !== null ||
               (this.dataFlowService.isStepCompleted('upload') && 
                this.dataFlowService.isStepCompleted('preprocessing') &&
                this.dataFlowService.isStepCompleted('analysis'));
      default:
        return false;
    }
  }

  resetWorkflow() {
    // Reset analysis active state
    this.analysisActive.set(false);
    
    // Reset all data
    this.dataFlowService.resetData();
    
    // Reset navigation items to initial state
    this.navItems.forEach((item, index) => {
      if (index === 0) {
        item.status = 'pending';
      } else {
        item.status = 'disabled';
      }
    });
    
    // Update and navigate
    this.currentStep.set('upload');
    this.navigationItems.set([...this.navItems]);
    this.router.navigate(['/dashboard/upload']).then(() => {
      this.updateNavigationStatus();
    });
  }
}
