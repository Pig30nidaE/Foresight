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
        borderColor: '#d97706',
        backgroundColor: 'rgba(217,119,6,0.12)',
        borderWidth: 2,
        pointRadius: cpList.map((_, i) => (i === currentMove ? 5 : 0)),
        pointHoverRadius: 5,
        pointBackgroundColor: cpList.map((_, i) => (i === currentMove ? '#dc2626' : '#d97706')),
        pointBorderColor: cpList.map((_, i) => (i === currentMove ? '#1a1714' : '#1a1714')),
        pointBorderWidth: 1,
        tension: 0,
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
        grid: { color: 'rgba(185,189,180,0.55)', lineWidth: 1 },
        border: { display: true, color: '#b9bdb4' },
      },
    },
    elements: {
      point: {
        hoverRadius: 5,
      },
      line: {
        borderJoinStyle: 'miter' as const,
      },
    },
  } as const;

  return (
    <div style={{ width: '100%', height: 180 }}>
      <Line data={data} options={options} height={180} />
    </div>
  );
}
