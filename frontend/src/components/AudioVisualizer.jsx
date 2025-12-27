import React, { useEffect, useRef } from 'react';

/**
 * AudioVisualizer Component
 * 
 * Renders a real-time frequency bar graph using the Web Audio API.
 * Connects to an AnalyserNode and draws the frequency data onto a canvas.
 * 
 * @param {Object} props
 * @param {AnalyserNode} props.analyser - The Web Audio API AnalyserNode to visualize
 * @param {number} [props.width=200] - Canvas width
 * @param {number} [props.height=40] - Canvas height
 * @param {string} [props.className] - Additional CSS classes
 */
const AudioVisualizer = ({ analyser, width = 200, height = 40, className = '' }) => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);

    useEffect(() => {
        if (!analyser || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationRef.current = requestAnimationFrame(draw);

            // Get frequency data (0-255)
            analyser.getByteFrequencyData(dataArray);

            const w = canvas.width;
            const h = canvas.height;

            ctx.clearRect(0, 0, w, h);

            // Calculate bar width based on canvas width and number of frequency bins
            const barWidth = (w / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                // Scale bar height to fit canvas
                barHeight = (dataArray[i] / 255) * h;

                // Create gradient for the bars
                const gradient = ctx.createLinearGradient(0, h, 0, h - barHeight);
                gradient.addColorStop(0, '#10b981'); // emerald-500
                gradient.addColorStop(1, '#34d399'); // emerald-400

                ctx.fillStyle = gradient;
                
                // Draw rounded bar
                ctx.beginPath();
                ctx.roundRect(x, h - barHeight, barWidth, barHeight, [2, 2, 0, 0]);
                ctx.fill();

                x += barWidth + 1;
            }
        };

        draw();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [analyser]);

    return (
        <canvas 
            ref={canvasRef} 
            width={width} 
            height={height} 
            className={`opacity-80 ${className}`}
        />
    );
};

export default AudioVisualizer;
