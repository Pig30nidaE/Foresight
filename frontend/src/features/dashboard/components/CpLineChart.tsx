import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js';
import React from 'react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

interface CpLineChartProps {
  cpList: number[];
  currentMove: number;
}

export default function CpLineChart({ cpList, currentMove }: CpLineChartProps) {
  const data = {
    labels: cpList.map((_, i) => i + 1),
    datasets: [
      {
        label: 'CP 변화',
        data: cpList,
        fill: true,
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251,191,36,0.08)',
        pointRadius: cpList.map((_, i) => (i === currentMove ? 6 : 2)),
        pointBackgroundColor: cpList.map((_, i) => (i === currentMove ? '#ef4444' : '#fbbf24')),
        pointBorderColor: cpList.map((_, i) => (i === currentMove ? '#ef4444' : '#fbbf24')),
        tension: 0.25,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        display: true,
        title: { display: true, text: 'CP' },
        grid: { color: 'rgba(0,0,0,0.08)' },
      },
    },
    elements: {
      point: {
        hoverRadius: 8,
      },
    },
  } as const;

  return (
    <div style={{ width: '100%', height: 180 }}>
      <Line data={data} options={options} height={180} />
    </div>
  );
}
