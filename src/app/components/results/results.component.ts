import { Component, OnInit, OnDestroy, signal, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, AfterViewChecked, DoCheck } from '@angular/core';
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

          <!-- Main Section Navigation -->
          <div class="section-navigation">
            <ul class="section-tabs">
              <li class="section-tab" [class.active]="selectedSection === 'bivariate'" (click)="selectSection('bivariate')">
                <span class="section-icon">📊</span>
                <span class="section-label">Analisi Bivariate</span>
                <span class="section-count">({{ getBivariateTests().length }})</span>
              </li>
              <li class="section-tab" [class.active]="selectedSection === 'multivariate'" (click)="selectSection('multivariate')">
                <span class="section-icon">🔬</span>
                <span class="section-label">Analisi Multivariate</span>
                <span class="section-count">({{ getMultivariateTests().length }})</span>
              </li>
              <li class="section-tab" [class.active]="selectedSection === 'summary'" (click)="selectSection('summary')">
                <span class="section-icon">📋</span>
                <span class="section-label">Riepilogo</span>
              </li>
            </ul>
          </div>

          <!-- Bivariate Tests Section -->
          @if (selectedSection === 'bivariate' && getBivariateTests().length > 0) {
            <div class="test-section">
              <div class="section-header">
                <h2>Analisi Bivariate</h2>
                <p>Test di correlazione e associazione tra variabili</p>
              </div>
              <div class="test-tabset">
                <ul class="test-tabs">
                  @for (testKey of getBivariateTests(); track testKey) {
                    <li class="test-tab" [class.active]="selectedBivariateTab === testKey" (click)="selectBivariateTab(testKey)">
                      {{ getTestDisplayName(testKey) }}
                    </li>
                  }
                </ul>
                <div class="test-tab-content">
                  @if (selectedBivariateTab) {
                    <!-- Linear Regression Special Layout -->
                    @if (isLinearRegressionTest(selectedBivariateTab)) {
                      <div class="test-card">
                        <h3>{{ getTestDisplayName(selectedBivariateTab) }}</h3>
                        
                        <!-- Linear Regression Formula -->
                        @if (getLinearRegressionFormula(selectedBivariateTab)) {
                          <div class="regression-formula">
                            <h4>Formula del Modello</h4>
                            <div class="formula-display">
                              {{ getLinearRegressionFormula(selectedBivariateTab) }}
                            </div>
                          </div>
                        }
                        
                        <!-- Main Linear Regression Results -->
                        <div class="regression-section">
                          <h4>Risultati Regressione Lineare</h4>
                          <div class="test-layout" style="display: flex; gap: 32px; align-items: flex-start;">
                            <div class="test-table" style="flex: 2;">
                              <table mat-table [dataSource]="tableDataSource" matSort #sort="matSort" class="mat-elevation-z1" style="width: 100%;">
                                <!-- Dynamic Columns -->
                                @for (column of displayedColumns; track column) {
                                  <ng-container [matColumnDef]="column">
                                    <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ getColumnDisplayName(column) }}</th>
                                    <td mat-cell *matCellDef="let row" [style.text-align]="isNumericColumn(column) ? 'right' : 'left'">
                                      {{ formatCellValue(row[column], column) }}
                                    </td>
                                  </ng-container>
                                }
                                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                                <tr mat-row *matRowDef="let row; columns: displayedColumns;" [ngClass]="getRowClass(row)"></tr>
                              </table>
                              <mat-paginator [pageSize]="10" [pageSizeOptions]="[5, 10, 25, 50]" showFirstLastButtons></mat-paginator>
                            </div>
                            <div class="manhattan-plot" [attr.id]="'manhattan-plot-' + selectedBivariateTab" style="flex: 1; min-width: 300px; height: 400px;"></div>
                          </div>
                        </div>
                        
                        <!-- Results without Influentials (if present) -->
                        @if (hasInfluentialRemovedData(selectedBivariateTab)) {
                          <div class="regression-section">
                            <h4>Risultati senza Valori Influenti</h4>
                            <div class="test-layout" style="display: flex; gap: 32px; align-items: flex-start;">
                              <div class="test-table" style="flex: 2;">
                                <table mat-table [dataSource]="influentialRemovedDataSource" matSort class="mat-elevation-z1" style="width: 100%;">
                                  <!-- Dynamic Columns for influential removed data -->
                                  @for (column of influentialRemovedColumns; track column) {
                                    <ng-container [matColumnDef]="column">
                                      <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ getColumnDisplayName(column) }}</th>
                                      <td mat-cell *matCellDef="let row" [style.text-align]="isNumericColumn(column) ? 'right' : 'left'">
                                        {{ formatCellValue(row[column], column) }}
                                      </td>
                                    </ng-container>
                                  }
                                  <tr mat-header-row *matHeaderRowDef="influentialRemovedColumns"></tr>
                                  <tr mat-row *matRowDef="let row; columns: influentialRemovedColumns;" [ngClass]="getRowClass(row)"></tr>
                                </table>
                                <mat-paginator [pageSize]="10" [pageSizeOptions]="[5, 10, 25, 50]" showFirstLastButtons></mat-paginator>
                              </div>
                              <div class="manhattan-plot" [attr.id]="'manhattan-plot-no-influential-' + selectedBivariateTab" style="flex: 1; min-width: 300px; height: 400px;"></div>
                            </div>
                          </div>
                        }
                      </div>
                    } @else {
                      <!-- Standard Test Layout -->
                      <div class="test-card">
                        <h3>{{ getTestDisplayName(selectedBivariateTab) }}</h3>
                        <div class="test-layout" style="display: flex; gap: 32px; align-items: flex-start;">
                          <div class="test-table" style="flex: 2;">
                            <table mat-table [dataSource]="tableDataSource" matSort #sort="matSort" class="mat-elevation-z1" style="width: 100%;">
                              <!-- Dynamic Columns -->
                              @for (column of displayedColumns; track column) {
                                <ng-container [matColumnDef]="column">
                                  <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ getColumnDisplayName(column) }}</th>
                                  <td mat-cell *matCellDef="let row" [style.text-align]="isNumericColumn(column) ? 'right' : 'left'">
                                    {{ formatCellValue(row[column], column) }}
                                  </td>
                                </ng-container>
                              }
                              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                              <tr mat-row *matRowDef="let row; columns: displayedColumns;" [ngClass]="getRowClass(row)"></tr>
                            </table>
                            <mat-paginator [pageSize]="10" [pageSizeOptions]="[5, 10, 25, 50]" showFirstLastButtons></mat-paginator>
                          </div>
                          <div class="manhattan-plot" [attr.id]="'manhattan-plot-' + selectedBivariateTab" style="flex: 1; min-width: 300px; height: 400px;"></div>
                        </div>
                      </div>
                    }
                  }
                </div>
              </div>
            </div>
          }

          <!-- Multivariate Tests Section -->
          @if (selectedSection === 'multivariate' && getMultivariateTests().length > 0) {
            <div class="test-section">
              <div class="section-header">
                <h2>Analisi Multivariate</h2>
                <p>Modelli complessi e analisi multidimensionali</p>
              </div>
              <div class="test-tabset">
                <ul class="test-tabs">
                  @for (testKey of getMultivariateTests(); track testKey) {
                    <li class="test-tab" [class.active]="selectedMultivariateTab === testKey" (click)="selectMultivariateTab(testKey)">
                      {{ getTestDisplayName(testKey) }}
                    </li>
                  }
                </ul>
                <div class="test-tab-content">
                  @if (selectedMultivariateTab) {
                    <div class="test-card">
                      <h3>{{ getTestDisplayName(selectedMultivariateTab) }}</h3>
                      
                      <!-- Ridge/Lasso/Elastic Net Header Info -->
                      @if (isRegularizationMethod(selectedMultivariateTab)) {
                        <div class="regularization-info">
                          <div class="info-cards">
                            <div class="info-card">
                              <span class="info-label">Lambda Scelto</span>
                              <span class="info-value">{{ getChosenLambda(selectedMultivariateTab) }}</span>
                            </div>
                            @if (selectedMultivariateTab === 'elasticNet') {
                              <div class="info-card">
                                <span class="info-label">Alpha Scelto</span>
                                <span class="info-value">{{ getChosenAlpha(selectedMultivariateTab) }}</span>
                              </div>
                            }
                            <div class="info-card">
                              <span class="info-label">Metrica Migliore</span>
                              <span class="info-value">{{ getBestMetric(selectedMultivariateTab) }}</span>
                            </div>
                          </div>
                        </div>
                      }
                      
                      <div class="test-layout" style="display: flex; gap: 32px; align-items: flex-start;">
                        <div class="test-table" style="flex: 2;">
                          <table mat-table [dataSource]="tableDataSource" matSort #sort="matSort" class="mat-elevation-z1" style="width: 100%;">
                            <!-- Dynamic Columns -->
                            @for (column of displayedColumns; track column) {
                              <ng-container [matColumnDef]="column">
                                <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ getColumnDisplayName(column) }}</th>
                                <td mat-cell *matCellDef="let row" [style.text-align]="isNumericColumn(column) ? 'right' : 'left'">
                                  {{ formatCellValue(row[column], column) }}
                                </td>
                              </ng-container>
                            }
                            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                            <tr mat-row *matRowDef="let row; columns: displayedColumns;" [ngClass]="getRowClass(row)"></tr>
                          </table>
                          <mat-paginator [pageSize]="10" [pageSizeOptions]="[5, 10, 25, 50]" showFirstLastButtons></mat-paginator>
                        </div>
                        <div class="feature-importance-plot" [attr.id]="'feature-plot-' + selectedMultivariateTab" style="flex: 1; min-width: 300px; height: 400px;">
                          @if (isRegularizationMethod(selectedMultivariateTab)) {
                            <!-- Feature importance plot will be rendered here -->
                          } @else {
                            <!-- Manhattan plot for other multivariate methods -->
                            <div [attr.id]="'manhattan-plot-' + selectedMultivariateTab" style="width: 100%; height: 100%;"></div>
                          }
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
          }

          <!-- Summary Section -->
          @if (selectedSection === 'summary') {
            <div class="test-section">
              <div class="section-header">
                <h2>Riepilogo dell'Analisi</h2>
                <p>Panoramica generale dei risultati ottenuti</p>
              </div>
              <div class="test-tabset">
                <ul class="test-tabs">
                  <li class="test-tab active">
                    Riepilogo Generale
                  </li>
                </ul>
                <div class="test-tab-content">
                  <div class="test-card">
                    <h3>Riepilogo Generale</h3>
                    <div class="summary-content">
                      <div class="summary-placeholder">
                        <div class="placeholder-icon">📈</div>
                        <h4>Sezione Riepilogo</h4>
                        <p>Questa sezione conterrà un riepilogo completo di tutti i risultati dell'analisi.</p>
                        <p class="placeholder-note">Funzionalità in fase di sviluppo...</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- Empty State -->
          @if ((selectedSection === 'bivariate' && getBivariateTests().length === 0) || 
               (selectedSection === 'multivariate' && getMultivariateTests().length === 0)) {
            <div class="empty-section">
              <div class="empty-icon">🔍</div>
              <h3>Nessun risultato trovato</h3>
              <p>Non sono stati trovati risultati per questa categoria di test.</p>
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

    /* Section Navigation Styles */
    .section-navigation {
      margin-bottom: 32px;
    }
    .section-tabs {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      list-style: none;
      padding: 0;
      justify-content: center;
    }
    .section-tab {
      padding: 16px 24px;
      background: white;
      border: 2px solid #bae6fd;
      border-radius: 12px;
      color: #0284c7;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      min-width: 180px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .section-tab:hover {
      border-color: #06b6d4;
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    }
    .section-tab.active {
      background: linear-gradient(135deg, #06b6d4 0%, #0284c7 100%);
      color: white;
      border-color: #06b6d4;
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(6, 182, 212, 0.3);
    }
    .section-icon {
      font-size: 24px;
    }
    .section-label {
      font-weight: 600;
    }
    .section-count {
      font-size: 13px;
      opacity: 0.8;
    }

    /* Section Content Styles */
    .test-section {
      margin-bottom: 32px;
    }
    .section-header {
      margin-bottom: 24px;
      text-align: center;
    }
    .section-header h2 {
      color: #0f172a;
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 600;
    }
    .section-header p {
      color: #64748b;
      margin: 0;
      font-size: 16px;
    }

    /* Summary Section Styles */
    .summary-content {
      padding: 24px;
    }
    .summary-placeholder {
      text-align: center;
      max-width: 500px;
      margin: 0 auto;
    }
    .placeholder-icon {
      font-size: 64px;
      margin-bottom: 24px;
    }
    .summary-placeholder h4 {
      color: #0f172a;
      margin: 0 0 16px 0;
      font-size: 24px;
      font-weight: 600;
    }
    .summary-placeholder p {
      color: #64748b;
      margin: 0 0 12px 0;
      font-size: 16px;
      line-height: 1.6;
    }
    .placeholder-note {
      color: #94a3b8 !important;
      font-style: italic;
      font-size: 14px !important;
    }

    /* Empty State Styles */
    .empty-section {
      background: white;
      border-radius: 12px;
      padding: 48px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      border: 2px solid #e5e7eb;
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.6;
    }
    .empty-section h3 {
      color: #6b7280;
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 500;
    }
    .empty-section p {
      color: #9ca3af;
      margin: 0;
      font-size: 14px;
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

    /* Regularization Method Info Styles */
    .regularization-info {
      margin-bottom: 24px;
      padding: 16px;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 8px;
      border: 1px solid #bae6fd;
    }
    .info-cards {
      display: flex;
      gap: 16px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .info-card {
      background: white;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 120px;
    }
    .info-label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 4px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 16px;
      color: #0f172a;
      font-weight: 600;
    }

    /* Table Styles */
    .significant-pvalue {
      background-color: #dbeafe !important; /* Light blue for p-value < 0.05 */
    }
    
    .significant-pvalue:hover {
      background-color: #bfdbfe !important;
    }

    .significant-fdr {
      background-color: #dcfce7 !important; /* Light green for FDR < 0.05 */
    }
    
    .significant-fdr:hover {
      background-color: #bbf7d0 !important;
    }

    .mat-mdc-table {
      background: white;
    }

    .mat-mdc-header-cell {
      font-weight: 600;
      color: #374151;
    }

    /* Linear Regression Specific Styles */
    .regression-formula {
      margin-bottom: 24px;
      padding: 16px;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 8px;
      border: 1px solid #bae6fd;
    }
    .regression-formula h4 {
      margin: 0 0 12px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 600;
    }
    .formula-display {
      font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-size: 14px;
      color: #0c4a6e;
      background: white;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      font-weight: 500;
    }
    .regression-section {
      margin-bottom: 32px;
      padding: 16px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .regression-section h4 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 18px;
      font-weight: 600;
      padding-bottom: 8px;
      border-bottom: 2px solid #bae6fd;
    }
  `]
})
export class ResultsComponent implements OnInit, AfterViewInit, AfterViewChecked, DoCheck, OnDestroy {
  // Angular Material table/filter/sort logic - now dynamic
  displayedColumns: string[] = [];
  @ViewChild('distributionPlot') distributionPlot?: ElementRef;
  @ViewChild('correlationPlot') correlationPlot?: ElementRef;
  @ViewChild('boxPlot') boxPlot?: ElementRef;
  @ViewChild('scatterPlot') scatterPlot?: ElementRef;

  tableDataSource = new MatTableDataSource<any>([]);
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort; 

  // Linear regression specific data sources
  influentialRemovedDataSource = new MatTableDataSource<any>([]);
  influentialRemovedColumns: string[] = []; 

  loading = signal(true);
  error = signal<string | null>(null);
  results = signal<AnalysisResult | null>(null);
  showRawData = signal(false);
  selectedTab: string | null = null;
  private lastTab: string | null = null;
  
  // Section management
  selectedSection: 'bivariate' | 'multivariate' | 'summary' = 'bivariate';
  selectedBivariateTab: string | null = null;
  selectedMultivariateTab: string | null = null;

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
    const oldPlotContainer = document.getElementById('manhattan-plot-' + this.selectedTab);
    if (oldPlotContainer) {
      this.plotlyService.purge(oldPlotContainer);
    }
    // Also clean up influential-removed plot if it exists
    const oldInfluentialPlotContainer = document.getElementById('manhattan-plot-no-influential-' + this.selectedTab);
    if (oldInfluentialPlotContainer) {
      this.plotlyService.purge(oldInfluentialPlotContainer);
    }
    
    this.selectedTab = tabName;
    
    // Update table structure and data for the new tab
    this.updateTableForCurrentTab();
    
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
    
    // Force change detection and reconnect paginator/sort
    setTimeout(() => {
      if (this.paginator) {
        this.tableDataSource.paginator = this.paginator;
        this.paginator.firstPage(); // Reset to first page
      }
      if (this.sort) {
        this.tableDataSource.sort = this.sort;
        this.sort.active = ''; // Reset sorting
        this.sort.direction = '';
      }
      this.cdr.detectChanges();
    }, 0);
  }

  updateTableForCurrentTab() {
    if (!this.selectedTab) return;
    
    // Get the columns for the current test
    this.displayedColumns = this.getColumnsForTest(this.selectedTab);
    
    // Update the data source with proper reinitialization
    this.updateTableDataSource();
    
    // Handle linear regression tests with influential removed data
    if (this.isLinearRegressionTest(this.selectedTab)) {
      this.updateInfluentialRemovedTable(this.selectedTab);
    }
    
    // Force view update to ensure Material Table recognizes new structure
    this.cdr.detectChanges();
  }

  getColumnsForTest(testName: string): string[] {
    const testData = this.getTestData(testName);
    if (!testData || testData.length === 0) {
      return [];
    }
    
    // Get all unique keys from the first few rows to determine columns
    const sampleSize = Math.min(5, testData.length);
    const allKeys = new Set<string>();
    
    for (let i = 0; i < sampleSize; i++) {
      Object.keys(testData[i] || {}).forEach(key => allKeys.add(key));
    }
    
    return Array.from(allKeys);
  }

  getColumnDisplayName(columnKey: string): string {
    // Map internal column names to user-friendly display names
    const columnMap: { [key: string]: string } = {
      'variable': 'Variable',
      'Variable': 'Variable',
      'gene': 'Gene',
      'feature': 'Feature',
      'estimate': 'Estimate',
      'logFC': 'Log FC',
      'coefficient': 'Coefficient',
      'Coefficient': 'Coefficient',
      'pValue': 'p-value',
      'pval': 'p-value',
      'p_value': 'p-value',
      'fdr': 'FDR',
      'adj_pval': 'Adj. p-value',
      'padj': 'Adj. p-value',
      'statistic': 'Statistic',
      'tstat': 't-statistic',
      'zstat': 'z-statistic',
      'correlation': 'Correlation',
      'importance': 'Importance',
      'decision': 'Decision',
      'rank': 'Rank',
      'sign': 'Sign'
    };
    
    return columnMap[columnKey] || this.formatColumnName(columnKey);
  }

  private formatColumnName(columnKey: string): string {
    // Convert camelCase or snake_case to Title Case
    return columnKey
      .replace(/([A-Z])/g, ' $1') // camelCase to space separated
      .replace(/_/g, ' ') // snake_case to space separated
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  }

  isNumericColumn(columnKey: string): boolean {
    // Define which columns should be treated as numeric for right alignment
    const numericColumns = [
      'estimate', 'logFC', 'coefficient', 'Coefficient', 'pValue', 'pval', 'p_value',
      'fdr', 'adj_pval', 'padj', 'statistic', 'tstat', 'zstat',
      'correlation', 'importance', 'rank', 'sign'
    ];
    return numericColumns.includes(columnKey);
  }

  formatCellValue(value: any, columnKey: string): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    // Special handling for sign column
    if (columnKey === 'sign') {
      if (value === 1) return '+';
      if (value === -1) return '-';
      if (value === 0) return '0';
      return value.toString();
    }
    
    // Special formatting for different column types
    if (this.isNumericColumn(columnKey)) {
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        // Use scientific notation for very large or very small numbers
        if (Math.abs(numValue) >= 1e6 || (Math.abs(numValue) <= 1e-6 && numValue !== 0)) {
          return numValue.toExponential(2);
        }
        
        // Different precision for different types of values using standard notation
        if (columnKey.includes('pValue') || columnKey.includes('fdr') || 
            columnKey.includes('pval') || columnKey.includes('padj')) {
          return numValue.toFixed(6); // 6 decimals for p-values in standard notation
        } else if (columnKey.includes('correlation')) {
          return numValue.toFixed(3); // 3 decimals for correlations
        } else if (columnKey === 'Coefficient' || columnKey === 'coefficient') {
          return numValue.toFixed(4); // 4 decimals for coefficients
        } else if (columnKey === 'importance') {
          return numValue.toFixed(2); // 2 decimals for importance
        } else {
          return numValue.toFixed(4); // 4 decimals for other numeric values
        }
      }
    }
    
    // For boolean or categorical values
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    return value.toString();
  }

  getRowClass(row: any): string {
    // Dynamic row styling based on significance
    const classes: string[] = [];
    
    // Check for FDR significance first (higher priority - light green)
    const fdrFields = ['fdr', 'adj_pval', 'padj'];
    for (const field of fdrFields) {
      if (row[field] !== undefined && row[field] !== null) {
        const fdrVal = Number(row[field]);
        if (!isNaN(fdrVal) && fdrVal < 0.05) {
          classes.push('significant-fdr');
          return classes.join(' '); // Return early, FDR takes priority
        }
      }
    }
    
    // Check for p-value significance (light blue)
    const pValueFields = ['pValue', 'pval', 'p_value'];
    for (const field of pValueFields) {
      if (row[field] !== undefined && row[field] !== null) {
        const pVal = Number(row[field]);
        if (!isNaN(pVal) && pVal < 0.05) {
          classes.push('significant-pvalue');
          break;
        }
      }
    }
    
    // Check for decision-based significance (e.g., Boruta results)
    if (row.decision && (row.decision === 'Confirmed' || row.decision === 'Important')) {
      classes.push('significant-fdr'); // Use green for confirmed features
    }
    
    return classes.join(' ');
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
      this.initializeDefaultSelections();
      setTimeout(() => this.createPlots(), 0);
    }
    
    // Initialize table components
    setTimeout(() => {
      if (this.paginator) {
        this.tableDataSource.paginator = this.paginator;
      }
      if (this.sort) {
        this.tableDataSource.sort = this.sort;
      }
    }, 100);
  }

  private initializeDefaultSelections() {
    const bivariateTests = this.getBivariateTests();
    const multivariateTests = this.getMultivariateTests();
    
    // Set default section based on available tests
    if (bivariateTests.length > 0) {
      this.selectedSection = 'bivariate';
      this.selectedBivariateTab = bivariateTests[0];
      this.selectedTab = this.selectedBivariateTab;
    } else if (multivariateTests.length > 0) {
      this.selectedSection = 'multivariate';
      this.selectedMultivariateTab = multivariateTests[0];
      this.selectedTab = this.selectedMultivariateTab;
    } else {
      this.selectedSection = 'summary';
      this.selectedTab = null;
    }
    
    if (this.selectedTab) {
      this.lastTab = this.selectedTab;
      this.updateTableForCurrentTab();
    }
  }

  ngAfterViewChecked() {
    // Se la tab è cambiata, aggiorna il plot solo se non è già stato fatto
    if (this.selectedTab && this.selectedTab !== this.lastTab) {
      const plotContainer = document.getElementById('manhattan-plot-' + this.selectedTab);
      if (plotContainer && !plotContainer.hasChildNodes()) {
        setTimeout(() => this.createPlots(), 100);
      }
    }
  }

  // Aggiorna la tab selezionata quando arrivano nuovi risultati
  ngDoCheck() {
    const results = this.results();
    if (results?.results && (!this.selectedTab || !this.selectedSection)) {
      this.initializeDefaultSelections();
      
      // Ensure table components are properly connected after initialization
      setTimeout(() => {
        if (this.paginator) {
          this.tableDataSource.paginator = this.paginator;
        }
        if (this.sort) {
          this.tableDataSource.sort = this.sort;
        }
      }, 50);
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
        this.initializeDefaultSelections();
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
    const results = this.results()?.results;
    if (!results || !this.selectedTab) return;
    
    const test = results[this.selectedTab];
    if (!test?.data || test.data.length === 0) return;
    
    // Handle regularization methods (Ridge, Lasso, Elastic Net) with feature importance plots
    if (this.isRegularizationMethod(this.selectedTab)) {
      this.createFeatureImportancePlot();
      return;
    }
    
    // Create main Manhattan plot
    this.createManhattanPlot(this.selectedTab, test.data, 'manhattan-plot-' + this.selectedTab);
    
    // For linear regression tests, also create the influential-removed plot if data exists
    if (this.isLinearRegressionTest(this.selectedTab) && this.hasInfluentialRemovedData(this.selectedTab)) {
      const influentialRemovedData = this.getInfluentialRemovedData(this.selectedTab);
      this.createManhattanPlot(this.selectedTab, influentialRemovedData, 'manhattan-plot-no-influential-' + this.selectedTab);
    }
  }

  private createManhattanPlot(testKey: string, data: any[], containerId: string) {
    const plotContainer = document.getElementById(containerId);
    if (!plotContainer) {
      console.warn('Plot container not found:', containerId);
      return;
    }

    try {
      console.log(`Creating Manhattan plot for ${testKey} with ${data.length} data points`);
      
      if (!data || data.length === 0) {
        console.error('No data available for plotting');
        return;
      }

      // Filter data to include only valid rows
      let invalidCount = 0;
      const validData = data.filter((row: any) => {
        // Detect p-value column dynamically
        const pValueFields = ['pValue', 'pval', 'p_value'];
        const pValueField = pValueFields.find(field => row[field] !== undefined && row[field] !== null);
        
        if (!pValueField) return false;
        
        const p = Number(row[pValueField]);
        const hasVariable = row.variable && row.variable.toString().trim() !== '';
        
        const isValid = !isNaN(p) && p > 0 && hasVariable;
        if (!isValid) {
          invalidCount++;
          if (invalidCount <= 5) { // Log only first 5 invalid rows to avoid console spam
            console.warn('Invalid data point:', {
              row,
              variable: `${row.variable} (${typeof row.variable})`,
              pValueField,
              pValue: `${row[pValueField]} (${typeof row[pValueField]})`,
              parsedPValue: p,
              hasVariable
            });
          }
        }
        return isValid;
      });

      console.log('Data validation summary:', {
        totalPoints: data.length,
        validPoints: validData.length,
        invalidPoints: invalidCount,
        validationRate: `${((validData.length / data.length) * 100).toFixed(1)}%`,
        availableColumns: Object.keys(data[0] || {})
      });

      if (validData.length === 0) {
        console.error('No valid data points found for plotting');
        return;
      }
      
      // Detect the actual p-value column name
      const pValueFields = ['pValue', 'pval', 'p_value'];
      const pValueColumn = pValueFields.find(field => validData[0][field] !== undefined) || 'pValue';
      
      console.log('Using p-value column:', pValueColumn);
      console.log('Sample data point:', validData[0]);

      const test = this.results()?.results?.[testKey];
      const plotTitle = containerId.includes('no-influential') 
        ? `Manhattan Plot (No Influentials) - ${test?.testName || testKey}`
        : `Manhattan Plot - ${test?.testName || testKey}`;

      this.plotlyService.createManhattanPlot(
        plotContainer,
        validData,
        {
          title: plotTitle,
          xaxis: 'Variables',
          yaxis: '-log10(p-value)',
          significanceLine: true,
          significanceThreshold: -Math.log10(0.05),
          variableColumn: 'variable',
          pValueColumn: pValueColumn
        }
      );
    } catch (error) {
      console.error('Error creating manhattan plot:', error);
      // Mostra un messaggio di errore nel container del plot
      plotContainer.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444; text-align: center;">
          <div>
            <p>Errore nella creazione del manhattan plot.</p>
            <p>Verifica che i dati contengano valori validi per variable e p-value.</p>
          </div>
        </div>
      `;
    }
  }

  private createFeatureImportancePlot() {
    const results = this.results()?.results;
    if (!results || !this.selectedTab) return;
    
    const test = results[this.selectedTab];
    if (!test?.data || test.data.length === 0) return;
    
    const plotContainer = document.getElementById('feature-plot-' + this.selectedTab);
    if (!plotContainer) {
      console.warn('Feature plot container not found for tab:', this.selectedTab);
      return;
    }

    try {
      console.log('Creating feature importance plot for:', this.selectedTab);
      console.log('Raw data length:', test.data.length);
      console.log('Sample data:', test.data.slice(0, 3));

      // Filter data - be more lenient with filtering
      const filteredData = test.data
        .filter((row: any) => {
          const importance = Number(row.importance);
          const hasVariable = row.Variable || row.variable;
          const isValid = hasVariable && !isNaN(importance) && importance !== null && importance !== undefined;
          
          if (!isValid) {
            console.log('Filtered out row:', row);
          }
          
          return isValid;
        })
        .sort((a: any, b: any) => {
          const aImp = Number(a.importance);
          const bImp = Number(b.importance);
          return bImp - aImp;
        })
        .slice(0, 20);

      console.log('Filtered data length:', filteredData.length);
      console.log('Filtered data sample:', filteredData.slice(0, 5));

      if (filteredData.length === 0) {
        plotContainer.innerHTML = `
          <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #64748b; text-align: center;">
            <div>
              <p>Nessuna caratteristica trovata</p>
              <p>Verificare che i dati contengano le colonne 'importance' e 'Variable'/'variable'</p>
            </div>
          </div>
        `;
        return;
      }

      // Prepare data for horizontal bar plot
      const variables = filteredData.map((row: any) => row.Variable || row.variable || `Feature_${Math.random()}`);
      const importances = filteredData.map((row: any) => Number(row.importance));
      const signs = filteredData.map((row: any) => {
        const sign = Number(row.sign);
        return isNaN(sign) ? 0 : sign;
      });
      
      console.log('Variables:', variables.length, variables.slice(0, 5));
      console.log('Importances:', importances.length, importances.slice(0, 5));
      console.log('Signs:', signs.length, signs.slice(0, 5));
      
      // Create colors based on sign: positive = blue, negative = red, zero = gray
      const colors = signs.map((sign: number) => {
        if (sign > 0) return '#06b6d4'; // Blue for positive
        if (sign < 0) return '#ef4444'; // Red for negative
        return '#64748b'; // Gray for zero
      });

      const plotData = [{
        type: 'bar',
        orientation: 'h',
        x: importances,
        y: variables,
        marker: {
          color: colors
        },
        text: importances.map((imp: number) => imp.toFixed(1)),
        textposition: 'outside',
        hovertemplate: '<b>%{y}</b><br>Importanza: %{x:.2f}<extra></extra>'
      }];

      const layout = {
        title: {
          text: `Top ${filteredData.length} Features - ${test.testName || this.selectedTab}`,
          font: { size: 14 }
        },
        xaxis: {
          title: 'Importanza (%)',
          showgrid: true,
          gridcolor: '#e2e8f0'
        },
        yaxis: {
          title: '',
          showgrid: false,
          automargin: true,
          type: 'category'
        },
        margin: { l: 150, r: 40, t: 60, b: 40 },
        plot_bgcolor: 'white',
        paper_bgcolor: 'white',
        font: { family: 'system-ui, sans-serif', size: 11 },
        showlegend: false,
        height: Math.max(400, filteredData.length * 25 + 100)
      };

      const config = {
        responsive: true,
        displayModeBar: false
      };

      console.log('Creating plot with data:', plotData);
      console.log('Layout:', layout);

      // Use Plotly to create the plot
      (window as any).Plotly.newPlot(plotContainer, plotData, layout, config);

    } catch (error) {
      console.error('Error creating feature importance plot:', error);
      plotContainer.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444; text-align: center;">
          <div>
            <p>Errore nella creazione del grafico delle caratteristiche.</p>
            <p>Errore: ${error}</p>
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

  // Methods for regularization methods (Ridge, Lasso, Elastic Net)
  isRegularizationMethod(testKey: string): boolean {
    return ['ridge', 'lasso', 'elasticNet'].includes(testKey);
  }

  getChosenLambda(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.chosen_lambda !== undefined) {
      return Number(test.chosen_lambda).toFixed(4);
    }
    return 'N/A';
  }

  getChosenAlpha(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.chosen_alpha !== undefined) {
      return Number(test.chosen_alpha).toFixed(4);
    }
    return 'N/A';
  }

  getBestMetric(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.best_metric !== undefined) {
      return Number(test.best_metric).toFixed(4);
    }
    return 'N/A';
  }

  // Methods for categorizing tests by type
  getBivariateTests(): string[] {
    const testNames = this.getTestNames();
    console.log('All available test names:', testNames); // Debug log to see what tests are returned
    
    // Bivariate tests from the first sections: Statistical Tests, Correlation Tests, Linear Regressions
    const bivariateKeywords = [
      // Statistical Tests - including both underscore and hyphen formats
      'student-t', 'student_t', 'welch-t', 'welch_t', 'anova', 'welch-anova', 'welch_anova', 
      'wilcoxon', 'kruskal-wallis', 'kruskal_wallis', 'kw',
      // Correlation Tests  
      'pearson', 'spearman',
      // Linear Regressions
      'linearregression', 'linear-regression', 'linear_regression', 'lm', 'regression', 'lr'
    ];
    
    const filteredTests = testNames.filter(test => 
      bivariateKeywords.some(keyword => test.toLowerCase().includes(keyword)) ||
      test.toLowerCase().includes('ttest') ||
      test.toLowerCase().includes('correlation')
    );
    
    console.log('Filtered bivariate tests:', filteredTests); // Debug log to see what gets filtered
    return filteredTests;
  }

  // Linear Regression specific methods
  isLinearRegressionTest(testKey: string): boolean {
    const linearRegressionKeywords = ['linearregression', 'linear-regression', 'linear_regression', 'lm', 'regression', 'lr'];
    return linearRegressionKeywords.some(keyword => testKey.toLowerCase().includes(keyword));
  }

  getLinearRegressionFormula(testKey: string): string | null {
    const test = this.results()?.results?.[testKey];
    if (test?.formula) {
      return test.formula;
    }
    // If no formula is provided by the API, we can construct a generic one
    if (this.isLinearRegressionTest(testKey)) {
      return 'outcome ~ covariates + omic_variables';
    }
    return null;
  }

  hasInfluentialRemovedData(testKey: string): boolean {
    const test = this.results()?.results?.[testKey];
    return !!(test?.data_removed_influentials && test.data_removed_influentials.length > 0);
  }

  getInfluentialRemovedData(testKey: string): any[] {
    const test = this.results()?.results?.[testKey];
    return test?.data_removed_influentials || [];
  }

  updateInfluentialRemovedTable(testKey: string) {
    if (!this.hasInfluentialRemovedData(testKey)) return;
    
    const data = this.getInfluentialRemovedData(testKey);
    this.influentialRemovedDataSource.data = data;
    
    // Get columns for influential removed data
    if (data.length > 0) {
      const sampleSize = Math.min(5, data.length);
      const allKeys = new Set<string>();
      
      for (let i = 0; i < sampleSize; i++) {
        Object.keys(data[i] || {}).forEach(key => allKeys.add(key));
      }
      
      this.influentialRemovedColumns = Array.from(allKeys);
    }
  }

  getMultivariateTests(): string[] {
    const testNames = this.getTestNames();
    // Multivariate tests from the Multivariate Analysis/Feature Selection section
    const multivariateKeywords = [
      'ridge', 'lasso', 'elastic', 'elasticnet', 'elastic-net',
      'randomforest', 'random-forest', 'random_forest',
      'boruta', 'rfe', 'recursive-feature', 'feature-elimination'
    ];
    
    return testNames.filter(test => 
      multivariateKeywords.some(keyword => test.toLowerCase().includes(keyword))
    );
  }

  // Section management methods
  selectSection(section: 'bivariate' | 'multivariate' | 'summary') {
    if (this.selectedSection === section) return;
    
    // Clean up previous plots
    this.cleanupPlots();
    
    this.selectedSection = section;
    
    // Reset tab selections when switching sections
    if (section === 'bivariate') {
      const bivariateTests = this.getBivariateTests();
      this.selectedBivariateTab = bivariateTests.length > 0 ? bivariateTests[0] : null;
      this.selectedTab = this.selectedBivariateTab;
    } else if (section === 'multivariate') {
      const multivariateTests = this.getMultivariateTests();
      this.selectedMultivariateTab = multivariateTests.length > 0 ? multivariateTests[0] : null;
      this.selectedTab = this.selectedMultivariateTab;
    } else {
      this.selectedTab = null;
    }
    
    if (this.selectedTab) {
      this.updateTableForCurrentTab();
      this.cdr.detectChanges();
      setTimeout(() => this.createPlots(), 100);
    }
  }

  selectBivariateTab(tabName: string) {
    this.selectedBivariateTab = tabName;
    this.selectTab(tabName);
  }

  selectMultivariateTab(tabName: string) {
    this.selectedMultivariateTab = tabName;
    this.selectTab(tabName);
  }

  private cleanupPlots() {
    // Clean up all existing plots when switching sections
    const allTestNames = this.getTestNames();
    allTestNames.forEach(testName => {
      const plotContainer = document.getElementById('manhattan-plot-' + testName);
      if (plotContainer) {
        this.plotlyService.purge(plotContainer);
      }
      
      // Also clean up influential-removed plots for linear regression
      const influentialPlotContainer = document.getElementById('manhattan-plot-no-influential-' + testName);
      if (influentialPlotContainer) {
        this.plotlyService.purge(influentialPlotContainer);
      }
    });
  }
}
