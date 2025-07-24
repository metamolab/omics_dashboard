import { Injectable } from '@angular/core';
declare let Plotly: any;

@Injectable({
  providedIn: 'root'
})
export class PlotlyService {
  /**
   * Volcano plot: x = estimate/logFC, y = -log10(pValue)
   * labels = feature/gene
   */
  createVolcanoPlot(
    element: HTMLElement,
    x: number[],
    y: number[],
    labels: string[],
    options?: {
      title?: string;
      xaxis?: string;
      yaxis?: string;
    }
  ): Promise<any> {
    // Debug log for data validation
    console.log('Volcano plot data:', {
      pointCount: x.length,
      xRange: { min: Math.min(...x), max: Math.max(...x) },
      yRange: { min: Math.min(...y), max: Math.max(...y) }
    });

    const data = [{
      x,
      y,
      text: labels,
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: '#0284c7',
        size: 6,
        opacity: 0.7,
        line: { width: 1, color: '#0c4a6e' }
      },
      hovertemplate: '<b>%{text}</b><br>Estimate: %{x:.4f}<br>-log10(p-value): %{y:.4f}<extra></extra>'
    }];
    // Calculate axis ranges based on actual min/max for better fit
    const xMin = Math.min(...x);
    const xMax = Math.max(...x);
    const yMin = Math.min(...y);
    const yMax = Math.max(...y);

    // Add 10% padding to each side
    const xPad = (xMax - xMin) * 0.1 || 1;
    const yPad = (yMax - yMin) * 0.1 || 1;

    const layout = {
      title: options?.title || 'Volcano Plot',
      xaxis: {
        title: options?.xaxis || 'Estimate',
        zeroline: true,
        zerolinecolor: '#e2e8f0',
        range: [xMin - xPad, xMax + xPad]
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
      hovermode: 'closest'
    };
    return this.createPlot(element, data, layout);
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
