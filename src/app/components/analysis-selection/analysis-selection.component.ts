import { Component, signal, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataFlowService } from '../../services/data-flow.service';
import { NavigationService } from '../../services/navigation.service';
import { FileParserService } from '../../services/file-parser.service';
import { PlotlyService } from '../../services/plotly.service';
import { AnalysisOptions, FilePreview } from '../../models/interfaces';

@Component({
  selector: 'app-analysis-selection',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="content-wrapper">
      <div class="page-header">
        <h1>Seleziona le Analisi</h1>
        <p>Scegli quali test e metodologie applicare ai tuoi dati preprocessati</p>
      </div>

      <!-- Analysis Type Indicator -->
      @if (preprocessingInfo) {
        <div class="analysis-type-banner" [class.classification]="isClassification" [class.regression]="isRegression">
          <div class="analysis-type-content">
            <span class="analysis-type-label">
              @if (isClassification) {
                🎯 Analisi di Classificazione
              } @else {
                📈 Analisi di Regressione
              }
            </span>
            <span class="analysis-type-description">{{ getAnalysisTypeDescription() }}</span>
          </div>
        </div>
      }

      <!-- Preprocessed File Preview -->
      @if (filePreview()) {
        <div class="preview-section">
          <h2>Anteprima File Preprocessato</h2>
          <div class="file-info-bar">
            <span>File: processed_{{ originalFileName }}</span>
            <span>Righe: {{ filePreview()!.totalRows }}</span>
            <span>Colonne: {{ filePreview()!.headers.length }}</span>
            <span class="status-badge">✓ Preprocessato</span>
          </div>
          
          <div class="table-container">
            <table class="preview-table">
              <thead>
                <tr>
                  <th class="index-col">#</th>
                  @for (header of filePreview()!.headers; track $index) {
                    <th>
                      <div class="header-cell">
                        <span class="header-name">{{ header }}</span>
                        @if (isOutcomeColumn(header)) {
                          <span class="column-badge outcome">Outcome</span>
                        }
                        @if (isOmicsColumn(header)) {
                          <span class="column-badge omics">Omics</span>
                        }
                        @if (isCovariateColumn(header)) {
                          <span class="column-badge covariate">Covariate</span>
                        }
                        @if (isIdColumn(header)) {
                          <span class="column-badge id">ID</span>
                        }
                      </div>
                    </th>
                  }


                </tr>
              </thead>
              <tbody>
                @for (row of filePreview()!.rows; track $index) {
                  <tr>
                    <td class="index-col">{{ $index + 1 }}</td>
                    @for (cell of row; track $index) {
                      <td>{{ formatCell(cell) }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          
          @if (filePreview()!.totalRows > 10) {
            <p class="preview-note">Mostrando solo le prime 10 righe di {{ filePreview()!.totalRows }}</p>
          }
        </div>
      }

      <!-- Grouping Method Section - Only for Regression Analysis -->
      @if (isRegression) {
        <div class="grouping-section">
          <h2>Metodo di Raggruppamento</h2>
          <p class="section-desc">Scegli come raggruppare i dati per i test bivariati (non applicabile a correlazioni)</p>
        
        <div class="grouping-container">
          <div class="grouping-options">
            <label class="radio-option">
              <input type="radio" 
                     name="grouping" 
                     value="none"
                     [(ngModel)]="options.groupingMethod"
                     (change)="onGroupingMethodChange()">
              <span class="radio-custom"></span>
              <div class="option-content">
                <h3>Nessun Raggruppamento</h3>
                <p>Usa la variabile outcome così com'è (deve essere già categorica)</p>
              </div>
            </label>

            <label class="radio-option">
              <input type="radio" 
                     name="grouping" 
                     value="tertiles"
                     [(ngModel)]="options.groupingMethod"
                     (change)="onGroupingMethodChange()">
              <span class="radio-custom"></span>
              <div class="option-content">
                <h3>Divisione in Terzili</h3>
                <p>Dividi automaticamente l'outcome in tre gruppi uguali</p>
              </div>
            </label>

            <label class="radio-option">
              <input type="radio" 
                     name="grouping" 
                     value="threshold"
                     [(ngModel)]="options.groupingMethod"
                     (change)="onGroupingMethodChange()">
              <span class="radio-custom"></span>
              <div class="option-content">
                <h3>Soglie Personalizzate</h3>
                <p>Definisci i valori di cutoff per creare gruppi</p>
              </div>
            </label>
          </div>

          @if (options.groupingMethod === 'threshold') {
            <div class="threshold-input">
              <label>Valori Soglia (separati da virgola)</label>
              <input type="text" 
                     [(ngModel)]="thresholdInput"
                     placeholder="es: 0.5, 1.5 (crea 3 gruppi: <0.5, 0.5-1.5, >1.5)"
                     class="threshold-input-field"
                     (input)="validateThresholds()">
              @if (thresholdError) {
                <span class="error-text">{{ thresholdError }}</span>
              }
              @if (thresholdInfo) {
                <span class="info-text">{{ thresholdInfo }}</span>
              }
            </div>
          }

          <!-- Outcome Distribution Histogram -->
          @if (outcomeValues.length > 0) {
            <div class="outcome-histogram">
              <h3>Distribuzione Outcome</h3>
              <div #outcomeHistogram class="histogram-plot"></div>
            </div>
          }
        </div>
      </div>
      }

      <div class="analysis-container">
        <!-- Statistical Tests Section - Only for Regression Analysis -->
        @if (isRegression) {
          <div class="analysis-section">
            <h2>Test Statistici Bivariati</h2>
            <p class="section-desc">Confronta i gruppi definiti sopra</p>
          
          <div class="test-category">
            <h3>Test Parametrici</h3>
            <div class="test-grid">
              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('student-t')"
                         (change)="toggleTest('student-t')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Student T-Test</h4>
                    <p>Per dati normali con varianze uguali</p>
                  </div>
                </label>
              </div>

              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('welch-t')"
                         (change)="toggleTest('welch-t')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Welch T-Test</h4>
                    <p>Per dati normali con varianze diverse</p>
                  </div>
                </label>
              </div>

              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('anova')"
                         (change)="toggleTest('anova')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>ANOVA</h4>
                    <p>Confronto tra più gruppi (varianze uguali)</p>
                  </div>
                </label>
              </div>

              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('welch-anova')"
                         (change)="toggleTest('welch-anova')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Welch ANOVA</h4>
                    <p>Confronto tra più gruppi (varianze diverse)</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div class="test-category">
            <h3>Test Non Parametrici</h3>
            <div class="test-grid">
              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('wilcoxon')"
                         (change)="toggleTest('wilcoxon')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Wilcoxon Test</h4>
                    <p>Alternativa non parametrica al T-Test</p>
                  </div>
                </label>
              </div>

              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('kruskal-wallis')"
                         (change)="toggleTest('kruskal-wallis')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Kruskal-Wallis</h4>
                    <p>Alternativa non parametrica all'ANOVA</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Correlation Tests Section -->
        <div class="analysis-section">
          <h2>Test di Correlazione</h2>
          <p class="section-desc">Analizza le relazioni tra variabili continue</p>
          
          <div class="test-grid">
            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" 
                       [checked]="isTestSelected('pearson')"
                       (change)="toggleTest('pearson')">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>Correlazione di Pearson</h4>
                  <p>Per relazioni lineari tra variabili normali</p>
                </div>
              </label>
            </div>

            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" 
                       [checked]="isTestSelected('spearman')"
                       (change)="toggleTest('spearman')">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>Correlazione di Spearman</h4>
                  <p>Per relazioni monotone, non parametrica</p>
                </div>
              </label>
            </div>
          </div>
        </div>
        }

        <!-- Linear Regressions Section - Only for Regression Analysis -->
        @if (isRegression) {
          <div class="analysis-section">
            <h2>Regressioni Lineari</h2>
            <p class="section-desc">Analizza le relazioni predittive tra variabili omics e outcome, con eventuali covariate</p>
            
            <div class="test-grid">
              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [(ngModel)]="options.linearRegression"
                         (change)="onLinearRegressionChange()">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Regressione Lineare Standard</h4>
                    <p>Analisi di regressione lineare completa</p>
                  </div>
                </label>
              </div>

              <div class="test-card" [class.disabled]="!options.linearRegression">
                <label class="test-label">
                  <input type="checkbox" 
                         [(ngModel)]="options.linearRegressionWithoutInfluentials"
                         [disabled]="!options.linearRegression"
                         (change)="onLinearRegressionWithoutInfluentialsChange()">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Regressione senza Punti Influenti</h4>
                    <p>Rifai le regressioni escludendo automaticamente i punti influenti individuati tramite Cook's Distance</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        }

        <!-- Multivariate Analysis/Feature Selection Section -->
        <div class="analysis-section">
          <h2>
            @if (isClassification) {
              Algoritmi di Classificazione/Selezione delle Caratteristiche
            } @else {
              Analisi Multivariata/Selezione delle Caratteristiche
            }
          </h2>
          <p class="section-desc">
            @if (isClassification) {
              Metodi di regolarizzazione per la classificazione e selezione automatica delle variabili più rilevanti
            } @else {
              Metodi di regolarizzazione per la selezione automatica delle variabili più rilevanti
            }
          </p>
          
          <!-- Ridge Regression -->
          <div class="method-section">
            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.ridge.enabled">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>Ridge Regression</h4>
                  <p>Regolarizzazione L2 per ridurre l'overfitting mantenendo tutte le variabili</p>
                </div>
              </label>
            </div>

            @if (options.multivariateAnalysis.ridge.enabled) {
              <div class="parameter-config">
                <h3>Configurazione Ridge Regression</h3>
                
                <div class="radio-options-inline">
                  <label class="radio-option-inline">
                    <input type="radio" 
                           name="ridgeLambdaSelection" 
                           value="automatic"
                           [(ngModel)]="options.multivariateAnalysis.ridge.lambdaSelection">
                    <span class="radio-custom-small"></span>
                    <span>Determinazione Automatica</span>
                  </label>

                  <label class="radio-option-inline">
                    <input type="radio" 
                           name="ridgeLambdaSelection" 
                           value="manual"
                           [(ngModel)]="options.multivariateAnalysis.ridge.lambdaSelection">
                    <span class="radio-custom-small"></span>
                    <span>Range Personalizzato</span>
                  </label>
                </div>

                @if (options.multivariateAnalysis.ridge.lambdaSelection === 'manual') {
                  <div class="lambda-range-inputs">
                    <div class="input-group">
                      <label>Valore Minimo</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.ridge.lambdaRange!.min"
                             step="0.001" 
                             min="0"
                             class="number-input">
                    </div>
                    <div class="input-group">
                      <label>Valore Massimo</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.ridge.lambdaRange!.max"
                             step="0.001" 
                             min="0"
                             class="number-input">
                    </div>
                    <div class="input-group">
                      <label>Step</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.ridge.lambdaRange!.step"
                             step="0.001" 
                             min="0.001"
                             class="number-input">
                    </div>
                  </div>
                }

                <!-- Ridge Metric Selection -->
                <div class="metric-selection">
                  <h4>Metrica di Valutazione</h4>
                  <div class="metric-options">
                    @for (metric of getAvailableMetrics(); track metric.value) {
                      <label class="radio-option-metric">
                        <input type="radio" 
                               name="ridgeMetric" 
                               [value]="metric.value"
                               [(ngModel)]="options.multivariateAnalysis.ridge.metric">
                        <span class="radio-custom-small"></span>
                        <div class="metric-content">
                          <span class="metric-title">{{ metric.label }}</span>
                          <p>{{ metric.description }}</p>
                        </div>
                      </label>
                    }
                  </div>
                </div>

                <!-- Ridge Lambda Rule Selection -->
                <div class="lambda-rule-selection">
                  <h4>Regola di Selezione Lambda</h4>
                  <div class="radio-options-inline">
                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="ridgeLambdaRule" 
                             value="min"
                             [(ngModel)]="options.multivariateAnalysis.ridge.lambdaRule">
                      <span class="radio-custom-small"></span>
                      <span>Lambda Minimo</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="ridgeLambdaRule" 
                             value="1se"
                             [(ngModel)]="options.multivariateAnalysis.ridge.lambdaRule">
                      <span class="radio-custom-small"></span>
                      <span>Lambda 1SE</span>
                    </label>
                  </div>
                  <p class="rule-description">
                    @if (options.multivariateAnalysis.ridge.lambdaRule === 'min') {
                      <span>Seleziona il lambda che {{ options.multivariateAnalysis.ridge.metric === 'rmse' ? 'minimizza RMSE' : 'massimizza R²' }}</span>
                    } @else {
                      <span>Seleziona il lambda più conservativo (modello più semplice) entro 1 errore standard dal {{ options.multivariateAnalysis.ridge.metric === 'rmse' ? 'minimo RMSE' : 'massimo R²' }}</span>
                    }
                  </p>
                </div>

                <!-- Include Covariates Option -->
                <div class="parameter-group">
                  <h4>Inclusione Covariate</h4>
                  <label class="checkbox-option">
                    <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.ridge.includeCovariates">
                    <span class="checkbox-custom-inline"></span>
                    <span>Includi le covariate nell'analisi insieme alle variabili omics</span>
                  </label>
                </div>
              </div>
            }
          </div>

          <!-- LASSO Regression -->
          <div class="method-section">
            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.lasso.enabled">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>LASSO Regression</h4>
                  <p>Regolarizzazione L1 per selezione automatica delle variabili (alcune vengono eliminate)</p>
                </div>
              </label>
            </div>

            @if (options.multivariateAnalysis.lasso.enabled) {
              <div class="parameter-config">
                <h3>Configurazione LASSO Regression</h3>
                
                <div class="radio-options-inline">
                  <label class="radio-option-inline">
                    <input type="radio" 
                           name="lassoLambdaSelection" 
                           value="automatic"
                           [(ngModel)]="options.multivariateAnalysis.lasso.lambdaSelection">
                    <span class="radio-custom-small"></span>
                    <span>Determinazione Automatica</span>
                  </label>

                  <label class="radio-option-inline">
                    <input type="radio" 
                           name="lassoLambdaSelection" 
                           value="manual"
                           [(ngModel)]="options.multivariateAnalysis.lasso.lambdaSelection">
                    <span class="radio-custom-small"></span>
                    <span>Range Personalizzato</span>
                  </label>
                </div>

                @if (options.multivariateAnalysis.lasso.lambdaSelection === 'manual') {
                  <div class="lambda-range-inputs">
                    <div class="input-group">
                      <label>Valore Minimo</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.lasso.lambdaRange!.min"
                             step="0.001" 
                             min="0"
                             class="number-input">
                    </div>
                    <div class="input-group">
                      <label>Valore Massimo</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.lasso.lambdaRange!.max"
                             step="0.001" 
                             min="0"
                             class="number-input">
                    </div>
                    <div class="input-group">
                      <label>Step</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.lasso.lambdaRange!.step"
                             step="0.001" 
                             min="0.001"
                             class="number-input">
                    </div>
                  </div>
                }

                <!-- LASSO Metric Selection -->
                <div class="metric-selection">
                  <h4>Metrica di Valutazione</h4>
                  <div class="metric-options">
                    @for (metric of getAvailableMetrics(); track metric.value) {
                      <label class="radio-option-metric">
                        <input type="radio" 
                               name="lassoMetric" 
                               [value]="metric.value"
                               [(ngModel)]="options.multivariateAnalysis.lasso.metric">
                        <span class="radio-custom-small"></span>
                        <div class="metric-content">
                          <span class="metric-title">{{ metric.label }}</span>
                          <p>{{ metric.description }}</p>
                        </div>
                      </label>
                    }
                  </div>
                </div>

                <!-- LASSO Lambda Rule Selection -->
                <div class="lambda-rule-selection">
                  <h4>Regola di Selezione Lambda</h4>
                  <div class="radio-options-inline">
                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="lassoLambdaRule" 
                             value="min"
                             [(ngModel)]="options.multivariateAnalysis.lasso.lambdaRule">
                      <span class="radio-custom-small"></span>
                      <span>Lambda Minimo</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="lassoLambdaRule" 
                             value="1se"
                             [(ngModel)]="options.multivariateAnalysis.lasso.lambdaRule">
                      <span class="radio-custom-small"></span>
                      <span>Lambda 1SE</span>
                    </label>
                  </div>
                  <p class="rule-description">
                    @if (options.multivariateAnalysis.lasso.lambdaRule === 'min') {
                      <span>Seleziona il lambda che {{ options.multivariateAnalysis.lasso.metric === 'rmse' ? 'minimizza RMSE' : 'massimizza R²' }}</span>
                    } @else {
                      <span>Seleziona il lambda più conservativo (modello più semplice) entro 1 errore standard dal {{ options.multivariateAnalysis.lasso.metric === 'rmse' ? 'minimo RMSE' : 'massimo R²' }}</span>
                    }
                  </p>
                </div>

                <!-- Include Covariates Option -->
                <div class="parameter-group">
                  <h4>Inclusione Covariate</h4>
                  <label class="checkbox-option">
                    <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.lasso.includeCovariates">
                    <span class="checkbox-custom-inline"></span>
                    <span>Includi le covariate nell'analisi insieme alle variabili omics</span>
                  </label>
                </div>
              </div>
            }
          </div>

          <!-- Elastic Net -->
          <div class="method-section">
            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.elasticNet.enabled">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>Elastic Net</h4>
                  <p>Combinazione di Ridge e LASSO (regolarizzazione L1 + L2)</p>
                </div>
              </label>
            </div>

            @if (options.multivariateAnalysis.elasticNet.enabled) {
              <div class="parameter-config">
                <h3>Configurazione Elastic Net</h3>
                
                <div class="radio-options-inline">
                  <label class="radio-option-inline">
                    <input type="radio" 
                           name="elasticNetLambdaSelection" 
                           value="automatic"
                           [(ngModel)]="options.multivariateAnalysis.elasticNet.lambdaSelection">
                    <span class="radio-custom-small"></span>
                    <span>Determinazione Automatica</span>
                  </label>

                  <label class="radio-option-inline">
                    <input type="radio" 
                           name="elasticNetLambdaSelection" 
                           value="manual"
                           [(ngModel)]="options.multivariateAnalysis.elasticNet.lambdaSelection">
                    <span class="radio-custom-small"></span>
                    <span>Range Personalizzato</span>
                  </label>
                </div>

                @if (options.multivariateAnalysis.elasticNet.lambdaSelection === 'manual') {
                  <div class="lambda-range-inputs">
                    <div class="input-group">
                      <label>Valore Minimo</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.elasticNet.lambdaRange!.min"
                             step="0.001" 
                             min="0"
                             class="number-input">
                    </div>
                    <div class="input-group">
                      <label>Valore Massimo</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.elasticNet.lambdaRange!.max"
                             step="0.001" 
                             min="0"
                             class="number-input">
                    </div>
                    <div class="input-group">
                      <label>Step</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.elasticNet.lambdaRange!.step"
                             step="0.001" 
                             min="0.001"
                             class="number-input">
                    </div>
                  </div>
                }

                <!-- Elastic Net Metric Selection -->
                <div class="metric-selection">
                  <h4>Metrica di Valutazione</h4>
                  <div class="metric-options">
                    @for (metric of getAvailableMetrics(); track metric.value) {
                      <label class="radio-option-metric">
                        <input type="radio" 
                               name="elasticNetMetric" 
                               [value]="metric.value"
                               [(ngModel)]="options.multivariateAnalysis.elasticNet.metric">
                        <span class="radio-custom-small"></span>
                        <div class="metric-content">
                          <span class="metric-title">{{ metric.label }}</span>
                          <p>{{ metric.description }}</p>
                        </div>
                      </label>
                    }
                  </div>
                </div>

                <!-- Elastic Net Lambda Rule Selection -->
                <div class="lambda-rule-selection">
                  <h4>Regola di Selezione Lambda</h4>
                  <div class="radio-options-inline">
                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="elasticNetLambdaRule" 
                             value="min"
                             [(ngModel)]="options.multivariateAnalysis.elasticNet.lambdaRule">
                      <span class="radio-custom-small"></span>
                      <span>Lambda Minimo</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="elasticNetLambdaRule" 
                             value="1se"
                             [(ngModel)]="options.multivariateAnalysis.elasticNet.lambdaRule">
                      <span class="radio-custom-small"></span>
                      <span>Lambda 1SE</span>
                    </label>
                  </div>
                  <p class="rule-description">
                    @if (options.multivariateAnalysis.elasticNet.lambdaRule === 'min') {
                      <span>Seleziona il lambda che {{ options.multivariateAnalysis.elasticNet.metric === 'rmse' ? 'minimizza RMSE' : 'massimizza R²' }}</span>
                    } @else {
                      <span>Seleziona il lambda più conservativo (modello più semplice) entro 1 errore standard dal {{ options.multivariateAnalysis.elasticNet.metric === 'rmse' ? 'minimo RMSE' : 'massimo R²' }}</span>
                    }
                  </p>
                </div>

                <!-- Include Covariates Option -->
                <div class="parameter-group">
                  <h4>Inclusione Covariate</h4>
                  <label class="checkbox-option">
                    <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.elasticNet.includeCovariates">
                    <span class="checkbox-custom-inline"></span>
                    <span>Includi le covariate nell'analisi insieme alle variabili omics</span>
                  </label>
                </div>
              </div>
            }
          </div>

          <!-- Random Forest -->
          <div class="method-section">
            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.randomForest.enabled">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>Random Forest</h4>
                  <p>Metodo ensemble basato su alberi di decisione per predizione e selezione delle caratteristiche</p>
                </div>
              </label>
            </div>

            @if (options.multivariateAnalysis.randomForest.enabled) {
              <div class="parameter-config">
                <h3>Configurazione Random Forest</h3>
                
                <!-- Number of Trees -->
                <div class="parameter-group">
                  <h4>Numero di Alberi (ntree)</h4>
                  <div class="radio-options-inline">
                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="randomForestNtree" 
                             [value]="100"
                             [(ngModel)]="options.multivariateAnalysis.randomForest.ntree">
                      <span class="radio-custom-small"></span>
                      <span>100</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="randomForestNtree" 
                             [value]="500"
                             [(ngModel)]="options.multivariateAnalysis.randomForest.ntree">
                      <span class="radio-custom-small"></span>
                      <span>500</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="randomForestNtree" 
                             [value]="1000"
                             [(ngModel)]="options.multivariateAnalysis.randomForest.ntree">
                      <span class="radio-custom-small"></span>
                      <span>1000</span>
                    </label>
                  </div>
                </div>

                <!-- Mtry Configuration -->
                <div class="parameter-group">
                  <h4>Configurazione mtry (numero di variabili considerate ad ogni split)</h4>
                  <div class="radio-options-inline">
                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="randomForestMtrySelection" 
                             value="automatic"
                             [(ngModel)]="options.multivariateAnalysis.randomForest.mtrySelection">
                      <span class="radio-custom-small"></span>
                      <span>Automatico (√p)</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="randomForestMtrySelection" 
                             value="manual"
                             [(ngModel)]="options.multivariateAnalysis.randomForest.mtrySelection">
                      <span class="radio-custom-small"></span>
                      <span>Personalizzato</span>
                    </label>
                  </div>

                  @if (options.multivariateAnalysis.randomForest.mtrySelection === 'manual') {
                    <div class="input-group">
                      <label>Valore mtry</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.randomForest.mtryValue"
                             min="1" 
                             step="1"
                             class="number-input"
                             placeholder="es. 10">
                      <small class="input-help">Numero di variabili da considerare ad ogni split dell'albero</small>
                    </div>
                  }
                </div>

                <!-- Include Covariates Option -->
                <div class="parameter-group">
                  <h4>Inclusione Covariate</h4>
                  <label class="checkbox-option">
                    <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.randomForest.includeCovariates">
                    <span class="checkbox-custom-inline"></span>
                    <span>Includi le covariate nell'analisi insieme alle variabili omics</span>
                  </label>
                </div>
              </div>
            }
          </div>

          <!-- Boruta Feature Selection -->
          <div class="method-section">
            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.boruta.enabled">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>Boruta Feature Selection</h4>
                  <p>Algoritmo di selezione delle caratteristiche basato su Random Forest che identifica tutte le variabili rilevanti</p>
                </div>
              </label>
            </div>

            @if (options.multivariateAnalysis.boruta.enabled) {
              <div class="parameter-config">
                <h3>Configurazione Boruta</h3>
                
                <!-- Number of Trees -->
                <div class="parameter-group">
                  <h4>Numero di Alberi (ntree)</h4>
                  <div class="radio-options-inline">
                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="borutaNtree" 
                             [value]="100"
                             [(ngModel)]="options.multivariateAnalysis.boruta.ntree">
                      <span class="radio-custom-small"></span>
                      <span>100</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="borutaNtree" 
                             [value]="500"
                             [(ngModel)]="options.multivariateAnalysis.boruta.ntree">
                      <span class="radio-custom-small"></span>
                      <span>500</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="borutaNtree" 
                             [value]="1000"
                             [(ngModel)]="options.multivariateAnalysis.boruta.ntree">
                      <span class="radio-custom-small"></span>
                      <span>1000</span>
                    </label>
                  </div>
                </div>

                <!-- Mtry Configuration -->
                <div class="parameter-group">
                  <h4>Configurazione mtry (numero di variabili considerate ad ogni split)</h4>
                  <div class="radio-options-inline">
                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="borutaMtrySelection" 
                             value="automatic"
                             [(ngModel)]="options.multivariateAnalysis.boruta.mtrySelection">
                      <span class="radio-custom-small"></span>
                      <span>Automatico (√p)</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="borutaMtrySelection" 
                             value="manual"
                             [(ngModel)]="options.multivariateAnalysis.boruta.mtrySelection">
                      <span class="radio-custom-small"></span>
                      <span>Personalizzato</span>
                    </label>
                  </div>

                  @if (options.multivariateAnalysis.boruta.mtrySelection === 'manual') {
                    <div class="input-group">
                      <label>Valore mtry</label>
                      <input type="number" 
                             [(ngModel)]="options.multivariateAnalysis.boruta.mtryValue"
                             min="1" 
                             step="1"
                             class="number-input"
                             placeholder="es. 10">
                      <small class="input-help">Numero di variabili da considerare ad ogni split dell'albero</small>
                    </div>
                  }
                </div>

                <!-- Max Runs Configuration -->
                <div class="parameter-group">
                  <h4>Numero Massimo di Iterazioni (maxRuns)</h4>
                  <div class="input-group">
                    <label>Valore maxRuns</label>
                    <input type="number" 
                           [(ngModel)]="options.multivariateAnalysis.boruta.maxRuns"
                           min="10" 
                           max="1000"
                           step="10"
                           class="number-input"
                           placeholder="100">
                    <small class="input-help">Numero massimo di iterazioni per l'algoritmo Boruta (consigliato: 100-500)</small>
                  </div>
                </div>

                <!-- Rough Fix for Tentative Features Option -->
                <div class="parameter-group">
                  <h4>Gestione Caratteristiche Tentative</h4>
                  <label class="checkbox-option">
                    <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.boruta.roughFixTentativeFeatures">
                    <span class="checkbox-custom-inline"></span>
                    <span>Applica rough fix per le caratteristiche tentative</span>
                  </label>
                  <small class="input-help">Se selezionato, applica una correzione statistica per decidere il destino delle caratteristiche tentative</small>
                </div>

                <!-- Include Covariates Option -->
                <div class="parameter-group">
                  <h4>Inclusione Covariate</h4>
                  <label class="checkbox-option">
                    <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.boruta.includeCovariates">
                    <span class="checkbox-custom-inline"></span>
                    <span>Includi le covariate nell'analisi insieme alle variabili omics</span>
                  </label>
                </div>
              </div>
            }
          </div>
        </div>

          <!-- Recursive Feature Elimination (RFE) -->
          <div class="method-section">
            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" [(ngModel)]="options.multivariateAnalysis.rfe.enabled">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>Recursive Feature Elimination (RFE)</h4>
                  <p>Elimina ricorsivamente le caratteristiche meno importanti utilizzando un algoritmo di machine learning per selezionare il sottoinsieme ottimale</p>
                </div>
              </label>
            </div>

            @if (options.multivariateAnalysis.rfe.enabled) {
              <div class="parameter-config">
                <h3>Configurazione Recursive Feature Elimination</h3>
                
                <!-- Metric Selection -->
                <div class="metric-selection">
                  <h4>Metrica di Valutazione</h4>
                  <div class="metric-options">
                    @for (metric of getAvailableMetrics(); track metric.value) {
                      <label class="radio-option-metric">
                        <input type="radio" 
                               name="rfeMetric" 
                               [value]="metric.value"
                               [(ngModel)]="options.multivariateAnalysis.rfe.metric">
                        <span class="radio-custom-small"></span>
                        <div class="metric-content">
                          <span class="metric-title">{{ metric.label }}</span>
                          <p>{{ metric.description }}</p>
                        </div>
                      </label>
                    }
                  </div>
                </div>

                <!-- Subset Size Configuration -->
                <div class="parameter-group">
                  <h4>Configurazione Dimensione Sottoinsieme</h4>
                  <div class="radio-options-inline">
                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="rfeSubsetType" 
                             value="automatic"
                             [(ngModel)]="options.multivariateAnalysis.rfe.subsetSizeType">
                      <span class="radio-custom-small"></span>
                      <span>Automatico (sequenziale per 5)</span>
                    </label>

                    <label class="radio-option-inline">
                      <input type="radio" 
                             name="rfeSubsetType" 
                             value="custom"
                             [(ngModel)]="options.multivariateAnalysis.rfe.subsetSizeType">
                      <span class="radio-custom-small"></span>
                      <span>Personalizzato</span>
                    </label>
                  </div>
                  <small class="input-help">Modalità automatica: testa sottoinsiemi di dimensione 5, 10, 15, ... fino al numero massimo di colonne ({{ getRFEMaxColumns() }})</small>

                  @if (options.multivariateAnalysis.rfe.subsetSizeType === 'custom') {
                    <div class="input-group">
                      <label>Dimensioni Sottoinsieme Personalizzate</label>
                      <input 
                        type="text" 
                        [(ngModel)]="options.multivariateAnalysis.rfe.customSubsetSizes"
                        placeholder="es: 5,10,15,20"
                        class="number-input"
                        (input)="validateRFESubsetSizes()">
                      <small class="input-help">
                        Inserisci le dimensioni separate da virgola in ordine crescente. 
                        Massimo: {{ getRFEMaxColumns() }} colonne
                      </small>
                      @if (rfeSubsetSizeError) {
                        <span class="error-text">{{ rfeSubsetSizeError }}</span>
                      }
                    </div>
                  }
                </div>

                <!-- Include Covariates Option -->
                <div class="parameter-group">
                  <h4>Inclusione Covariate</h4>
                  <label class="checkbox-option">
                    <input type="checkbox" 
                           [(ngModel)]="options.multivariateAnalysis.rfe.includeCovariates"
                           (change)="onRFEIncludeCovariatesChange()">
                    <span class="checkbox-custom-inline"></span>
                    <span>Includi le covariate nell'analisi insieme alle variabili omics</span>
                  </label>
                </div>
              </div>
            }
          </div>

        <!-- Classification Analysis Placeholder -->
        @if (isClassification) {
          <div class="analysis-section">
            <h2>Analisi di Classificazione</h2>
            <div class="placeholder-content">
              <div class="info-banner">
                <span class="info-icon">🎯</span>
                <div class="info-text">
                  <h4>Modalità Classificazione Attiva</h4>
                  <p>I test statistici specifici per l'analisi di classificazione saranno disponibili in una versione futura. 
                     Per ora, puoi procedere direttamente agli algoritmi di machine learning per la classificazione.</p>
                </div>
              </div>
            </div>
          </div>
        }

        <div class="button-group">
          <button class="secondary-btn" (click)="goBack()">Indietro</button>
          <button class="primary-btn" 
                  [disabled]="!isValid()"
                  (click)="submitAnalysis()">
            Avvia Analisi
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .info-text {
      display: block;
      color: #0284c7;
      font-size: 12px;
      margin-top: 4px;
    }
    .content-wrapper {
      max-width: 100%;
      margin: 0 auto;
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

    /* Analysis Type Banner */
    .analysis-type-banner {
      background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
      border: 2px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 24px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    .analysis-type-banner.classification {
      background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%);
      border-color: #f59e0b;
      color: #92400e;
    }

    .analysis-type-banner.regression {
      background: linear-gradient(135deg, #dbeafe 0%, #3b82f6 100%);
      border-color: #2563eb;
      color: #1e40af;
    }

    .analysis-type-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }

    .analysis-type-label {
      font-size: 18px;
      font-weight: 600;
    }

    .analysis-type-description {
      font-size: 14px;
      font-weight: 500;
      opacity: 0.9;
    }

    /* Classification Placeholder Styles */
    .placeholder-content {
      padding: 20px 0;
    }

    .info-banner {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border: 2px solid #0ea5e9;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .info-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .info-text h4 {
      margin: 0 0 8px 0;
      color: #0c4a6e;
      font-size: 18px;
      font-weight: 600;
    }

    .info-text p {
      margin: 0;
      color: #0369a1;
      font-size: 14px;
      line-height: 1.5;
    }

    /* Preview Section */
    .preview-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .preview-section h2 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }

    .file-info-bar {
      display: flex;
      gap: 24px;
      align-items: center;
      padding: 12px 16px;
      background: #f0f9ff;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #475569;
    }

    .status-badge {
      margin-left: auto;
      background: #10b981;
      color: white;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
    }

    .table-container {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      max-height: 300px;
      overflow-y: auto;
    }

    .preview-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .preview-table th {
      background: #f8fafc;
      padding: 10px;
      text-align: left;
      border-bottom: 2px solid #e2e8f0;
      font-weight: 500;
      color: #0f172a;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .header-cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .header-name {
      font-weight: 600;
    }

    .column-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: 500;
    }

    .column-badge.outcome {
      background: #fbbf24;
      color: #78350f;
    }

    .column-badge.omics {
      background: #a78bfa;
      color: #2e1065;
    }

    .column-badge.covariate {
      background: #60a5fa;
      color: #1e3a8a;
    }

    .column-badge.id {
      background: #86efac;
      color: #14532d;
    }

    .preview-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #f1f5f9;
    }

    .index-col {
      background: #f8fafc;
      font-weight: 500;
      color: #64748b;
      text-align: center;
      width: 50px;
    }

    .preview-note {
      margin: 12px 0 0 0;
      font-size: 13px;
      color: #64748b;
      text-align: center;
    }

    /* Grouping Section */
    .grouping-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .grouping-section h2 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }

    .section-desc {
      margin: 0 0 20px 0;
      color: #64748b;
      font-size: 14px;
    }

    .grouping-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .radio-option {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .radio-option:hover {
      border-color: #60a5fa;
    }

    .radio-option input[type="radio"] {
      display: none;
    }

    .radio-custom {
      width: 20px;
      height: 20px;
      border: 2px solid #93c5fd;
      border-radius: 50%;
      background: white;
      position: relative;
      flex-shrink: 0;
      margin-top: 2px;
      transition: all 0.2s;
    }

    .radio-option input[type="radio"]:checked + .radio-custom {
      border-color: #0284c7;
    }

    .radio-custom::after {
      content: '';
      position: absolute;
      width: 10px;
      height: 10px;
      background: #0284c7;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0;
      transition: opacity 0.2s;
    }

    .radio-option input[type="radio"]:checked + .radio-custom::after {
      opacity: 1;
    }

    .radio-option input[type="radio"]:checked ~ .option-content h3 {
      color: #0284c7;
    }

    .option-content h3 {
      margin: 0 0 4px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .option-content p {
      margin: 0;
      color: #64748b;
      font-size: 13px;
    }

    .threshold-input {
      margin-top: 16px;
      padding: 16px;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .threshold-input label {
      display: block;
      margin-bottom: 8px;
      color: #0f172a;
      font-weight: 500;
      font-size: 14px;
    }

    .threshold-input-field {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s;
    }

    .threshold-input-field:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.1);
    }

    /* Analysis Container */
    .analysis-container {
      background: white;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .analysis-section {
      margin-bottom: 32px;
    }

    .analysis-section:last-of-type {
      margin-bottom: 0;
    }

    .analysis-section h2 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }

    .test-category {
      margin-bottom: 24px;
    }

    .test-category h3 {
      margin: 0 0 16px 0;
      color: #334155;
      font-size: 16px;
      font-weight: 500;
    }

    .test-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .test-card, .analysis-card {
      background: #f0f9ff;
      border-radius: 6px;
      padding: 20px;
      transition: all 0.2s;
      border: 1px solid #bae6fd;
    }

    .test-card.disabled {
      background: #f8fafc;
      border-color: #e2e8f0;
      opacity: 0.6;
    }

    .test-card.disabled .test-content h4,
    .test-card.disabled .test-content p {
      color: #94a3b8;
    }

    .test-card.disabled .checkbox-custom {
      border-color: #e2e8f0;
      background: #f1f5f9;
    }

    .test-card.disabled:hover {
      border-color: #e2e8f0;
      box-shadow: none;
    }

    .test-card:hover, .analysis-card:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .test-label, .analysis-label {
      display: flex;
      align-items: flex-start;
      cursor: pointer;
      gap: 16px;
    }

    .test-label input[type="checkbox"],
    .analysis-label input[type="checkbox"] {
      display: none;
    }

    .checkbox-custom {
      width: 20px;
      height: 20px;
      border: 2px solid #93c5fd;
      border-radius: 4px;
      background: white;
      position: relative;
      flex-shrink: 0;
      transition: all 0.2s ease;
      margin-top: 2px;
    }

    .test-label input[type="checkbox"]:checked + .checkbox-custom,
    .analysis-label input[type="checkbox"]:checked + .checkbox-custom {
      background: #0284c7;
      border-color: #0284c7;
    }

    .checkbox-custom::after {
      content: '✓';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .test-label input[type="checkbox"]:checked + .checkbox-custom::after,
    .analysis-label input[type="checkbox"]:checked + .checkbox-custom::after {
      opacity: 1;
    }

    .test-content h4, .analysis-content h3 {
      margin: 0 0 4px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .test-content p, .analysis-content p {
      margin: 0;
      color: #64748b;
      font-size: 13px;
    }

    .info-text {
      display: block;
      color: #0284c7;
      font-size: 12px;
      margin-top: 4px;
    }

    .select-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      font-size: 15px;
      background: white;
      cursor: pointer;
      transition: border-color 0.2s;
      color: #1e293b;
    }

    .select-input:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.1);
    }

    .button-group {
      display: flex;
      gap: 16px;
      justify-content: flex-end;
      margin-top: 32px;
    }

    .primary-btn, .secondary-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .secondary-btn {
      background: white;
      color: #334155;
      border: 1px solid #93c5fd;
    }

    .secondary-btn:hover {
      background: #f0f9ff;
      border-color: #60a5fa;
    }

    .primary-btn {
      background: #0284c7;
      color: white;
    }

    .primary-btn:hover:not(:disabled) {
      background: #0369a1;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
    }

    .primary-btn:disabled {
      background: #93c5fd;
      cursor: not-allowed;
    }

    .error-text {
      display: block;
      color: #dc2626;
      font-size: 12px;
      margin-top: 4px;
    }

    /* Multivariate Analysis Styles */
    .parameter-config {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin-top: 16px;
    }

    .parameter-config h3 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .parameter-config h4 {
      margin: 16px 0 12px 0;
      color: #0f172a;
      font-size: 14px;
      font-weight: 500;
    }

    .radio-options-inline {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
    }

    .radio-option-inline {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .radio-option-inline input[type="radio"] {
      display: none;
    }

    .radio-custom-small {
      width: 16px;
      height: 16px;
      border: 2px solid #93c5fd;
      border-radius: 50%;
      background: white;
      position: relative;
      transition: all 0.2s;
    }

    .radio-option-inline input[type="radio"]:checked + .radio-custom-small {
      border-color: #0284c7;
    }

    .radio-custom-small::after {
      content: '';
      position: absolute;
      width: 8px;
      height: 8px;
      background: #0284c7;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0;
      transition: opacity 0.2s;
    }

    .radio-option-inline input[type="radio"]:checked + .radio-custom-small::after {
      opacity: 1;
    }

    .lambda-range-inputs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin: 16px 0;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .input-group label {
      font-size: 13px;
      font-weight: 500;
      color: #374151;
    }

    .number-input {
      padding: 8px 12px;
      border: 1px solid #93c5fd;
      border-radius: 4px;
      font-size: 14px;
      transition: border-color 0.2s;
    }

    .number-input:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.1);
    }

    .metric-selection {
      margin-top: 16px;
    }

    .lambda-rule-selection {
      margin-top: 16px;
    }

    .rule-description {
      margin-top: 8px;
      font-size: 13px;
      color: #64748b;
      font-style: italic;
    }

    .metric-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 8px;
    }

    .radio-option-metric {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .radio-option-metric:hover {
      border-color: #60a5fa;
    }

    .radio-option-metric input[type="radio"] {
      display: none;
    }

    .radio-option-metric input[type="radio"]:checked ~ .metric-content .metric-title {
      color: #0284c7;
    }

    .radio-option-metric input[type="radio"]:checked + .radio-custom-small {
      border-color: #0284c7;
    }

    .radio-option-metric input[type="radio"]:checked + .radio-custom-small::after {
      opacity: 1;
    }

    .metric-content {
      flex: 1;
    }

    .metric-title {
      font-weight: 500;
      font-size: 14px;
      color: #0f172a;
      display: block;
      margin-bottom: 2px;
    }

    .metric-content p {
      margin: 0;
      font-size: 12px;
      color: #64748b;
    }

    /* Method Section Styles */
    .method-section {
      margin-bottom: 24px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .method-section .test-card {
      margin: 0;
      border-radius: 0;
      border: none;
      border-bottom: 1px solid #e2e8f0;
    }

    .method-section:last-child {
      margin-bottom: 0;
    }

    .method-section .parameter-config {
      margin: 0;
      border: none;
      border-radius: 0;
      background: #f8fafc;
    }

    /* Parameter Group Styles */
    .parameter-group {
      margin-bottom: 20px;
    }

    .parameter-group:last-child {
      margin-bottom: 0;
    }

    /* Checkbox Option Styles */
    .checkbox-option {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      padding: 8px 0;
    }

    .checkbox-option input[type="checkbox"] {
      display: none;
    }

    .checkbox-custom-inline {
      width: 18px;
      height: 18px;
      border: 2px solid #93c5fd;
      border-radius: 4px;
      background: white;
      position: relative;
      flex-shrink: 0;
      transition: all 0.2s ease;
    }

    .checkbox-option input[type="checkbox"]:checked + .checkbox-custom-inline {
      background: #0284c7;
      border-color: #0284c7;
    }

    .checkbox-custom-inline::after {
      content: '✓';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .checkbox-option input[type="checkbox"]:checked + .checkbox-custom-inline::after {
      opacity: 1;
    }

    /* Input Help Text */
    .input-help {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
      font-style: italic;
    }
  `]
})
export class AnalysisSelectionComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('outcomeHistogram') outcomeHistogram?: ElementRef;

  // Test categories
  correlationTests = ['pearson', 'spearman'];
  bivariateTests = ['student-t', 'welch-t', 'wilcoxon', 'anova', 'welch-anova', 'kruskal-wallis'];

  statisticalTests = [
    { id: 'student-t', name: 'Student T-Test', description: 'Per dati normali con varianze uguali', category: 'parametric' },
    { id: 'welch-t', name: 'Welch T-Test', description: 'Per dati normali con varianze diverse', category: 'parametric' },
    { id: 'wilcoxon', name: 'Wilcoxon Test', description: 'Alternativa non parametrica al T-Test', category: 'nonparametric' },
    { id: 'anova', name: 'ANOVA', description: 'Confronto tra più gruppi (varianze uguali)', category: 'parametric' },
    { id: 'welch-anova', name: 'Welch ANOVA', description: 'Confronto tra più gruppi (varianze diverse)', category: 'parametric' },
    { id: 'kruskal-wallis', name: 'Kruskal-Wallis', description: 'Alternativa non parametrica all\'ANOVA', category: 'nonparametric' },
    { id: 'pearson', name: 'Pearson Correlation', description: 'Per relazioni lineari tra variabili normali', category: 'correlation' },
    { id: 'spearman', name: 'Spearman Correlation', description: 'Per relazioni monotone, non parametrica', category: 'correlation' }
  ];

  // Classification tests - placeholder for future expansion
  classificationTests: any[] = [
    // Future: Add classification-specific tests here
  ];

  // Get available statistical tests based on analysis type
  getAvailableStatisticalTests() {
    if (this.isClassification) {
      return this.classificationTests; // Empty for now
    }
    return this.statisticalTests;
  }

  // Get tests by category for regression analysis
  getTestsByCategory(category: string) {
    return this.getAvailableStatisticalTests().filter(test => test.category === category);
  }

 options: AnalysisOptions = {
    groupingMethod: 'none',
    thresholdValues: [],
    statisticalTests: [],
    linearRegression: false,
    linearRegressionWithoutInfluentials: false,
    multivariateAnalysis: {
      ridge: {
        enabled: false,
        lambdaSelection: 'automatic',
        lambdaRange: { min: 0.001, max: 1, step: 0.001 },
        metric: 'rmse',
        lambdaRule: 'min',
        includeCovariates: true
      },
      lasso: {
        enabled: false,
        lambdaSelection: 'automatic',
        lambdaRange: { min: 0.001, max: 1, step: 0.001 },
        metric: 'rmse',
        lambdaRule: 'min',
        includeCovariates: true
      },
      elasticNet: {
        enabled: false,
        lambdaSelection: 'automatic',
        lambdaRange: { min: 0.001, max: 1, step: 0.001 },
        metric: 'rmse',
        lambdaRule: 'min',
        includeCovariates: true
      },
      randomForest: {
        enabled: false,
        ntree: 500,
        mtrySelection: 'automatic',
        mtryValue: undefined,
        includeCovariates: true
      },
      boruta: {
        enabled: false,
        ntree: 500,
        mtrySelection: 'automatic',
        mtryValue: undefined,
        maxRuns: 100,
        roughFixTentativeFeatures: false,
        includeCovariates: true
      },
      rfe: {
        enabled: false,
        metric: 'rmse',
        subsetSizeType: 'automatic',
        customSubsetSizes: '',
        includeCovariates: true
      }
    }
  };

  filePreview = signal<FilePreview | null>(null);
  originalFileName = '';
  thresholdInput = '';
  thresholdError = '';
  thresholdInfo = '';
  rfeSubsetSizeError = '';
  outcomeValues: number[] = [];
  tertiles: number[] = [];

  // Store preprocessing info
  preprocessingInfo: any = null;

  // Analysis type detection methods
  get analysisType(): 'regression' | 'classification' {
    const outcomeType = this.preprocessingInfo?.columnClassification?.outcomeType;
    return outcomeType === 'categorical' ? 'classification' : 'regression';
  }

  get isClassification(): boolean {
    return this.analysisType === 'classification';
  }

  get isRegression(): boolean {
    return this.analysisType === 'regression';
  }

  // Get appropriate metrics based on analysis type
  getAvailableMetrics(): Array<{value: string, label: string, description: string}> {
    if (this.isClassification) {
      return [
        { value: 'accuracy', label: 'Accuracy', description: 'Percentuale di predizioni corrette' },
        { value: 'auc', label: 'AUC-ROC', description: 'Area sotto la curva ROC' },
        { value: 'f1', label: 'F1-Score', description: 'Media armonica di precisione e recall' },
        { value: 'kappa', label: 'Cohen\'s Kappa', description: 'Accordo oltre il caso' }
      ];
    } else {
      return [
        { value: 'rmse', label: 'RMSE', description: 'Root Mean Square Error' },
        { value: 'rsquared', label: 'R²', description: 'Coefficiente di determinazione' }
      ];
    }
  }

  // Get analysis type description
  getAnalysisTypeDescription(): string {
    if (this.isClassification) {
      return 'Analisi di Classificazione - La variabile outcome è categorica';
    }
    return 'Analisi di Regressione - La variabile outcome è continua';
  }

  // Update metric defaults based on analysis type
  updateMetricDefaults(): void {
    if (this.isClassification) {
      // Set appropriate classification metrics
      const defaultMetric = 'accuracy';
      this.options.multivariateAnalysis.ridge.metric = defaultMetric as any;
      this.options.multivariateAnalysis.lasso.metric = defaultMetric as any;
      this.options.multivariateAnalysis.elasticNet.metric = defaultMetric as any;
      this.options.multivariateAnalysis.rfe.metric = defaultMetric as any;
      
      // Clear regression-specific options
      this.options.statisticalTests = [];
      this.options.linearRegression = false;
      this.options.linearRegressionWithoutInfluentials = false;
      this.options.groupingMethod = 'none';
      this.options.thresholdValues = [];
    } else {
      // Keep regression metrics (rmse is already default)
      const defaultMetric = 'rmse';
      this.options.multivariateAnalysis.ridge.metric = defaultMetric as any;
      this.options.multivariateAnalysis.lasso.metric = defaultMetric as any;
      this.options.multivariateAnalysis.elasticNet.metric = defaultMetric as any;
      this.options.multivariateAnalysis.rfe.metric = defaultMetric as any;
    }
  }

  constructor(
    private router: Router,
    private dataFlowService: DataFlowService,
    private navigationService: NavigationService,
    private fileParserService: FileParserService,
    private plotlyService: PlotlyService
  ) {}

  async ngOnInit() {
    // Check prerequisites
    const fileData = this.dataFlowService.fileData();
    const preprocessingOptions = this.dataFlowService.preprocessingOptions();
    
    if (!fileData || !preprocessingOptions) {
      this.navigationService.navigateToStep('upload');
      return;
    }

    this.originalFileName = fileData.fileName;
    this.preprocessingInfo = preprocessingOptions;

    // Debug: Log preprocessing info and analysis type detection
    console.log('Preprocessing Info:', this.preprocessingInfo);
    console.log('Session ID:', this.preprocessingInfo?.sessionId);
    console.log('User ID:', this.preprocessingInfo?.userId);
    console.log('Outcome Type:', this.preprocessingInfo?.columnClassification?.outcomeType);
    console.log('Analysis Type:', this.analysisType);
    console.log('Is Classification:', this.isClassification);

    // Set analysis type based on preprocessing outcome type
    this.options.analysisType = this.analysisType;

    // Update metric defaults for the analysis type
    this.updateMetricDefaults();

    // Load preview of preprocessed file
    if (fileData.processedFile) {
      try {
        const preview = await this.fileParserService.parseFile(fileData.processedFile, 10);
        this.filePreview.set(preview);
        
        // Extract outcome values for histogram
        await this.extractOutcomeValues(fileData.processedFile);
      } catch (error) {
        console.error('Error parsing preprocessed file:', error);
      }
    }

    // Load existing options
    const savedOptions = this.dataFlowService.analysisOptions();
    if (savedOptions) {
      this.options = { ...savedOptions };
      if (this.options.thresholdValues && this.options.thresholdValues.length > 0) {
        this.thresholdInput = this.options.thresholdValues.join(', ');
      }
    }
  }

  ngAfterViewInit() {
    // Create histogram after view is initialized
    if (this.outcomeValues.length > 0) {
      setTimeout(() => this.createOutcomeHistogram(), 100);
    }
  }

  async extractOutcomeValues(file: File) {
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const headers = this.parseCSVLine(lines[0]);
      
      // Find outcome column index
      const outcomeCol = this.preprocessingInfo?.columnClassification?.outcomeColumn;
      if (outcomeCol === undefined || outcomeCol === '') return;
      
      let outcomeIndex: number;
      if (typeof outcomeCol === 'number') {
        outcomeIndex = outcomeCol;
      } else {
        outcomeIndex = headers.indexOf(outcomeCol);
      }
      
      if (outcomeIndex === -1) return;
      
      // Extract outcome values
      this.outcomeValues = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const row = this.parseCSVLine(lines[i]);
          const value = parseFloat(row[outcomeIndex]);
          if (!isNaN(value)) {
            this.outcomeValues.push(value);
          }
        }
      }
      
      // Calculate tertiles
      if (this.outcomeValues.length > 0) {
        const sorted = [...this.outcomeValues].sort((a, b) => a - b);
        this.tertiles = [
          sorted[Math.floor(sorted.length / 3)],
          sorted[Math.floor(2 * sorted.length / 3)]
        ];
      }
    } catch (error) {
      console.error('Error extracting outcome values:', error);
    }
  }

  // Improved CSV parser: handles escaped quotes and commas inside quotes
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
      i++;
    }
    result.push(current.trim());
    return result;
  }

  createOutcomeHistogram() {
    if (!this.outcomeHistogram?.nativeElement || this.outcomeValues.length === 0) return;

    const data = [{
      x: this.outcomeValues,
      type: 'histogram',
      nbinsx: 40,
      marker: {
        color: '#0284c7',
        opacity: 0.7
      },
      name: 'Outcome'
    }];

    const layout = {
      title: '',
      xaxis: { 
        title: 'Outcome',
        titlefont: { size: 14 }
      },
      yaxis: { 
        title: 'Frequenza',
        titlefont: { size: 14 }
      },
      margin: { t: 10, r: 20, b: 40, l: 50 },
      plot_bgcolor: '#f8fafc',
      paper_bgcolor: '#f8fafc',
      shapes: [] as any[],
      annotations: [] as any[]
    };

    // Add vertical lines for grouping
    if (this.options.groupingMethod === 'tertiles') {
      // Add tertile lines
      this.tertiles.forEach((value, index) => {
        layout.shapes.push({
          type: 'line',
          x0: value,
          x1: value,
          y0: 0,
          y1: 0.95,
          yref: 'paper',
          line: {
            color: '#ef4444',
            width: 2,
            dash: 'dashdot'
          }
        });
        layout.annotations.push({
          x: value,
          y: 1,
          yref: 'paper',
          text: `T${index + 1}: ${value.toFixed(3)}`,
          showarrow: false,
          font: {
            color: '#ef4444',
            size: 12
          }
        });
      });
    } else if (this.options.groupingMethod === 'threshold' && this.options.thresholdValues!.length > 0) {
      // Only show threshold lines within the min/max of the distribution
      const min = Math.min(...this.outcomeValues);
      const max = Math.max(...this.outcomeValues);
      const validThresholds = this.options.thresholdValues!.filter(v => v > min && v < max);
      validThresholds.forEach((value, index) => {
        layout.shapes.push({
          type: 'line',
          x0: value,
          x1: value,
          y0: 0,
          y1: 0.95,
          yref: 'paper',
          line: {
            color: '#10b981',
            width: 2,
            dash: 'dash'
          }
        });
        layout.annotations.push({
          x: value,
          y: 1.00,
          yref: 'paper',
          text: `S${index + 1}: ${value.toFixed(3)}`,
          showarrow: false,
          font: {
            color: '#10b981',
            size: 12
          }
        });
      });
    }

    const config = {
      responsive: true,
      displayModeBar: false
    };

    this.plotlyService.createPlot(this.outcomeHistogram.nativeElement, data, layout, config);
  }

  onGroupingMethodChange() {
    // Recreate histogram when grouping method changes
    if (this.outcomeValues.length > 0 && this.options.groupingMethod !== 'none') {
      setTimeout(() => this.createOutcomeHistogram(), 100);
    } else {

    }
  }

  // Generic column type checker - now works with column names saved in preprocessing
  private isColumnType(header: string, type: 'idColumn' | 'outcomeColumn' | 'omicsColumns' | 'covariateColumns'): boolean {
    const classification = this.preprocessingInfo?.columnClassification;
    if (!classification) return false;
    
    if (type === 'idColumn' || type === 'outcomeColumn') {
      const col = classification[type];
      if (col === null && header === 'row_id') return true;
      return col === header;
    } else {
      // omicsColumns or covariateColumns: now they should all be column names
      const columns = classification[type] as string[];
      if (!Array.isArray(columns)) return false;
      
      return columns.includes(header);
    }
  }
  
  // Remove the helper method as we no longer need it
  private isDefinitelyCovariateColumn(header: string): boolean {
    return this.isColumnType(header, 'covariateColumns');
  }

  isIdColumn(header: string): boolean {
    return this.isColumnType(header, 'idColumn');
  }
  isOutcomeColumn(header: string): boolean {
    return this.isColumnType(header, 'outcomeColumn');
  }
  isOmicsColumn(header: string): boolean {
    return this.isColumnType(header, 'omicsColumns');
  }
  isCovariateColumn(header: string): boolean {
    return this.isColumnType(header, 'covariateColumns');
  }

  getMaxColumns(): number {
    const preview = this.filePreview();
    if (!preview || !preview.headers) return 0;
    
    // Count omics and covariate columns
    const omicsCount = preview.headers.filter(header => this.isOmicsColumn(header)).length;
    const covariateCount = preview.headers.filter(header => this.isCovariateColumn(header)).length;
    
    return omicsCount + covariateCount;
  }

  getRFEMaxColumns(): number {
    const preview = this.filePreview();
    if (!preview || !preview.headers) return 0;
    
    // Count omics columns
    const omicsCount = preview.headers.filter(header => this.isOmicsColumn(header)).length;
    
    // If RFE includes covariates, add covariate count
    if (this.options.multivariateAnalysis.rfe.includeCovariates) {
      const covariateCount = preview.headers.filter(header => this.isCovariateColumn(header)).length;
      return omicsCount + covariateCount;
    }
    
    return omicsCount;
  }

  formatCell(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      return value.toFixed(3);
    }
    return value.toString();
  }

  getColumnTypes(header: string): string[] {
    const types: string[] = [];
    if (this.isOutcomeColumn(header)) types.push('outcome');
    if (this.isOmicsColumn(header)) types.push('omics');
    if (this.isCovariateColumn(header)) types.push('covariate');
    if (this.isIdColumn(header)) types.push('id');
    return types;
  }

  validateThresholds() {
    this.thresholdError = '';
    this.thresholdInfo = '';
    if (!this.thresholdInput.trim()) {
      this.options.thresholdValues = [];
      this.createOutcomeHistogram(); // Update histogram
      return;
    }

    const values = this.thresholdInput.split(',').map(v => v.trim());
    const numbers: number[] = [];

    for (const value of values) {
      const num = parseFloat(value);
      if (isNaN(num)) {
        this.thresholdError = `Valore non valido: ${value}`;
        return;
      }
      numbers.push(num);
    }

    // Check if values are in ascending order (allow equality)
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] < numbers[i-1]) {
        this.thresholdError = 'I valori devono essere in ordine crescente o uguali';
        return;
      }
    }

    // Check if values are within the outcome distribution range
    if (this.outcomeValues.length > 0) {
      const min = Math.min(...this.outcomeValues);
      const max = Math.max(...this.outcomeValues);
      for (const num of numbers) {
        if (num <= min || num >= max) {
          this.thresholdError = `Tutti i valori devono essere compresi tra il minimo (${min}) e il massimo (${max}) della distribuzione.`;
          return;
        }
      }
    }

    // If there are coincident values, show info message
    const hasCoincident = numbers.length === 1 || numbers.some((v, i, arr) => i > 0 && v === arr[i-1]);
    if (hasCoincident) {
      this.thresholdInfo = 'Nota: con valori threshold coincidenti verranno creati solo due gruppi.';
    }

    this.options.thresholdValues = numbers;
    this.createOutcomeHistogram(); // Update histogram with new thresholds
  }

  validateRFESubsetSizes() {
    this.rfeSubsetSizeError = '';
    
    if (!this.options.multivariateAnalysis.rfe.customSubsetSizes?.trim()) {
      return;
    }

    const input = this.options.multivariateAnalysis.rfe.customSubsetSizes.trim();
    const values = input.split(',').map(v => v.trim());
    const numbers: number[] = [];

    // Check if all values are valid numbers
    for (const value of values) {
      const num = parseInt(value, 10);
      if (isNaN(num) || num <= 0) {
        this.rfeSubsetSizeError = `Valore non valido: ${value}. Inserisci solo numeri interi positivi.`;
        return;
      }
      numbers.push(num);
    }

    // Check if values are in ascending order
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] <= numbers[i-1]) {
        this.rfeSubsetSizeError = 'I valori devono essere in ordine crescente.';
        return;
      }
    }

    // Check if any value exceeds the maximum allowed columns
    const maxColumns = this.getRFEMaxColumns();
    const exceedingValues = numbers.filter(num => num > maxColumns);
    
    if (exceedingValues.length > 0) {
      this.rfeSubsetSizeError = `I seguenti valori superano il numero massimo di colonne disponibili (${maxColumns}): ${exceedingValues.join(', ')}`;
      return;
    }
  }

  onRFEIncludeCovariatesChange() {
    // Re-validate subset sizes when include covariates option changes
    this.validateRFESubsetSizes();
  }

  isTestSelected(testId: string): boolean {
    return this.options.statisticalTests.includes(testId);
  }

  toggleTest(testId: string) {
    let newTests: string[];
    if (this.options.statisticalTests.includes(testId)) {
      newTests = this.options.statisticalTests.filter(t => t !== testId);
    } else {
      newTests = [...this.options.statisticalTests, testId];
    }
    this.options.statisticalTests = newTests;
  }

  onLinearRegressionChange() {
    // If standard linear regression is unchecked, also uncheck the influential points option
    if (!this.options.linearRegression) {
      this.options.linearRegressionWithoutInfluentials = false;
    }
  }

  onLinearRegressionWithoutInfluentialsChange() {
    // This method is called when the checkbox changes
    // The ngModel binding will handle the actual value change
    // This is here for potential future functionality
  }

  hasMultivariateMethodSelected(): boolean {
    return this.options.multivariateAnalysis.ridge.enabled || 
           this.options.multivariateAnalysis.lasso.enabled || 
           this.options.multivariateAnalysis.elasticNet.enabled ||
           this.options.multivariateAnalysis.randomForest.enabled ||
           this.options.multivariateAnalysis.boruta.enabled;
  }

  isValid(): boolean {
    // For classification analysis, only multivariate methods are needed
    if (this.isClassification) {
      return this.hasMultivariateMethodSelected();
    }

    // For regression analysis, check statistical tests or regression methods
    const hasTests = this.options.statisticalTests.length > 0 ||
                    this.options.linearRegression ||
                    this.hasMultivariateMethodSelected();

    // Check threshold validity if using threshold grouping
    if (this.options.groupingMethod === 'threshold') {
      // Also check that all threshold values are within the outcome range
      if (this.outcomeValues.length > 0 && this.options.thresholdValues && this.options.thresholdValues.length > 0) {
        const min = Math.min(...this.outcomeValues);
        const max = Math.max(...this.outcomeValues);
        const allInRange = this.options.thresholdValues.every(v => v > min && v < max);
        return hasTests && this.options.thresholdValues.length > 0 && !this.thresholdError && allInRange;
      }
      return false;
    }

    return hasTests;
  }

  goBack() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.navigationService.navigateToStep('preprocessing');
  }

  submitAnalysis() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Check if correlation tests are selected with grouping
    const hasCorrelations = this.options.statisticalTests.some(
      test => this.correlationTests.includes(test)
    );
    
    const hasBivariateTests = this.options.statisticalTests.some(
      test => this.bivariateTests.includes(test)
    );

    // Get sessionId and userId from preprocessing options to ensure consistency
    const sessionId = this.preprocessingInfo?.sessionId || window.sessionStorage.getItem('sessionId') || crypto.randomUUID();
    const userId = this.preprocessingInfo?.userId || window.sessionStorage.getItem('userId') || 'MasterTest';
    
    // Propagate both sessionId and userId in options
    this.dataFlowService.setAnalysisOptions({ 
      ...this.options, 
      sessionId,
      userId 
    });
    this.navigationService.updateNavigationStatus();
    this.navigationService.navigateToStep('results');
  }

  ngOnDestroy() {
    // Clean up Plotly plot
    if (this.outcomeHistogram?.nativeElement) {
      this.plotlyService.purge(this.outcomeHistogram.nativeElement);
    }
  }
}