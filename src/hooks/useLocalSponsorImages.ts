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
    console.log('🖼️ Loading local sponsor images from public/sponsors/...');
    
    // Use public folder images + test images
    const sponsorImages: SponsorImage[] = [
      {
        id: 'local_0',
        type: 'image',
        imageUrl: '/sponsors/01.jpg',
        sponsorName: 'Custom Sponsor 1',
        duration: 3000,
        intensity: 1,
        content: 'Your Advertisement 1'
      },
      {
        id: 'local_1',
        type: 'image',
        imageUrl: '/sponsors/02.jpg',
        sponsorName: 'Custom Sponsor 2',
        duration: 3500,
        intensity: 2,
        content: 'Your Advertisement 2'
      },
      {
        id: 'local_2',
        type: 'image',
        imageUrl: '/sponsors/03.jpg',
        sponsorName: 'Custom Sponsor 3',
        duration: 4000,
        intensity: 3,
        content: 'Your Advertisement 3'
      },
      {
        id: 'local_3',
        type: 'image',
        imageUrl: '/sponsors/04.jpg',
        sponsorName: 'Custom Sponsor 4',
        duration: 4500,
        intensity: 4,
        content: 'Your Advertisement 4'
      },
      // Add test images that are guaranteed to work
      {
        id: 'test_0',
        type: 'image',
        imageUrl: 'https://via.placeholder.com/300x200/ff6b6b/white?text=AD+1',
        sponsorName: 'Test Sponsor A',
        duration: 2000,
        intensity: 1,
        content: 'Test Advertisement A'
      },
      {
        id: 'test_1',
        type: 'image',
        imageUrl: 'https://via.placeholder.com/300x200/4ecdc4/white?text=AD+2',
        sponsorName: 'Test Sponsor B',
        duration: 2500,
        intensity: 2,
        content: 'Test Advertisement B'
      }
    ];

    console.log('✅ Loaded sponsor images:', sponsorImages);
    console.log('📷 Image URLs:', sponsorImages.map(img => ({ id: img.id, url: img.imageUrl })));
    setImages(sponsorImages);
  }, []);

  return images;
};

export default useLocalSponsorImages;