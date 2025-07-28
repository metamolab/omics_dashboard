import { Component, OnInit, OnDestroy, signal, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, AfterViewChecked } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { DataFlowService } from '../../services/data-flow.service';
import { ApiService } from '../../services/api.service';
import { NavigationService } from '../../services/navigation.service';
import { PlotlyService } from '../../services/plotly.service';
import { AnalysisRequest, AnalysisResult } from '../../models/interfaces';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    MatTableModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    FormsModule
  ],
  template: `
    <div class="content-wrapper">
      @if (loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <h2>Analisi in corso...</h2>
          <p>I tuoi dati sono in elaborazione</p>
        </div>
      } @else if (error()) {
        <div class="error-state">
          <div class="error-icon">⚠</div>
          <h2>Errore durante l'analisi</h2>
          <p>{{ error() }}</p>
          <button class="retry-btn" (click)="retryAnalysis()">Riprova</button>
        </div>
      } @else if (results()) {
        <div class="results-content">
          <div class="page-header">
            <h1>Risultati dell'Analisi</h1>
            <p>Ecco i risultati delle tue analisi</p>
          </div>

          <!-- Tabset per ogni test -->
          @if (getTestNames().length > 0) {
            <div class="test-tabset">
              <ul class="test-tabs">
                @for (testKey of getTestNames(); track testKey) {
                  <li class="test-tab" [class.active]="selectedTab === testKey" (click)="selectTab(testKey)">
                    {{ getTestDisplayName(testKey) }}
                  </li>
                }
              </ul>
              <div class="test-tab-content">
                @if (selectedTab) {
                  <div class="test-card">
                    <h2>{{ getTestDisplayName(selectedTab) }}</h2>
                    <div class="test-layout" style="display: flex; gap: 32px; align-items: flex-start;">
                      <div class="test-table" style="flex: 1;">
                        <table mat-table [dataSource]="tableDataSource" matSort #sort="matSort" class="mat-elevation-z1" style="width: 100%;">
                          <!-- Gene Column -->
                          <ng-container matColumnDef="variable">
                            <th mat-header-cell *matHeaderCellDef mat-sort-header>Gene</th>
                            <td mat-cell *matCellDef="let row">{{ row.variable }}</td>
                          </ng-container>
                          <!-- Estimate Column -->
                          <ng-container matColumnDef="estimate">
                            <th mat-header-cell *matHeaderCellDef mat-sort-header>Estimate</th>
                            <td mat-cell *matCellDef="let row" style="text-align: right;">{{ formatNumberCell(row.estimate) }}</td>
                          </ng-container>
                          <!-- p-value Column -->
                          <ng-container matColumnDef="pValue">
                            <th mat-header-cell *matHeaderCellDef mat-sort-header>p-value</th>
                            <td mat-cell *matCellDef="let row" style="text-align: right;">{{ formatNumberCell(row.pValue) }}</td>
                          </ng-container>
                          <!-- FDR Column -->
                          <ng-container matColumnDef="fdr">
                            <th mat-header-cell *matHeaderCellDef mat-sort-header>FDR</th>
                            <td mat-cell *matCellDef="let row" style="text-align: right;">{{ formatNumberCell(row.fdr) }}</td>
                          </ng-container>
                          <!-- Statistic Column -->
                          <ng-container matColumnDef="statistic">
                            <th mat-header-cell *matHeaderCellDef mat-sort-header>Statistic</th>
                            <td mat-cell *matCellDef="let row" style="text-align: right;">{{ formatNumberCell(row.statistic) }}</td>
                          </ng-container>
                          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                          <tr mat-row *matRowDef="let row; columns: displayedColumns;" [ngClass]="{'significant-row': row.fdr < 0.05}"></tr>
                        </table>
                        <mat-paginator [pageSize]="10" [pageSizeOptions]="[5, 10, 25, 50]" showFirstLastButtons></mat-paginator>
                      </div>
                      <div class="volcano-plot" [attr.id]="'volcano-plot-' + selectedTab" style="flex: 1; min-width: 400px; height: 400px;"></div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <div class="actions">
            <button class="download-btn" (click)="downloadResults()">
              Scarica Report
            </button>
            <button class="new-analysis-btn" (click)="startNewAnalysis()">
              Nuova Analisi
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .content-wrapper {
      width: 100%;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 24px 16px;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      background: #f8fafc;
    }
    .loading-state, .error-state {
      text-align: center;
      padding: 80px 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid #bae6fd;
      border-top-color: #0284c7;
      border-radius: 50%;
      margin: 0 auto 24px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.8;
    }
    .page-header {
      margin-bottom: 32px;
    }
    .page-header h1 {
      margin: 0 0 8px 0;
      color: #0c4a6e;
      font-size: 28px;
      font-weight: 600;
    }
    .page-header p {
      margin: 0;
      color: #475569;
      font-size: 16px;
    }
    h2 {
      color: #0f172a;
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 500;
    }
    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }
    .result-card {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }
    .result-card.full-width {
      grid-column: 1 / -1;
    }
    .result-card h3 {
      color: #0f172a;
      margin: 0 0 20px 0;
      font-size: 18px;
      font-weight: 500;
    }
    .result-card h4 {
      color: #334155;
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 500;
    }
    /* Statistics Styles */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
    }
    .stat-item {
      background: #f0f9ff;
      padding: 16px;
      border-radius: 6px;
      text-align: center;
      border: 1px solid #bae6fd;
    }
    .stat-label {
      display: block;
      font-size: 13px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .stat-value {
      display: block;
      font-size: 20px;
      font-weight: 600;
      color: #0f172a;
    }
    /* Test Results Styles */
    .test-item {
      background: #f0f9ff;
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 12px;
      border: 1px solid #bae6fd;
    }
    .test-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .test-name {
      font-weight: 500;
      color: #0f172a;
    }
    .significant-badge {
      background: #10b981;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }
    .test-details {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: #64748b;
    }
    /* Plot Styles */
    .plots-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 24px;
    }
    .plot-wrapper {
      background: #f8fafc;
      padding: 20px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .plot {
      width: 100%;
      height: 400px;
    }
    /* Raw Data */
    .toggle-btn {
      padding: 8px 16px;
      background: #f0f9ff;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      color: #0284c7;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 16px;
    }
    .toggle-btn:hover {
      background: #e0f2fe;
      border-color: #60a5fa;
    }
    .raw-data {
      background: #f0f9ff;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 13px;
      margin: 0;
      border: 1px solid #bae6fd;
      color: #1e293b;
      font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      max-height: 400px;
      overflow-y: auto;
    }
    /* Actions */
    .actions {
      display: flex;
      gap: 16px;
      justify-content: center;
    }
    .download-btn, .new-analysis-btn, .retry-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .download-btn {
      background: #06b6d4;
      color: white;
    }
    .download-btn:hover {
      background: #0891b2;
      box-shadow: 0 4px 12px rgba(6, 182, 212, 0.2);
    }
    .new-analysis-btn {
      background: #0284c7;
      color: white;
    }
    .new-analysis-btn:hover {
      background: #0369a1;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
    }
    .retry-btn {
      background: #f87171;
      color: white;
    }
    .retry-btn:hover {
      background: #ef4444;
      box-shadow: 0 4px 12px rgba(248, 113, 113, 0.2);
    }
    /* Tabset styles */
    .test-tabset {
      margin-bottom: 32px;
    }
    .test-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      list-style: none;
      padding: 0;
      border-bottom: 2px solid #bae6fd;
    }
    .test-tab {
      padding: 10px 24px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-bottom: none;
      border-radius: 6px 6px 0 0;
      color: #0284c7;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .test-tab.active {
      background: #06b6d4;
      color: white;
      border-color: #06b6d4;
      font-weight: 600;
    }
    .test-tab-content {
      background: white;
      border-radius: 0 0 8px 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
      border-top: none;
      padding: 24px;
    }
  `]
})
export class ResultsComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  // Angular Material table/filter/sort logic
  displayedColumns: string[] = ['variable', 'estimate', 'pValue', 'fdr', 'statistic'];
  @ViewChild('distributionPlot') distributionPlot?: ElementRef;
  @ViewChild('correlationPlot') correlationPlot?: ElementRef;
  @ViewChild('boxPlot') boxPlot?: ElementRef;
  @ViewChild('scatterPlot') scatterPlot?: ElementRef;

  tableDataSource = new MatTableDataSource<any>([]);
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort; 

  loading = signal(true);
  error = signal<string | null>(null);
  results = signal<AnalysisResult | null>(null);
  showRawData = signal(false);
  selectedTab: string | null = null;
  private lastTab: string | null = null;

  constructor(
    private router: Router,
    private dataFlowService: DataFlowService,
    private apiService: ApiService,
    private navigationService: NavigationService,
    private plotlyService: PlotlyService,
    private cdr: ChangeDetectorRef
  ) {}



  selectTab(tabName: string) {
    if (this.selectedTab === tabName) return;
    // Prima pulisci il vecchio plot se esiste
    const oldPlotContainer = document.getElementById('volcano-plot-' + this.selectedTab);
    if (oldPlotContainer) {
      this.plotlyService.purge(oldPlotContainer);
    }
    this.selectedTab = tabName;
    this.cdr.detectChanges();
    // Crea il nuovo plot
    setTimeout(() => {
      this.createPlots();
      this.lastTab = tabName;
    }, 100);
  }

  updateTableDataSource() {
  const data = this.getTestData(this.selectedTab || '');
  this.tableDataSource.data = data;
  if (this.paginator) {
    this.tableDataSource.paginator = this.paginator;
  }
  if (this.sort) {
    this.tableDataSource.sort = this.sort;
  }
}

  ngOnInit() {
    // Check prerequisites
    const fileData = this.dataFlowService.fileData();
    const preprocessingOptions = this.dataFlowService.preprocessingOptions();
    const analysisOptions = this.dataFlowService.analysisOptions();

    if (!fileData || !preprocessingOptions || !analysisOptions) {
      this.navigationService.navigateToStep('upload');
      return;
    }

    this.submitAnalysis();
  }

  ngAfterViewInit() {
    // Create plots after view is initialized and results are loaded
    const results = this.results();
    if (results?.results) {
      const testNames = this.getTestNames();
      if (testNames.length > 0) {
        this.selectedTab = testNames[0];
        this.lastTab = this.selectedTab;
        this.updateTableDataSource();
      }
      setTimeout(() => this.createPlots(), 0);
    }

  }

  ngAfterViewChecked() {
    // Se la tab è cambiata, aggiorna il plot solo se non è già stato fatto
    if (this.selectedTab && this.selectedTab !== this.lastTab) {
      const plotContainer = document.getElementById('volcano-plot-' + this.selectedTab);
      if (plotContainer && !plotContainer.hasChildNodes()) {
        setTimeout(() => this.createPlots(), 100);
      }
    }
  }

  // Aggiorna la tab selezionata quando arrivano nuovi risultati
  ngDoCheck() {
    const testNames = this.getTestNames();
    if (testNames.length > 0 && (!this.selectedTab || !testNames.includes(this.selectedTab))) {
      this.selectedTab = testNames[0];
      this.lastTab = this.selectedTab;
      this.updateTableDataSource();
    }
  }

  private submitAnalysis() {
    const fileData = this.dataFlowService.fileData();
    const preprocessingOptions = this.dataFlowService.preprocessingOptions();
    const analysisOptions = this.dataFlowService.analysisOptions();

    if (!fileData || !preprocessingOptions || !analysisOptions) {
      return;
    }

    // Use processed file if available, otherwise use original
    const fileToAnalyze = fileData.processedFile || fileData.file;

    // Recupera sessionId e userId
    let userId = window.sessionStorage.getItem('userId');
    if (!userId) {
      userId = 'MasterTest';
      window.sessionStorage.setItem('userId', userId);
    }
    const sessionId = (analysisOptions.sessionId || preprocessingOptions.sessionId || window.sessionStorage.getItem('sessionId') || crypto.randomUUID()) as string;
    const request: AnalysisRequest = {
      sessionId,
      userId,
      file: fileToAnalyze,
      preprocessingOptions: { ...preprocessingOptions, sessionId: sessionId, userId: userId },
      analysisOptions: { ...analysisOptions, sessionId: sessionId, userId: userId }
    };

    this.loading.set(true);
    this.error.set(null);

    // Submit analysis and poll for status/results
    this.apiService.submitAnalysis(request).subscribe({
      next: (_submitResult: any) => {
        // analysisId = userId_sessionId
        const analysisId = `${userId}_${sessionId}`;
        this.pollAnalysisStatus(analysisId);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.error.set(err.message || 'Si è verificato un errore durante l\'invio dell\'analisi');
      }
    });
  }

  private pollAnalysisStatus(analysisId: string) {
    // Polling for status every 2 seconds
    const pollInterval = 2000;
    const poll = () => {
      this.apiService.getAnalysisStatus(analysisId).subscribe({
        next: (status: string) => {
          console.log('[Diagnostica] Risultato API getAnalysisStatus:', status);
          if (status === 'completed') {
            this.getAnalysisResults(analysisId);
          } else if (status === 'failed') {
            this.loading.set(false);
            this.error.set('Analisi fallita');
          } else {
            setTimeout(poll, pollInterval);
          }
        },
        error: (err: any) => {
          this.loading.set(false);
          this.error.set(err.message || 'Errore nel controllo dello stato dell\'analisi');
        }
      });
    };
    poll();
  }

  private getAnalysisResults(analysisId: string) {
    this.apiService.getAnalysisResults(analysisId).subscribe({
      next: (result: AnalysisResult) => {
        console.log('[Diagnostica] Risultato API getAnalysisResults:', result);
        
        // Validate results structure
        if (!result.results) {
          console.error('Invalid results structure:', result);
          this.error.set('Struttura dei risultati non valida');
          this.loading.set(false);
          return;
        }

        // Check if we have any test data
        const testKeys = Object.keys(result.results);
        console.log('Available tests:', testKeys);
        
        if (testKeys.length === 0) {
          console.error('No test results found');
          this.error.set('Nessun risultato di test trovato');
          this.loading.set(false);
          return;
        }

        this.loading.set(false);
        this.results.set(result);
        this.navigationService.updateNavigationStatus();
        setTimeout(() => this.createPlots(), 100);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.error.set(err.message || 'Errore nel recupero dei risultati dell\'analisi');
      }
    });
  }

  private createPlots() {
    // Crea volcano plot solo per il tab attivo
    const results = this.results()?.results;
    if (!results || !this.selectedTab) return;
    
    const test = results[this.selectedTab];
    if (!test?.data || test.data.length === 0) return;
    
    const plotContainer = document.getElementById('volcano-plot-' + this.selectedTab);
    if (!plotContainer) {
      console.warn('Plot container not found for tab:', this.selectedTab);
      return;
    }

    try {
      console.log('Raw test data:', test.data.slice(0, 5)); // Log first 5 rows for debugging
      console.log('Total data points:', test.data.length);
      
      if (!test.data || test.data.length === 0) {
        console.error('No data available for plotting');
        return;
      }

      console.log('Total data points:', test.data.length);
      console.log('First few rows before filtering:', test.data.slice(0, 3));
      
      // Filter data to include only valid rows
      let invalidCount = 0;
      const validData = test.data.filter((row: any) => {
        const x = Number(row.estimate);
        const p = Number(row.pValue);
        
        const isValid = !isNaN(x) && !isNaN(p) && p > 0;
        if (!isValid) {
          invalidCount++;
          if (invalidCount <= 5) { // Log only first 5 invalid rows to avoid console spam
            console.warn('Invalid data point:', {
              row,
              estimate: `${row.estimate} (${typeof row.estimate})`,
              pValue: `${row.pValue} (${typeof row.pValue})`,
              parsedEstimate: x,
              parsedPValue: p
            });
          }
        }
        return isValid;
      });

      console.log('Data validation summary:', {
        totalPoints: test.data.length,
        validPoints: validData.length,
        invalidPoints: invalidCount,
        validationRate: `${((validData.length / test.data.length) * 100).toFixed(1)}%`
      });

      if (validData.length === 0) {
        console.error('No valid data points found for plotting');
        return;
      }
      
      const x = validData.map((row: any) => Array.isArray(row.estimate) ? row.estimate[0] : row.estimate);
      const y = validData.map((row: any) => -Math.log10(row.pValue));



      const labels = validData.map((row: any) => {
        const estimate = Number(row.estimate);
        const pValue = Number(row.pValue);
        const fdr = Number(row.fdr);
        const statistic = Number(row.statistic);
        
        return `Gene: ${row.variable || 'Unknown'}<br>` +
               `Estimate: ${!isNaN(estimate) ? estimate.toFixed(4) : 'N/A'}<br>` +
               `p-value: ${!isNaN(pValue) ? pValue.toFixed(4) : 'N/A'}<br>` +
               `FDR: ${!isNaN(fdr) ? fdr.toFixed(4) : 'N/A'}<br>` +
               `Statistic: ${!isNaN(statistic) ? statistic.toFixed(4) : 'N/A'}`;
      });
      
      console.log(x);
      console.log(y);
      console.log(labels);

      this.plotlyService.createVolcanoPlot(
        plotContainer,
        x,
        y,
        labels,
        {
          title: `Volcano Plot - ${test.testName || this.selectedTab}`,
          xaxis: 'Estimate',
          yaxis: '-log10(p-value)'
        }
      );
    } catch (error) {
      console.error('Error creating volcano plot:', error);
      // Mostra un messaggio di errore nel container del plot
      plotContainer.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444; text-align: center;">
          <div>
            <p>Errore nella creazione del volcano plot.</p>
            <p>Verifica che i dati contengano valori validi per estimate/logFC e p-value.</p>
          </div>
        </div>
      `;
    }
  }

  getStatistics(): any[] {
    const stats = this.results()?.results?.statistics;
    if (!stats) return [];

    return Object.entries(stats).map(([key, value]) => ({
      name: this.formatStatName(key),
      value: typeof value === 'number' ? value.toFixed(2) : value
    }));
  }

  getTestResults(): any[] {
    const tests = this.results()?.results?.testResults;
    if (!tests) return [];

    return Object.values(tests).map((test: any) => ({
      name: test.name || 'Test',
      pValue: test.pValue?.toFixed(4) || 'N/A',
      statistic: test.statistic?.toFixed(3) || test.fStatistic?.toFixed(3) || 'N/A',
      significant: test.significant || false
    }));
  }

  hasScatterData(): boolean {
    return !!this.results()?.results?.plots?.scatter;
  }

  private formatStatName(key: string): string {
    const names: any = {
      mean: 'Media',
      median: 'Mediana',
      stdDev: 'Dev. Standard',
      min: 'Minimo',
      max: 'Massimo',
      count: 'Conteggio'
    };
    return names[key] || key;
  }

  private generateDistributionData(): number[] {
    // Generate random normal distribution for demo
    const data = [];
    for (let i = 0; i < 200; i++) {
      data.push(this.randomNormal(45, 12));
    }
    return data;
  }

  private generateBoxPlotData(): any[] {
    return [
      { name: 'Gruppo A', values: Array.from({length: 50}, () => this.randomNormal(40, 10)) },
      { name: 'Gruppo B', values: Array.from({length: 50}, () => this.randomNormal(50, 15)) },
      { name: 'Gruppo C', values: Array.from({length: 50}, () => this.randomNormal(45, 8)) }
    ];
  }

  private generateScatterData(): any {
    const x = Array.from({length: 100}, () => Math.random() * 100);
    const y = x.map(val => val * 0.8 + this.randomNormal(0, 10));
    return { x, y };
  }

  private randomNormal(mean: number, stdDev: number): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  toggleRawData() {
    this.showRawData.update(v => !v);
  }

  retryAnalysis() {
    this.submitAnalysis();
  }

  downloadResults() {
    const data = JSON.stringify(this.results(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis-results.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  startNewAnalysis() {
    if (confirm('Vuoi iniziare una nuova analisi? I dati attuali verranno persi.')) {
      this.navigationService.resetWorkflow();
    }
  }

  ngOnDestroy() {
    // Clean up Plotly plots
    if (this.distributionPlot?.nativeElement) {
      this.plotlyService.purge(this.distributionPlot.nativeElement);
    }
    if (this.correlationPlot?.nativeElement) {
      this.plotlyService.purge(this.correlationPlot.nativeElement);
    }
    if (this.boxPlot?.nativeElement) {
      this.plotlyService.purge(this.boxPlot.nativeElement);
    }
    if (this.scatterPlot?.nativeElement) {
      this.plotlyService.purge(this.scatterPlot.nativeElement);
    }
  }

  isNumber(val: any): boolean {
    return typeof val === 'number' && !isNaN(val);
  }

  formatNumberCell(val: any): string {
    if (typeof val === 'number' && !isNaN(val)) {
      return val.toFixed(3);
    }
    return val !== undefined && val !== null ? val.toString() : '';
  }

  // Restituisce i nomi dei test presenti nei risultati
  getTestNames(): string[] {
    const res = this.results()?.results;
    return res ? Object.keys(res).filter(key => res[key]?.data) : [];
  }

  // Restituisce i dati per un test specifico
  getTestData(testName: string): any[] {
    const res = this.results()?.results;
    if (!res || !res[testName]?.data) {
      console.log('No test data found for:', testName);
      return [];
    }
    console.log(`Found ${res[testName].data.length} rows for test:`, testName);
    return res[testName].data;
  }

  // Restituisce il nome visualizzato del test
  getTestDisplayName(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    return test?.testName || testKey;
  }
}
