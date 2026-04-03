import type { ColorName } from './chess';

type Rgb = readonly [number, number, number];

const gaugeRgb: Record<ColorName, Rgb> = {
    White: [255, 255, 255],
    Black: [85, 85, 85],
    Red: [220, 20, 60],
    Blue: [65, 105, 225],
    Gold: [218, 165, 32],
    Pink: [255, 192, 203],
    Green: [0, 128, 0],
};

const chartLineRgb: Record<ColorName, Rgb> = {
    White: [176, 176, 176],
    Black: [68, 68, 68],
    Red: [220, 20, 60],
    Blue: [65, 105, 225],
    Gold: [184, 134, 11],
    Pink: [219, 112, 147],
    Green: [46, 139, 87],
};

const chartFillAlpha: Record<ColorName, number> = {
    White: 0.75,
    Black: 0.3,
    Red: 0.3,
    Blue: 0.3,
    Gold: 0.35,
    Pink: 0.45,
    Green: 0.3,
};

function cssColor(rgb: Rgb, alpha?: number) {
    if (alpha === undefined) return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function gaugeSideColors(colors: { first: ColorName; second: ColorName }) {
    return {
        first: cssColor(gaugeRgb[colors.first]),
        second: cssColor(gaugeRgb[colors.second]),
    };
}

export function analysisChartZone(color: ColorName) {
    return {
        color: cssColor(chartLineRgb[color]),
        fillColor: cssColor(gaugeRgb[color], chartFillAlpha[color]),
    };
}
