// Fixed categorical order — never cycle/reassign per the dataviz skill.
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const CHART_TEXT = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781' };
export const CHART_GRID = '#e1e0d9';
export const CHART_AXIS = '#c3c2b7';

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export const tooltipStyle = {
  contentStyle: {
    background: '#fcfcfb',
    border: '1px solid #e1e0d9',
    borderRadius: 8,
    fontSize: 12,
    padding: '8px 10px',
  },
  labelStyle: { color: '#52514e', fontWeight: 600, marginBottom: 2 },
};
