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
      label: 'Carica File',
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
    
    // Reset all items first
    items.forEach((item, index) => {
      if (index === 0) {
        // First item is always at least pending
        item.status = 'pending';
      } else {
        item.status = 'disabled';
      }
    });
    
    // Update based on completed steps
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

    // Set the current active item
    items.forEach(item => {
      if (currentRoute.includes(item.route) && item.status !== 'disabled') {
        item.status = 'active';
        this.currentStep.set(item.id);
      }
    });

    this.navigationItems.set(items);
  }

  canNavigateTo(stepId: string): boolean {
    // Special case: always allow navigation to upload
    if (stepId === 'upload') {
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
    switch (stepId) {
      case 'upload':
        return true;
      case 'preprocessing':
        return this.dataFlowService.isStepCompleted('upload');
      case 'analysis':
        return this.dataFlowService.isStepCompleted('upload') && 
               this.dataFlowService.isStepCompleted('preprocessing');
      case 'results':
        return this.dataFlowService.isStepCompleted('upload') && 
               this.dataFlowService.isStepCompleted('preprocessing') &&
               this.dataFlowService.isStepCompleted('analysis');
      default:
        return false;
    }
  }

  resetWorkflow() {
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
