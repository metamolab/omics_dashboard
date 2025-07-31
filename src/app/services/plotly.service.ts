import { Injectable } from '@angular/core';
declare let Plotly: any;

@Injectable({
  providedIn: 'root'
})
export class PlotlyService {
  /**
   * Manhattan plot: x = feature/gene names, y = -log10(pValue)
   * Generalized for any test result structure
   */
  createManhattanPlot(
    element: HTMLElement,
    data: any[],
    options?: {
      title?: string;
      xaxis?: string;
      yaxis?: string;
      significanceLine?: boolean;
      significanceThreshold?: number;
      variableColumn?: string;
      pValueColumn?: string;
    }
  ): Promise<any> {
    // Determine column names dynamically
    const variableColumn = options?.variableColumn || 'variable';
    const pValueColumn = options?.pValueColumn || 'pValue';
    
    // Extract variables and p-values
    const variables = data.map(row => row[variableColumn]?.toString() || 'Unknown');
    const pValues = data.map(row => Number(row[pValueColumn]));
    const y = pValues.map(p => -Math.log10(p));
    
    // Create dynamic tooltips with all available columns
    const tooltips = data.map(row => {
      const lines: string[] = [];
      Object.entries(row).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          let formattedValue = value;
          // Format numeric values appropriately
          if (typeof value === 'number' && !isNaN(value)) {
            if (key.toLowerCase().includes('pvalue') || key.toLowerCase().includes('fdr') || 
                key.toLowerCase().includes('pval') || key.toLowerCase().includes('padj')) {
              formattedValue = value.toExponential(2);
            } else {
              formattedValue = value.toFixed(4);
            }
          }
          lines.push(`${key}: ${formattedValue}`);
        }
      });
      return lines.join('<br>');
    });

    // Debug log for data validation
    console.log('Manhattan plot data:', {
      pointCount: variables.length,
      variableCount: new Set(variables).size,
      yRange: { min: Math.min(...y), max: Math.max(...y) },
      availableColumns: Object.keys(data[0] || {}),
      variableColumn,
      pValueColumn
    });

    const plotData = [{
      x: variables,
      y,
      text: tooltips,
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: '#0284c7',
        size: 6,
        opacity: 0.7,
        line: { width: 1, color: '#0c4a6e' }
      },
      hovertemplate: '<b>%{text}</b><extra></extra>'
    }];

    // Calculate y-axis range
    const yMin = Math.min(...y);
    const yMax = Math.max(...y);
    const yPad = (yMax - yMin) * 0.1 || 1;

    const layout = {
      title: options?.title || 'Manhattan Plot',
      xaxis: {
        title: options?.xaxis || 'Variables',
        showticklabels: false, // Hide individual variable names as they would be too crowded
        zeroline: false
      },
      yaxis: {
        title: options?.yaxis || '-log10(p-value)',
        zeroline: true,
        zerolinecolor: '#e2e8f0',
        range: [Math.max(0, yMin - yPad), yMax + yPad]
      },
      margin: { t: 60, r: 40, b: 60, l: 60 },
      font: { family: 'Arial, sans-serif' },
      plot_bgcolor: '#f8fafc',
      paper_bgcolor: '#ffffff',
      height: 400,
      showlegend: false,
      hovermode: 'closest',
      shapes: options?.significanceLine ? [{
        type: 'line',
        x0: 0,
        x1: variables.length - 1,
        y0: options?.significanceThreshold || -Math.log10(0.05),
        y1: options?.significanceThreshold || -Math.log10(0.05),
        line: {
          color: 'red',
          width: 2,
          dash: 'dot'
        }
      }] : []
    };
    return this.createPlot(element, plotData, layout);
  }
  
  createPlot(
    element: HTMLElement, 
    data: any[], 
    layout?: any, 
    config?: any
  ): Promise<any> {
    const defaultLayout = {
      margin: { t: 40, r: 40, b: 40, l: 40 },
      font: { family: 'Arial, sans-serif' },
      plot_bgcolor: '#f8fafc',
      paper_bgcolor: '#ffffff',
      ...layout
    };

    const defaultConfig = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
      ...config
    };

    return Plotly.newPlot(element, data, defaultLayout, defaultConfig);
  }

  updatePlot(element: HTMLElement, data: any[], layout?: any): Promise<any> {
    return Plotly.react(element, data, layout);
  }

  purge(element: HTMLElement): void {
    Plotly.purge(element);
  }

  // Helper methods for common plot types
  createScatterPlot(
    element: HTMLElement,
    x: number[],
    y: number[],
    options?: {
      title?: string;
      xaxis?: string;
      yaxis?: string;
      mode?: string;
    }
  ): Promise<any> {
    const data = [{
      x,
      y,
      mode: options?.mode || 'markers',
      type: 'scatter',
      marker: { 
        color: '#0284c7',
        size: 8
      }
    }];

    const layout = {
      title: options?.title || '',
      xaxis: { title: options?.xaxis || '' },
      yaxis: { title: options?.yaxis || '' }
    };

    return this.createPlot(element, data, layout);
  }

  createHistogram(
    element: HTMLElement,
    values: number[],
    options?: {
      title?: string;
      xaxis?: string;
      yaxis?: string;
      nbins?: number;
    }
  ): Promise<any> {
    const data = [{
      x: values,
      type: 'histogram',
      nbinsx: options?.nbins || 20,
      marker: {
        color: '#0284c7'
      }
    }]

    const layout = {
      title: options?.title || '',
      xaxis: { title: options?.xaxis || '' },
      yaxis: { title: options?.yaxis || 'Frequenza' }
    };

    return this.createPlot(element, data, layout);
  }

  createOutcomePreviewHistogram(
    element: HTMLElement,
    values: number[],
    options?: {
      title?: string;
      xaxis?: string;
      yaxis?: string;
      nbins?: number;
    }
  ): Promise<any> {
    const data = [{
      x: values,
      type: 'histogram',
      nbinsx: options?.nbins || 20,
      marker: {
        color: '#0284c7'
      }
    }];
    
    const tertile1 = values[Math.floor(values.length / 3)];
    const tertile2 = values[Math.floor(2 * values.length / 3)];

    const layout = {
      title: options?.title || '',
      xaxis: { title: options?.xaxis || '' },
      yaxis: { title: options?.yaxis || 'Frequenza' },
      shapes: [
        {
          type: 'line',
          x0: tertile1,
          x1: tertile1,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: {
            color: 'red',
            width: 2,
            dash: 'dot',
          },
        },
        {
          type: 'line',
          x0: tertile2,
          x1: tertile2,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: {
            color: 'green',
            width: 2,
            dash: 'dot',
          },
        },
      ]
    };

    return this.createPlot(element, data, layout);
  }

  createBoxPlot(
    element: HTMLElement,
    data: { name: string; values: number[] }[],
    options?: {
      title?: string;
      yaxis?: string;
    }
  ): Promise<any> {
    const traces = data.map(group => ({
      y: group.values,
      name: group.name,
      type: 'box',
      marker: { color: '#0284c7' }
    }));

    const layout = {
      title: options?.title || '',
      yaxis: { title: options?.yaxis || '' }
    };

    return this.createPlot(element, traces, layout);
  }

  createHeatmap(
    element: HTMLElement,
    z: number[][],
    options?: {
      title?: string;
      xLabels?: string[];
      yLabels?: string[];
    }
  ): Promise<any> {
    const data = [{
      z,
      x: options?.xLabels,
      y: options?.yLabels,
      type: 'heatmap',
      colorscale: 'Blues'
    }];

    const layout = {
      title: options?.title || ''
    };

    return this.createPlot(element, data, layout);
  }
}
