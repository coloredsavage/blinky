import { useState, useEffect } from 'react';

interface SponsorImage {
  id: string;
  type: 'image';
  imageUrl: string;
  sponsorName: string;
  duration: number;
  intensity: number;
  content: string;
}

const useLocalSponsorImages = () => {
  const [images, setImages] = useState<SponsorImage[]>([]);

  useEffect(() => {
    console.log('ðŸ–¼ï¸ Loading local sponsor images...');
    // Define the available images (you can expand this list)
    const availableImages = [
      'eyJidWNrZXQiOiJhcmVuYV9pbWFnZXMiLCJrZXkiOiIxODk1ODA0Ni9vcmlnaW5hbF8xN2VjNjk1MDFlMzA5YmExM2E4NTc4NWVkN2QwNGFkZi5qcGciLCJlZGl0cyI6eyJyZXNpemUiOnsid2lkdGgiOjYwMCwiaGVpZ2h0Ijo2MDAsImZpdCI6Imluc2lkZSIsIndpdGhvdXRFbmxhcmdlbWVudCI6dHJ1ZX0sIndlYnA.jpg',
      'eyJidWNrZXQiOiJhcmVuYV9pbWFnZXMiLCJrZXkiOiIyMjc1MDgzMy9vcmlnaW5hbF8xN2FiYTJmYjFlMDIyOWI0YmVlY2UxZTczNDllMTIzOC5qcGciLCJlZGl0cyI6eyJyZXNpemUiOnsid2lkdGgiOjYwMCwiaGVpZ2h0Ijo2MDAsImZpdCI6Imluc2lkZSIsIndpdGhvdXRFbmxhcmdlbWVudCI6dHJ1ZX0sIndlYnA.jpg',
      'original_3876ef94105fdbaf82a15d28f25dbe0d.jpg',
      'original_74b976150c0dbe7bd3b4acc156995519.jpg',
      'showsimages1.gif',
      'snake-show-32.gif',
      'snake-shows-8.gif'
    ];

    const sponsorImages: SponsorImage[] = availableImages.map((filename, index) => ({
      id: `local_${index}`,
      type: 'image',
      imageUrl: `/sponsors/${filename}`,
      sponsorName: `Sponsor ${index + 1}`,
      duration: 3000 + (index * 500), // Vary duration
      intensity: Math.min((index + 1) * 1.5, 10), // Scale intensity 1-10
      content: `Advertisement ${index + 1}`
    }));

    console.log('âœ… Loaded sponsor images:', sponsorImages);
    setImages(sponsorImages);
  }, []);

  return images;
};

export default useLocalSponsorImages;