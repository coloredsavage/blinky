
import { useState, useEffect } from 'react';

const useBestScore = () => {
    const [bestScore, setBestScore] = useState<number>(0);

    useEffect(() => {
        const savedScore = localStorage.getItem('blinkyBestScore');
        if (savedScore) {
            setBestScore(parseInt(savedScore, 10));
        }
    }, []);

    const updateBestScore = (newScore: number) => {
        localStorage.setItem('blinkyBestScore', newScore.toString());
        setBestScore(newScore);
    };

    return { bestScore, setBestScore: updateBestScore };
};

export default useBestScore;
